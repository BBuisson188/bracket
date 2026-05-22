# Handoff: Retreat Ping-Pong Tournament Control App

## Project summary

This app is for Beau Buisson to run a casual ping-pong tournament at a men's retreat. The tournament is intentionally fun and low-pressure, not a highly competitive formal event. The most important goal is to finish early and avoid operational stress.

The app is a static offline-first web app. It should run by opening `index.html` in a browser. It does not require a build step, server, login, or internet access. Optional Firebase sync is included only as a manual snapshot push/refresh system.

## Core product philosophy

The app is not primarily a bracket display. It is a tournament control board.

It should help one organizer and one helper keep matches moving in a retreat environment where:

- player count is unknown until signup closes
- table count may be 1, 2, 3, or 4
- people wander off
- matches vary in speed
- the tournament spans Friday and Saturday windows
- the organizer does not want to start a game right before the Friday cutoff
- the organizer wants to finish early rather than make every game more competitive

The app should remain human-controlled. It should recommend and warn, not over-automate.

## User priorities from planning conversation

These are the user's explicit/strong preferences:

1. The tournament must finish early if possible.
2. The feel should be fun, not overly competitive.
3. Single elimination is preferred.
4. No best-of-3 matches.
5. Game formats should be first to 11, first to 15, or first to 21.
6. If there are lots of players, most/all games can be to 11, with semifinals/finals to 21 when safe.
7. If there are fewer players, more games can be to 21.
8. Signup order determines seed order.
9. First signup is Seed #1; last signup is lowest seed.
10. Highest seeds get first-round byes when byes are needed.
11. Highest seed that plays should play the lowest seed, and so forth.
12. The app should show current games at the top, then on-deck games, then later available games.
13. Organizer must be able to delay a game and prioritize a later available game if both players are ready.
14. Warmup must be a separate state with a countdown timer.
15. Warmup countdown reaching zero must NOT automatically start the game.
16. Organizer must still click Start Game manually.
17. Test mode must include real timers and buttons, not just fake instant simulation.
18. Test mode exists to verify implementation reliability, button flows, timer behavior, bracket generation, and queue logic.
19. Friday and Saturday sessions must be understood by the app.
20. The app should avoid starting a match that is likely to run past the Friday end time.
21. Helper/viewer screen should make it easy to answer “when am I playing?”
22. Optional sync should be manual push/refresh, not automatic real-time sync.
23. Master/control device is authoritative.
24. Helper device should generally be read-only.
25. Firebase sync should never be required for the tournament to function.

## Architecture

### Files

- `index.html` - static app shell, bottom navigation, app icon/manifest links
- `styles.css` - CSS for mobile/tablet-friendly cards and controls
- `core.js` - pure logic helpers, no DOM dependency
- `app.js` - state management, rendering, timers, event handlers, optional sync
- `README.md` - simple user/developer overview
- `QA_CHECKLIST.md` - manual QA checklist for Beau before the retreat
- `firebase-rules-example.json` - old/basic demo Realtime Database rules; app now uses Firestore, so do not treat this as current production guidance
- `site.webmanifest` - web app manifest for install/home-screen behavior
- `assets/` - favicon, Apple touch icons, and web app icons
- `tests/core-smoke-test.js` - Node smoke test for bracket logic

### No framework

The app intentionally uses vanilla HTML/CSS/JavaScript to reduce moving parts and make it easy to run offline.

No React, no npm install, no bundler, no Firebase SDK.

### State storage

The app stores local state in browser `localStorage` under:

```text
retreatPingPongTournament.v1
```

The state object contains:

- setup settings
- player text
- parsed players
- selected tournament option
- bracket matches
- table state
- clock/test mode state
- Firestore sync settings
- UI-only state such as collapsed bracket rounds
- event history

### Authoritative master model

The intended live-event model:

- Master device runs the tournament.
- Master can start warmups, start games, finish matches, prioritize, delay, and undo.
- Viewer/helper device uses Overview, Bracket, and Sync/QA only.
- Viewer should not control tournament state.

This avoids conflict resolution and protects against accidental multi-device edits.

## Core logic details

### Bracket generation

Bracket generation is in `core.js`.

