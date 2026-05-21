const C = require('../core.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1, name: `Player ${i + 1}` }));
}

const settings = {
  tables: 2,
  sessions: [
    { id: 'friday', label: 'Friday', date: '2026-06-05', startTime: '13:00', endTime: '15:00' },
    { id: 'saturday', label: 'Saturday', date: '2026-06-06', startTime: '13:30', endTime: '16:00' },
  ],
  lateStartBufferMin: 10,
  endBufferMin: 15,
  standardWarmupMin: 2,
  aheadWarmupMin: 4,
  transitionMin: 1,
  gameDurations: { 11: 7, 15: 10, 21: 14 },
};

for (let n = 2; n <= 32; n += 1) {
  const players = makePlayers(n);
  const options = C.generateTournamentOptions(players, settings);
  assert(options.length === 3, `Expected 3 options for ${n}`);
  options.forEach((option) => {
    const rounds = Object.keys(option.formats).map(Number).sort((a, b) => a - b);
    rounds.forEach((round, idx) => {
      if (idx > 0) assert(option.formats[round] >= option.formats[rounds[idx - 1]], `Formats should not get shorter in later rounds for ${n} players.`);
    });
  });
  const bracket = C.buildBracket(players, options[0]);
  const playableMatches = bracket.filter((m) => !m.isBye);
  const completedByes = bracket.filter((m) => m.isBye);
  const ready = C.orderedReadyMatches(bracket, 'friday');
  assert(bracket.length === C.nextPowerOfTwo(n) - 1, `Bracket size incorrect for ${n}`);
  assert(ready.length > 0 || completedByes.length > 0, `No ready/byes for ${n}`);
  const seed1 = players[0].id;
  assert(bracket.some((m) => [m.playerAId, m.playerBId, m.winnerId].includes(seed1)), `Seed 1 missing for ${n}`);
  assert(playableMatches.length <= n - 1, `Too many playable matches for ${n}`);
}

const players10 = makePlayers(10);
const option10 = C.generateTournamentOptions(players10, settings)[0];
const bracket10 = C.buildBracket(players10, option10);
assert(bracket10.some((m) => m.isBye && m.winnerId === 'p1'), 'Seed #1 should receive a bye with 10 players.');
assert(bracket10.some((m) => m.playerAId === 'p8' && m.playerBId === 'p9'), '10-player bracket should pair seed 8 vs seed 9.');

const roomySettings = {
  ...settings,
  tables: 4,
  sessions: [
    { id: 'friday', label: 'Friday', date: '2026-06-05', startTime: '13:00', endTime: '17:00' },
    { id: 'saturday', label: 'Saturday', date: '2026-06-06', startTime: '13:00', endTime: '17:00' },
  ],
};
const roomyOptions = C.generateTournamentOptions(makePlayers(19), roomySettings);
const roomyRelaxed = roomyOptions.find((o) => o.id === 'relaxed');
assert(Object.values(roomyRelaxed.formats).every((points) => points === 21), 'Roomy 19-player relaxed option should allow all 21-point rounds.');

for (let n = 2; n <= 32; n += 1) {
  const players = makePlayers(n);
  const option = C.generateTournamentOptions(players, settings)[0];
  const bracket = C.buildBracket(players, option);
  let guard = 0;
  while (!bracket.find((m) => m.roundName === 'Final' && m.status === 'complete') && guard < 100) {
    guard += 1;
    const ready = C.orderedReadyMatches(bracket, 'friday');
    assert(ready.length > 0, `No ready match while simulating ${n} players at step ${guard}`);
    const m = ready[0];
    C.completeMatch(bracket, m.id, m.playerAId);
  }
  const final = bracket.find((m) => m.roundName === 'Final');
  assert(final && final.status === 'complete' && final.winnerId, `Tournament did not complete for ${n}`);
}

console.log('Core smoke tests passed.');
