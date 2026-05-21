# QA Checklist for Retreat Ping-Pong Tournament App

Use this checklist before the retreat on the actual device you plan to use if possible.

## 1. Basic load test

- [ ] Open `index.html` in the browser.
- [ ] Confirm Setup screen appears.
- [ ] Confirm bottom navigation appears.
- [ ] Confirm the app clock appears in the top right.
- [ ] Confirm no internet is needed to load the app.

## 2. Setup test with 10 players

- [ ] Turn Test Mode ON.
- [ ] Set test speed to 10x or 60x.
- [ ] Click Load 10.
- [ ] Set tables to 1.
- [ ] Click Generate Tournament Options.
- [ ] Confirm 3 options appear.
- [ ] Confirm one option is marked Recommended.
- [ ] Start tournament.
- [ ] Go to Bracket.
- [ ] Confirm Seed #1 received a bye.
- [ ] Confirm high seeds received byes.
- [ ] Confirm some first-round games are ready.

## 3. Setup test with 16 players

- [ ] Reset tournament.
- [ ] Load 16 players.
- [ ] Set tables to 2.
- [ ] Generate options.
- [ ] Start tournament.
- [ ] Confirm there are no first-round byes.
- [ ] Confirm first round pairs high vs low seeds.
- [ ] Confirm multiple ready matches appear.

Expected first-round structure for 16:

- [ ] 1 vs 16
- [ ] 8 vs 9
- [ ] 4 vs 13
- [ ] 5 vs 12
- [ ] 2 vs 15
- [ ] 7 vs 10
- [ ] 3 vs 14
- [ ] 6 vs 11

## 4. Setup test with 24 players

- [ ] Reset tournament.
- [ ] Load 24 players.
- [ ] Set tables to 2.
- [ ] Generate options.
- [ ] Start tournament.
- [ ] Confirm some top seeds receive byes.
- [ ] Confirm On Deck list is populated.
- [ ] Confirm Available Later list is populated.

## 5. Setup test with 30 players

- [ ] Reset tournament.
- [ ] Load 30 players.
- [ ] Set tables to 4.
- [ ] Generate options.
- [ ] Start tournament.
- [ ] Confirm only a small number of byes exist.
- [ ] Confirm several games can be started.
- [ ] Confirm the table display shows 4 tables.

## 6. Warmup timer test

- [ ] Go to Control.
- [ ] Click Start Warmup on an On Deck match.
- [ ] Confirm the match moves to Currently Playing / Warming Up.
- [ ] Confirm a countdown timer appears.
- [ ] Confirm the timer counts down.
- [ ] Wait until it reaches zero.
- [ ] Confirm the app does NOT automatically start the game.
- [ ] Confirm Start Game button is still visible.

## 7. Game timer test

- [ ] Click Start Game after warmup.
- [ ] Confirm timer changes to count upward.
- [ ] Confirm winner buttons appear.
- [ ] Click one winner.
- [ ] Confirm the match disappears from active area.
- [ ] Confirm table becomes free.
- [ ] Confirm winner advances in bracket.
- [ ] Confirm a new ready match appears if both players are known.

## 8. Prioritize / delay test

- [ ] Start with multiple ready matches.
- [ ] Click Prioritize This Game on a later match.
- [ ] Confirm it moves upward in the queue.
- [ ] Click Delay on a match.
- [ ] Confirm it moves lower.
- [ ] Click Delay Until Tomorrow.
- [ ] Confirm it appears in Held for Later Session.
- [ ] Click Release / Prioritize.
- [ ] Confirm it returns to the active queue.

## 9. Friday cutoff test

- [ ] Test Mode must be ON.
- [ ] Start a tournament.
- [ ] Go to Sync / QA.
- [ ] Click Jump Near Friday Cutoff.
- [ ] Go to Control.
- [ ] Confirm some matches may show a tight or unsafe warning.
- [ ] Confirm unsafe matches recommend holding for Saturday.
- [ ] Click Delay Until Tomorrow on one unsafe match.
- [ ] Confirm it is held for Saturday.

## 10. Saturday start test

- [ ] Go to Sync / QA.
- [ ] Click Jump to Saturday Start.
- [ ] Go to Control.
- [ ] Confirm Saturday-held matches are available again.
- [ ] Start a warmup.
- [ ] Confirm timer works after Saturday jump.

## 11. Overview/helper screen test

- [ ] Go to Overview.
- [ ] Confirm Playing Now section shows active matches.
- [ ] Confirm On Deck / Coming Soon section shows upcoming matches.
- [ ] Search for a player name.
- [ ] Confirm player status appears.
- [ ] Confirm eliminated players show eliminated after they lose.
- [ ] Confirm a player in an active match shows table and match number.

## 12. Undo test

- [ ] Complete a match.
- [ ] Click Undo Last Result.
- [ ] Confirm the match returns to ready state.
- [ ] Confirm downstream match updates correctly.
- [ ] Complete the match again.

## 13. Local persistence test

- [ ] Start a tournament.
- [ ] Complete at least one match.
- [ ] Refresh the browser.
- [ ] Confirm the tournament state is still there.
- [ ] Confirm the completed match is still complete.

## 14. Viewer mode test

- [ ] Go to Sync / QA.
- [ ] Change Device Role to Viewer.
- [ ] Confirm Setup and Control tabs are disabled.
- [ ] Confirm Overview and Bracket still work.
- [ ] Change back to Master.

## 15. Offline snapshot test

- [ ] Go to Sync / QA.
- [ ] Click Download Snapshot JSON.
- [ ] Confirm file downloads.
- [ ] Open app in another browser/profile/device.
- [ ] Paste the snapshot JSON into import box.
- [ ] Click Import Snapshot.
- [ ] Confirm tournament appears.

## 16. Firebase manual sync test, optional

Only do this if using Firebase.

- [ ] Create a Firebase Realtime Database.
- [ ] Enter the database URL in Sync / QA.
- [ ] Enter a tournament key.
- [ ] Click Push Snapshot from master device.
- [ ] On helper device, enter same URL and key.
- [ ] Click Refresh From Firebase.
- [ ] Confirm tournament appears.
- [ ] Start or finish a game on master.
- [ ] Push Snapshot again.
- [ ] Refresh on helper.
- [ ] Confirm helper screen updates.

## 17. Real-event preflight

Do this before the actual tournament starts:

- [ ] Turn Test Mode OFF.
- [ ] Confirm actual Friday date is correct.
- [ ] Confirm actual Saturday date is correct.
- [ ] Confirm Friday start/end times are correct.
- [ ] Confirm Saturday start/end times are correct.
- [ ] Confirm number of tables is correct.
- [ ] Confirm player names are correct and in signup order.
- [ ] Generate tournament options.
- [ ] Pick the desired option.
- [ ] Start tournament.
- [ ] Do not hard reset after this point unless intentionally starting over.