Main functions:

- `nextPowerOfTwo(n)`
- `seedOrder(size)`
- `parsePlayers(text)`
- `buildBracket(players, option)`
- `propagateWinners(matches)`
- `orderedReadyMatches(matches, currentSessionId)`

The seeding order uses standard high-vs-low bracket placement.

For example, a 16-size bracket uses:

```text
1 vs 16
8 vs 9
4 vs 13
5 vs 12
2 vs 15
7 vs 10
3 vs 14
6 vs 11
```

If actual players are fewer than the bracket size, missing seeds are treated as byes. The highest seeds receive byes naturally because their opponent slots are above the actual player count.

Example with 10 players in a 16-size bracket:

- Seed 1 gets a bye over missing seed 16.
- Seed 2 gets a bye over missing seed 15.
- Seed 3 gets a bye over missing seed 14.
- Seed 4 gets a bye over missing seed 13.
- Seed 5 gets a bye over missing seed 12.
- Seed 6 gets a bye over missing seed 11.
- Seed 8 plays Seed 9.
- Seed 7 plays Seed 10.

This matches Beau's requirement that top seeds get byes and high seeds face low seeds.

### Tournament options

Tournament options are generated by `generateTournamentOptions(players, settings)`.

Current options:

1. Fast / Safest
2. Balanced
3. Relaxed

Each option assigns round formats as 11, 15, or 21 points.

The options are now generated from the configured player count, table count, Friday/Saturday windows, buffers, warmup, transition, and game duration assumptions. They are not fixed templates anymore.

Important current rules:

- Every match in a given round uses the same point target.
- Later rounds must never be shorter than earlier rounds.
- The championship/final is always first to 21.
- Semifinals are always at least first to 15.
- Fast / Safest aims close to 3 hours without going over.
- Balanced aims around 3 hours to 3 hours 10 minutes when the schedule allows.
- Relaxed aims close to the full usable schedule window.

The generator searches possible monotonic round-format combinations and chooses the closest safe fit for each option. This was added because the fixed templates were too conservative for some realistic setups.

This is intentionally recommendation-based, not fully automatic irreversible scheduling.

### Match timing assumptions

Default assumptions:

- 11-point game: 7 minutes
- 15-point game: 10 minutes
- 21-point game: 14 minutes
- standard warmup: 2 minutes
- relaxed/ahead warmup: 4 minutes
- transition: 1 minute
- late-start buffer: 10 minutes
- end buffer / soft cutoff: 15 minutes

These can be edited on Setup.

### Friday/Saturday session handling

Sessions are configured on Setup:

- Friday date, start, end
- Saturday date, start, end

The app calculates a soft end by subtracting the end buffer from the session end. Example:

- Friday hard end: 3:00 PM
- End buffer: 15 minutes
- Friday soft end: 2:45 PM

When a match is ready, the app estimates whether it is safe to start. It categorizes it as:

- safe
- tight
- unsafe

Unsafe means projected finish is likely after the hard session end. The app recommends holding that match for the next session.

The app should warn, not forcibly prevent the organizer from overriding. There is a Start Anyway button.

### Estimated schedule behavior

Estimated match times are shared across Control, Overview, Bracket, and player search. Avoid creating separate estimators for separate screens.

Current estimate behavior:

- Before the configured Friday session starts, future estimates begin at Friday start time, not at the current device time.
- During an active session, active games use the current device/test clock.
- Future queued matches are assigned to the next available table.
- Matches are rolled to the next configured session if they would cross the soft cutoff.
- The soft cutoff is calculated from session end minus the end buffer.
- Estimates are directional and useful for planning, but still intentionally approximate.

The Control screen also shows active-match pace information:

- expected duration
- projected finish
- whether the game is on pace, has minutes left, or is over estimate

### Rendering / refresh behavior

Do not restore the old full-page periodic render loop. The app used to call `render()` every few seconds while running, but that caused setup textareas and bracket horizontal scroll to jump back to the top/left.

Current behavior:

- `tickClock()` updates the header clock, timers, and active pace text in place.
- Full `render()` should happen only after explicit state changes, navigation, imports/pulls, or button actions.

### Match states

