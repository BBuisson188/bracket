# Retreat Ping-Pong Tournament Control App

This is an offline-first browser app for running a casual single-elimination ping-pong tournament at a men's retreat.

## What it does

- Builds a seeded single-elimination bracket from signup order.
- Gives highest seeds byes automatically when needed.
- Generates three tournament setup options based on player count, table count, and available time.
- Supports 11-, 15-, and 21-point single-game formats. No best-of-3 formats are used.
- Runs a live control board with warmup timers, start-game buttons, finish buttons, delay controls, and prioritize controls.
- Provides an overview screen for a helper to answer “when do I play?”
- Understands Friday and Saturday session windows and warns when a game should be held for tomorrow.
- Includes a real QA/test mode with accelerated timers using the same app logic as the real tournament.
- Works without internet.
- Optionally syncs manual snapshots to Firebase Realtime Database using REST, with no Firebase SDK dependency.

## How to run

Open `index.html` in a browser.

For local testing, you can also serve it with a simple local server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Recommended real-event workflow

1. Open the app on the master device.
2. Go to Setup.
3. Turn **Test Mode OFF**.
4. Enter the actual Friday and Saturday dates/times.
5. Enter player names in signup order.
6. Enter number of tables.
7. Click **Generate Tournament Options**.
8. Choose the safest or recommended tournament option.
9. Click **Start Tournament**.
10. Use Control Board to run matches.
11. Use Overview on a helper device or public display if desired.

## Test mode workflow

1. Go to Setup.
2. Turn **Test Mode ON**.
3. Pick a test speed, such as 10x or 60x.
4. Load fake players or enter names.
5. Start the tournament.
6. Test warmup timers, Start Game buttons, winner buttons, prioritization, delay, and Friday/Saturday cutoffs.
7. Use Sync / QA buttons to jump near Friday cutoff or Saturday start.
8. Turn Test Mode OFF before the real retreat.

## Files

- `index.html` - app shell
- `styles.css` - app styling
- `core.js` - pure tournament/bracket/timing logic
- `app.js` - browser UI, state, timers, sync, controls
- `HANDOFF.md` - detailed handoff for Codex or another developer
- `QA_CHECKLIST.md` - practical test checklist
- `firebase-rules-example.json` - simple Realtime Database rules example
- `tests/core-smoke-test.js` - Node smoke test for bracket generation

