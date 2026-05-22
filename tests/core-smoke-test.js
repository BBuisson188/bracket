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

const crowdedOptions = C.generateTournamentOptions(makePlayers(29), settings);
const crowdedFast = crowdedOptions.find((o) => o.id === 'fast');
assert(Object.values(crowdedFast.formats).every((points) => points === 11), '29-player fast option should use 11-point games through the championship.');

for (let n = 4; n <= 17; n += 1) {
  const players = makePlayers(n);
  const options = C.generateTournamentOptions(players, { ...settings, allowDoubleElimination: true });
  const option = options.find((o) => o.id === 'double-elimination');
  assert(option, `Expected a double-elimination option for ${n} players.`);
  assert(option.estimate.counts.total === (n * 2) - 1, `Double-elimination estimate should include possible reset for ${n} players.`);
  const bracket = C.buildBracket(players, option);
  let guard = 0;
  while (!bracket.find((m) => m.roundName === 'Championship' && m.status === 'complete') && guard < 300) {
    guard += 1;
    const ready = C.orderedReadyMatches(bracket, 'friday');
    assert(ready.length > 0, `No ready double-elimination match while simulating ${n} players at step ${guard}`);
    const m = ready[0];
    C.completeMatch(bracket, m.id, m.playerAId);
  }
  const championship = bracket.find((m) => m.roundName === 'Championship');
  assert(championship && championship.status === 'complete' && championship.winnerId, `Double-elimination tournament did not complete for ${n}`);
}

const doubleEightOption = C.generateTournamentOptions(makePlayers(8), { ...settings, allowDoubleElimination: true }).find((o) => o.id === 'double-elimination');
const doubleEightBracket = C.buildBracket(makePlayers(8), doubleEightOption);
let firstReady = C.orderedReadyMatches(doubleEightBracket, 'friday')[0];
C.completeMatch(doubleEightBracket, firstReady.id, firstReady.playerAId);
firstReady = C.orderedReadyMatches(doubleEightBracket, 'friday')[0];
C.completeMatch(doubleEightBracket, firstReady.id, firstReady.playerAId);
assert(C.orderedReadyMatches(doubleEightBracket, 'friday')[0].bracketName === 'Winners Bracket', 'Double elimination should not immediately schedule fresh losers when other first-round winners matches are ready.');
while (doubleEightBracket.filter((m) => m.bracketName === 'Winners Bracket' && m.round === 1 && m.status === 'complete').length < 4) {
  firstReady = C.orderedReadyMatches(doubleEightBracket, 'friday')[0];
  C.completeMatch(doubleEightBracket, firstReady.id, firstReady.playerAId);
}
assert(C.orderedReadyMatches(doubleEightBracket, 'friday')[0].bracketName === 'Losers Bracket', 'Double elimination should mix in losers bracket matches once rested and ready.');

const tooManyForDouble = C.generateTournamentOptions(makePlayers(18), { ...settings, allowDoubleElimination: true });
assert(!tooManyForDouble.some((o) => o.id === 'double-elimination'), 'Double elimination should not be generated above 17 players.');

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