Important match statuses:

- `waiting` - missing one or both players because prior match results are not known yet
- `ready` - both players known and eligible to start
- `delayed` - intentionally pushed down the queue
- `warming` - assigned to a table with warmup countdown running
- `playing` - game started and game timer running upward
- `complete` - winner selected

Byes are represented as completed matches with `isBye: true`.

### Bracket view behavior

The bracket view is operational, not a perfect printed tournament-tree renderer.

Current visual behavior:

- Rounds display as horizontally scrollable columns.
- Earlier rounds can be progressively collapsed.
- Only the earliest open round can be collapsed next.
- Collapsing an earlier round pulls later visible rounds upward/together.
- First-round byes are hidden as fake match cards and shown in a separate byes summary block.
- Future unresolved slots display labels such as `Winner of Match 17` instead of plain `TBD`.
- Active matches are highlighted.
- The visual layout tries to account for hidden bye feeders without allowing same-round cards to overlap.

Because bye-heavy brackets can get visually complicated, any future bracket changes should be tested with several player counts, especially 10, 19, 21, 24, 26, and 30 players, plus both expanded and collapsed rounds on desktop and iPad/phone widths.

### Warmup and game flow

Expected flow:

1. Match appears in On Deck.
2. Organizer clicks Start Warmup.
3. Warmup countdown starts.
4. When warmup hits zero, it displays ready, but does not start automatically.
5. Organizer clicks Start Game.
6. Game timer runs upward.
7. Organizer clicks the winner button.
8. Match completes, table is freed, winner advances.

### Prioritize / delay flow

The organizer can:

- prioritize a ready match
- delay a ready match
- delay until tomorrow
- release a held match by prioritizing it

The queue sorting prioritizes manual priority first, then earlier round, then bracket order.

### Test mode

Test mode is a full QA mode.

It uses the same state, same UI, same timers, same bracket logic, same cutoff logic, and same buttons as the real tournament.

Only the clock speed changes.

Setup option:

- Test Mode checkbox
- Test speed, such as 10x or 60x

Sync/QA screen includes:

- Jump to Friday Start
- Jump Near Friday Cutoff
- Jump to Saturday Start
- Test: Start/Finish Next

The Test: Start/Finish Next button either starts the next ready warmup or randomly finishes the first active match. It is only for fast clicking during QA.

The user specifically wanted timers still active in test mode because they want to verify:

- warmup timer works
- start game button works
- game timer works
- buttons advance the bracket correctly
- names load correctly
- queue updates correctly
- Friday/Saturday cutoff behavior works

## Optional Firebase sync

Firebase sync is manual snapshot sync.

It does not use realtime listeners.
It does not use Firebase SDK.
It uses Cloud Firestore REST endpoints in Beau's existing Firebase project:

```text
beau-games
```

The app is still fully offline-first. Firestore is only an optional transport for manual snapshots.

### Push behavior

Master device pushes the whole app snapshot with a Firestore REST PATCH to:

```text
projects/beau-games/databases/(default)/documents/tournaments/{tournamentId}
```

The Firestore document contains:

- `name`
- `updatedAt`
- `state`

The `state` field is a JSON string containing the full local app state. This keeps Firestore REST handling simple and avoids converting every nested tournament field into Firestore typed-value objects.

The main master workflow is the **Update Database** button on the Control screen.

### Refresh behavior

Viewer/helper device fetches the selected Firestore tournament document and replaces local state with the snapshot.

The main helper workflow:

1. Go to Sync / QA.
2. Click Refresh Tournament List.
3. Choose the tournament from the dropdown.
4. Click Retrieve Database.
5. Use Overview or Bracket.
6. Click Retrieve Database again when the helper needs a fresh snapshot.

Overview and Bracket also include a Retrieve Database button.

### Tournament naming

Setup includes a Tournament name field. The app converts that name into a Firestore document id, for example:

```text
Men's Retreat 2026 -> mens-retreat-2026
```

There is not yet a robust preflight duplicate-name validator. Firestore update currently overwrites the same document id. This is acceptable for the intended one-master workflow but should be improved if multiple simultaneous test tournaments are common.

### Delete behavior

