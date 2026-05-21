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

- `index.html` - static app shell and bottom navigation
- `styles.css` - CSS for mobile/tablet-friendly cards and controls
- `core.js` - pure logic helpers, no DOM dependency
- `app.js` - state management, rendering, timers, event handlers, optional sync
- `README.md` - simple user/developer overview
- `QA_CHECKLIST.md` - manual QA checklist for Beau before the retreat
- `firebase-rules-example.json` - basic demo Realtime Database rules
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
- Firebase settings
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

The recommendation prioritizes finishing early. It may recommend Balanced or Relaxed only when timing estimates leave enough room.

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

### Match states

Important match statuses:

- `waiting` - missing one or both players because prior match results are not known yet
- `ready` - both players known and eligible to start
- `delayed` - intentionally pushed down the queue
- `warming` - assigned to a table with warmup countdown running
- `playing` - game started and game timer running upward
- `complete` - winner selected

Byes are represented as completed matches with `isBye: true`.

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
It uses Realtime Database REST endpoints.

### Push behavior

Master device pushes the whole app snapshot with HTTP PUT to:

```text
<databaseUrl>/tournaments/<tournamentKey>.json
```

### Refresh behavior

Viewer/helper device fetches the same URL and replaces local state with the snapshot.

### Why this design

The venue internet may be unreliable. The tournament must work without internet. Sync is only a convenience to let a helper see updated overview information.

### Security note

The included `firebase-rules-example.json` has public read/write rules for simplicity. That is acceptable only for a low-stakes temporary event database with a non-obvious tournament key. For production use, add authentication and stricter rules.

## Known limitations / areas for Codex improvement

This is a complete first packaged build, but these are the areas most worth checking or improving in Codex:

1. **UI polish on actual iPad/phone sizes**
   - Test in Safari on iPad/iPhone if that is the likely event device.
   - Make sure bottom tabs are easy to tap.

2. **Bracket visual density**
   - The bracket is currently a horizontal scroll list by round, not a drawn bracket tree.
   - Operationally this is fine, but a prettier bracket could be added.

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

8. **Firebase REST configuration**
   - Requires a Realtime Database URL, not a Firestore URL.
   - Make this clearer in any future UI copy if needed.

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
- “The app is designed to work offline, but Firebase sync depends on internet access and Realtime Database configuration.”

## Current build status

- Static files created.
- Core JavaScript syntax checked with Node.
- App JavaScript syntax checked with Node.
- Core smoke test passed for player counts 2 through 32.
- Zip package should include all project files.