The UI includes Delete From Firestore for cleanup during testing. This will only work if Firestore rules allow deletes for `tournaments/{tournamentId}`.

The user's previously confirmed rules had:

```js
allow delete: if false;
```

With those rules, the delete button is expected to fail with a clear Firestore error. This is safer for the event. Temporarily enabling delete may be convenient during testing.

### Why this design

The venue internet may be unreliable. The tournament must work without internet. Sync is only a convenience to let a helper see updated overview information.

### Security note

The current Firestore approach has no Firebase Auth/login. Rules are intentionally permissive enough for a low-stakes temporary event. This is not a production security model.

## Known limitations / areas for Codex improvement

This is a complete first packaged build, but these are the areas most worth checking or improving in Codex:

1. **UI polish on actual iPad/phone sizes**
   - Test in Safari on iPad/iPhone if that is the likely event device.
   - Make sure bottom tabs are easy to tap.

2. **Bracket visual density**
   - The bracket is a horizontally scrollable operational bracket with progressive round collapse.
   - Bye-heavy layouts are the highest-risk visual area.
   - Test collapsed and expanded states with common player counts before changing layout math.

3. **Viewer role enforcement**
   - The UI disables Setup and Control tabs in viewer mode.
   - For local files, this is a convenience guard, not true security.

4. **Undo behavior**
   - Undo Last Result clears the most recent played match and attempts to clear downstream dependencies.
   - This should be tested carefully with several rounds completed.

5. **Session/date edge cases**
   - The app assumes actual Friday and Saturday dates are entered.
   - In real mode, if dates are wrong, cutoff logic will be wrong.
   - Test mode is safer because it uses the configured test clock.

6. **Start Anyway behavior**
   - Unsafe matches can be overridden.
   - This is intentional because Beau wants human control.

7. **Estimated start times**
   - Estimates are directional, not precise.
   - This is intentional. Human behavior is the dominant variable.
   - Estimates should be shared across screens through the same estimate source.

8. **Firestore sync**
   - Uses Firestore REST in project `beau-games`, collection `tournaments`.
   - Manual push/pull only.
   - No realtime listeners.
   - No Firebase SDK.
   - No Firebase Auth.
   - Delete depends on Firestore rules.

9. **GitHub publishing**
   - Beau usually tests on the published GitHub Pages version from phone/iPad.
   - After code changes, provide a normal PowerShell copy/paste block:

```powershell
cd "C:\Users\bbuis\Local Docs\Codex\ping_pong_tourn"

git add .
git commit -m "Short useful message"
git push
```

   - This environment often cannot write to `.git`, so Beau may need to run publish commands manually.

10. **App icons**
   - `index.html` references favicon, PNG favicons, Apple touch icons, and `site.webmanifest`.
   - Kept icon files are in `assets/`.
   - Old generated extras were intentionally removed/marked for deletion previously.

## QA instructions for Codex

Run the smoke test:

```bash
cd ping-pong-retreat-tournament
node tests/core-smoke-test.js
```

Open the app locally:

```bash
python -m http.server 8080
```

Then test in browser at:

```text
http://localhost:8080
```

Important manual QA scenarios are listed in `QA_CHECKLIST.md`.

## Important user style preference

Beau is not deeply technical and wants practical, clear instructions. He has specifically expressed concern about overconfident implementation claims and hidden bugs. When handing this app back to him, be honest about what was tested and what still needs manual QA.

Avoid telling him something is guaranteed. Use wording like:

- “This has been packaged and smoke-tested.”
- “The important next step is to run through the QA checklist on the actual device you plan to use.”
- "The app is designed to work offline, but Firestore sync depends on internet access and the configured Firebase project/rules."

## Current build status

- Static files created.
- Core JavaScript syntax checked with Node.
- App JavaScript syntax checked with Node.
- Core smoke test passed for player counts 2 through 32.
- Firestore manual sync has been implemented and tested at least once by Beau.
- Tournament options now use adaptive monotonic round formats.
- Bracket view has progressive collapse, hidden bye summary, active highlights, and winner-of-match placeholders.
- App icons and web manifest have been added.
- Core smoke test passed for player counts 2 through 32.
