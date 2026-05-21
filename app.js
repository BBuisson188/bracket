/* Retreat Ping-Pong Tournament Control App */
const C = window.PingPongCore;
const STORAGE_KEY = 'retreatPingPongTournament.v1';

const sampleNames = [
  'Aaron', 'Ben', 'Caleb', 'Daniel', 'Eli', 'Frank', 'Grant', 'Hunter',
  'Isaac', 'Jacob', 'Kyle', 'Luke', 'Mark', 'Nathan', 'Owen', 'Peter',
  'Quentin', 'Ryan', 'Sam', 'Thomas', 'Uri', 'Victor', 'Wes', 'Xavier',
  'Yuri', 'Zach', 'Beau', 'Chris', 'David', 'Michael', 'Andrew', 'John'
];

function getNextWeekdayDate(targetDay) {
  const d = new Date();
  const day = d.getDay();
  let add = (targetDay + 7 - day) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function defaultState() {
  const friday = getNextWeekdayDate(5);
  const saturdayDate = new Date(friday + 'T12:00:00');
  saturdayDate.setDate(saturdayDate.getDate() + 1);
  const saturday = saturdayDate.toISOString().slice(0, 10);
  return {
    appVersion: '1.0.0',
    activeTab: 'setup',
    role: 'master',
    mode: 'setup',
    playersText: sampleNames.slice(0, 16).join('\n'),
    players: [],
    selectedOptionId: null,
    options: [],
    matches: [],
    tables: [],
    currentSessionId: 'friday',
    lastMessage: '',
    ui: {
      collapsedRounds: {},
    },
    settings: {
      tables: 2,
      sessions: [
        { id: 'friday', label: 'Friday', date: friday, startTime: '13:00', endTime: '15:00' },
        { id: 'saturday', label: 'Saturday', date: saturday, startTime: '13:30', endTime: '16:00' },
      ],
      lateStartBufferMin: 10,
      endBufferMin: 15,
      standardWarmupMin: 2,
      aheadWarmupMin: 4,
      transitionMin: 1,
      gameDurations: { 11: 7, 15: 10, 21: 14 },
      testMode: false,
      timeScale: 10,
    },
    clock: {
      testNowMs: null,
      lastRealTickMs: Date.now(),
    },
    sync: {
      projectId: 'beau-games',
      tournamentName: 'Ping-Pong Retreat',
      tournamentId: 'ping-pong-retreat',
      availableTournaments: [],
      databaseUrl: '',
      tournamentKey: `retreat-${Math.random().toString(36).slice(2, 8)}`,
      lastPushedAt: null,
      lastPulledAt: null,
      lastListedAt: null,
      lastError: '',
    },
    history: [],
  };
}

let state = loadState();
let renderTimer = null;
let saveTimer = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return mergeDefaults(defaultState(), parsed);
  } catch (err) {
    console.warn('Failed to load state', err);
    return defaultState();
  }
}

function mergeDefaults(base, saved) {
  const out = { ...base, ...saved };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  out.settings.sessions = saved.settings?.sessions || base.settings.sessions;
  out.settings.gameDurations = { ...base.settings.gameDurations, ...(saved.settings?.gameDurations || {}) };
  out.clock = { ...base.clock, ...(saved.clock || {}) };
  out.sync = { ...base.sync, ...(saved.sync || {}) };
  out.ui = { ...base.ui, ...(saved.ui || {}) };
  out.ui.collapsedRounds = { ...base.ui.collapsedRounds, ...(saved.ui?.collapsedRounds || {}) };
  return out;
}

function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Failed to save state', err);
    }
  }, 50);
}

function commit(message = '') {
  if (message) state.lastMessage = message;
  saveStateSoon();
  render();
}

function nowMs() {
  if (!state.settings.testMode) return Date.now();
  if (!state.clock.testNowMs) {
    const first = C.sessionWindows(state.settings)[0];
    state.clock.testNowMs = first?.startMs || Date.now();
  }
  return state.clock.testNowMs;
}

function tickClock() {
  const realNow = Date.now();
  if (state.settings.testMode && state.mode === 'running') {
    const last = state.clock.lastRealTickMs || realNow;
    const delta = realNow - last;
    state.clock.testNowMs = (state.clock.testNowMs || nowMs()) + delta * Number(state.settings.timeScale || 10);
  }
  state.clock.lastRealTickMs = realNow;
  updateHeader();
  updateVisibleTimers();
  updateVisiblePace();
}

function setTab(tab) {
  state.activeTab = tab;
  commit();
}

function isViewer() {
  return state.role === 'viewer';
}

function playersById() {
  return new Map((state.players || []).map((p) => [p.id, p]));
}

function playerName(id) {
  return C.playerName(state.players || [], id);
}

function getMatch(id) {
  return (state.matches || []).find((m) => m.id === id);
}

function activeMatches() {
  return (state.matches || []).filter((m) => ['warming', 'playing'].includes(m.status));
}

function freeTables() {
  const occupied = new Set(activeMatches().map((m) => Number(m.tableId)));
  return (state.tables || []).filter((t) => !occupied.has(Number(t.id)));
}

function selectedOption() {
  return (state.options || []).find((o) => o.id === state.selectedOptionId) || null;
}

function schedule() {
  return [...tournamentEstimateMap().values()];
}

function estimatedForMatch(matchId) {
  return tournamentEstimateMap().get(matchId) || null;
}

function tournamentEstimateMap() {
  const currentNow = nowMs();
  const tables = state.tables?.length ? state.tables : [{ id: 1, label: 'Table 1' }];
  const settings = state.settings || {};
  const windows = C.sessionWindows(settings);
  const scheduleBase = scheduleBaseMs(settings, currentNow);
  const tableAvailable = new Map(tables.map((t) => [t.id, scheduleBase]));
  const estimates = new Map();

  activeMatches().forEach((match) => {
    let remaining = C.occupancyMinutesForMatch(match, settings) * C.MINUTE;
    if (match.status === 'warming' && match.warmupStartedAt) {
      const warmupTotal = Number(match.warmupDurationMin || settings.standardWarmupMin || 2) * C.MINUTE;
      const elapsed = Math.max(0, currentNow - match.warmupStartedAt);
      remaining = Math.max(0, warmupTotal - elapsed) + C.gameMinutesForPoints(match.points, settings) * C.MINUTE;
    }
    if (match.status === 'playing' && match.gameStartedAt) {
      const gameTotal = C.gameMinutesForPoints(match.points, settings) * C.MINUTE;
      const elapsed = Math.max(0, currentNow - match.gameStartedAt);
      remaining = Math.max(0, gameTotal - elapsed);
    }
    const end = currentNow + remaining;
    tableAvailable.set(match.tableId || tables[0].id, end);
    estimates.set(match.id, {
      matchId: match.id,
      tableId: match.tableId,
      estimatedStartMs: currentNow,
      estimatedEndMs: end,
      active: true,
    });
  });

  [...(state.matches || [])]
    .filter((match) => match.status !== 'complete' && !['warming', 'playing'].includes(match.status) && !match.isBye)
    .sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      const pa = Number(a.priority || 0);
      const pb = Number(b.priority || 0);
      if (pa !== pb) return pb - pa;
      return a.roundIndex - b.roundIndex;
    })
    .forEach((match) => {
      const dependencyTimes = [match.slotA, match.slotB].map((slot) => {
        if (slot.kind !== 'winner') return scheduleBase;
        const source = getMatch(slot.sourceMatchId);
        if (!source) return scheduleBase;
        if (source.status === 'complete') return Math.max(scheduleBase, source.completedAt || scheduleBase);
        return estimates.get(source.id)?.estimatedEndMs || scheduleBase;
      });
      let earliest = Math.max(scheduleBase, ...dependencyTimes);
      if (match.holdUntilSession) {
        const heldSession = windows.find((w) => w.id === match.holdUntilSession);
        if (heldSession?.startMs) earliest = Math.max(earliest, heldSession.startMs);
      }

      let sortedTables = [...tableAvailable.entries()].sort((a, b) => a[1] - b[1]);
      let [tableId, availableAt] = sortedTables[0] || [1, scheduleBase];
      let start = Math.max(earliest, availableAt);
      const durationMs = C.occupancyMinutesForMatch(match, settings) * C.MINUTE;
      start = fitStartIntoSession(start, durationMs, settings);
      let startCheck = C.canStartMatch(match, start, settings);
      if (startCheck.level !== 'safe' && startCheck.nextSession?.startMs) {
        start = Math.max(startCheck.nextSession.startMs, earliest);
        sortedTables = [...tableAvailable.entries()].sort((a, b) => {
          const at = Math.max(a[1], start);
          const bt = Math.max(b[1], start);
          return at - bt;
        });
        [tableId, availableAt] = sortedTables[0] || [1, scheduleBase];
        start = Math.max(start, availableAt);
        start = fitStartIntoSession(start, durationMs, settings);
        startCheck = C.canStartMatch(match, start, settings);
      }
      estimates.set(match.id, {
        matchId: match.id,
        tableId,
        estimatedStartMs: start,
        estimatedEndMs: start + durationMs,
        startCheck,
      });
      tableAvailable.set(tableId, start + durationMs);
    });

  return estimates;
}

function scheduleBaseMs(settings, currentNow) {
  const windows = C.sessionWindows(settings).filter((w) => w.startMs != null && w.endMs != null);
  if (!windows.length) return currentNow;
  const active = windows.find((w) => currentNow >= w.startMs && currentNow <= (w.softEndMs || w.endMs));
  if (active) return currentNow;
  const upcoming = windows.find((w) => currentNow < w.startMs);
  if (upcoming) return upcoming.startMs;
  const laterToday = windows.find((w) => currentNow <= w.endMs);
  if (laterToday?.softEndMs && currentNow > laterToday.softEndMs) {
    const next = windows.find((w) => w.startMs > currentNow);
    if (next) return next.startMs;
  }
  return windows[windows.length - 1].startMs || currentNow;
}

function fitStartIntoSession(startMs, durationMs, settings) {
  const windows = C.sessionWindows(settings).filter((w) => w.startMs != null && w.endMs != null);
  if (!windows.length) return startMs;
  for (const window of windows) {
    if (startMs < window.startMs) {
      const projectedFromStart = window.startMs + durationMs;
      if (!window.softEndMs || projectedFromStart <= window.softEndMs) return window.startMs;
      continue;
    }
    if (startMs <= window.endMs) {
      const projected = startMs + durationMs;
      if (!window.softEndMs || projected <= window.softEndMs) return startMs;
      continue;
    }
  }
  return startMs;
}

function recommendedWarmupMinutes() {
  const active = activeMatches();
  if (active.length === 0 && (state.matches || []).some((m) => m.status === 'complete' && !m.isBye)) {
    // If no tables are occupied and games have already completed, we can relax slightly.
    return Number(state.settings.aheadWarmupMin || 4);
  }
  return Number(state.settings.standardWarmupMin || 2);
}

function updateSessionFromClock() {
  const session = C.currentSession(state.settings, nowMs());
  if (session) state.currentSessionId = session.id;
}

function generateOptions() {
  const players = C.parsePlayers(state.playersText);
  state.players = players;
  state.options = C.generateTournamentOptions(players, state.settings);
  const rec = state.options.find((o) => o.recommended) || state.options[0];
  state.selectedOptionId = rec?.id || null;
  commit(`Generated ${state.options.length} tournament options for ${players.length} players.`);
}

function startTournament() {
  if (isViewer()) return;
  const players = C.parsePlayers(state.playersText);
  if (players.length < 2) {
    alert('Enter at least 2 players.');
    return;
  }
  if (!state.selectedOptionId || !state.options.length) {
    state.players = players;
    state.options = C.generateTournamentOptions(players, state.settings);
    const rec = state.options.find((o) => o.recommended) || state.options[0];
    state.selectedOptionId = rec.id;
  }
  state.players = players;
  const option = selectedOption();
  state.matches = C.buildBracket(players, option);
  state.tables = Array.from({ length: Number(state.settings.tables || 1) }, (_, idx) => ({ id: idx + 1, label: `Table ${idx + 1}` }));
  state.currentSessionId = 'friday';
  const firstSession = C.sessionWindows(state.settings)[0];
  if (state.settings.testMode) state.clock.testNowMs = firstSession?.startMs || Date.now();
  state.clock.lastRealTickMs = Date.now();
  state.mode = 'running';
  state.activeTab = 'control';
  state.history = [{ at: nowMs(), type: 'start', message: 'Tournament started.' }];
  commit('Tournament started.');
}

function resetTournamentOnly() {
  if (!confirm('Reset tournament bracket and results? Setup settings and player names will stay.')) return;
  state.mode = 'setup';
  state.matches = [];
  state.tables = [];
  state.history = [];
  state.activeTab = 'setup';
  commit('Tournament reset.');
}

function hardResetAll() {
  if (!confirm('Delete all local app data and start over?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  render();
}

function updateSettingsFromSetupForm() {
  const get = (id) => document.getElementById(id);
  if (!get('playersText')) return;
  state.playersText = get('playersText').value;
  state.settings.tables = Number(get('tables').value || 1);
  state.settings.sessions[0].date = get('fridayDate').value;
  state.settings.sessions[0].startTime = get('fridayStart').value;
  state.settings.sessions[0].endTime = get('fridayEnd').value;
  state.settings.sessions[1].date = get('saturdayDate').value;
  state.settings.sessions[1].startTime = get('saturdayStart').value;
  state.settings.sessions[1].endTime = get('saturdayEnd').value;
  state.settings.lateStartBufferMin = Number(get('lateStartBufferMin').value || 0);
  state.settings.endBufferMin = Number(get('endBufferMin').value || 0);
  state.settings.standardWarmupMin = Number(get('standardWarmupMin').value || 0);
  state.settings.aheadWarmupMin = Number(get('aheadWarmupMin').value || 0);
  state.settings.transitionMin = Number(get('transitionMin').value || 0);
  state.settings.gameDurations = {
    11: Number(get('duration11').value || 7),
    15: Number(get('duration15').value || 10),
    21: Number(get('duration21').value || 14),
  };
  state.settings.testMode = get('testMode').checked;
  state.settings.timeScale = Number(get('timeScale').value || 10);
}

function chooseOption(id) {
  state.selectedOptionId = id;
  commit('Tournament option selected.');
}

function startWarmup(matchId, force = false) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  const tables = freeTables();
  if (tables.length === 0) {
    alert('No free tables right now. Finish or cancel another active match first.');
    return;
  }
  const warmup = recommendedWarmupMinutes();
  const safety = C.canStartMatch(match, nowMs(), state.settings, warmup);
  if (!force && safety.level === 'unsafe') {
    alert(`${safety.message}\n\nUse Delay Until Tomorrow, or use Start Anyway if you intentionally want to override this.`);
    return;
  }
  match.status = 'warming';
  match.tableId = tables[0].id;
  match.warmupStartedAt = nowMs();
  match.warmupDurationMin = warmup;
  match.holdUntilSession = null;
  state.history.push({ at: nowMs(), type: 'warmup', matchId, message: `Warmup started for Match ${match.displayId}.` });
  commit(`Warmup started on Table ${tables[0].id}.`);
}

function startGame(matchId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  if (!match.tableId) {
    const tables = freeTables();
    if (tables.length === 0) {
      alert('No free tables right now.');
      return;
    }
    match.tableId = tables[0].id;
  }
  match.status = 'playing';
  match.gameStartedAt = nowMs();
  state.history.push({ at: nowMs(), type: 'game-start', matchId, message: `Game started for Match ${match.displayId}.` });
  commit(`Game started on Table ${match.tableId}.`);
}

function finishMatch(matchId, winnerId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  const table = match.tableId;
  match.status = 'complete';
  match.winnerId = winnerId;
  match.loserId = winnerId === match.playerAId ? match.playerBId : match.playerAId;
  match.tableId = null;
  match.completedAt = nowMs();
  match.isBye = false;
  C.propagateWinners(state.matches);
  state.history.push({ at: nowMs(), type: 'complete', matchId, winnerId, message: `${playerName(winnerId)} won Match ${match.displayId}.` });
  commit(`${playerName(winnerId)} won Match ${match.displayId}. Table ${table} is free.`);
}

function cancelActive(matchId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  match.status = 'ready';
  match.tableId = null;
  delete match.warmupStartedAt;
  delete match.gameStartedAt;
  state.history.push({ at: nowMs(), type: 'cancel-active', matchId, message: `Match ${match.displayId} returned to ready queue.` });
  commit(`Match ${match.displayId} returned to the ready queue.`);
}

function prioritizeMatch(matchId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  const maxPriority = Math.max(0, ...state.matches.map((m) => Number(m.priority || 0)));
  match.priority = maxPriority + 10;
  match.holdUntilSession = null;
  if (match.status === 'delayed') match.status = 'ready';
  state.history.push({ at: nowMs(), type: 'prioritize', matchId, message: `Match ${match.displayId} prioritized.` });
  commit(`Match ${match.displayId} moved up the queue.`);
}

function delayMatch(matchId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  if (!match) return;
  match.priority = Number(match.priority || 0) - 10;
  match.status = 'delayed';
  state.history.push({ at: nowMs(), type: 'delay', matchId, message: `Match ${match.displayId} delayed.` });
  commit(`Match ${match.displayId} delayed.`);
}

function delayUntilTomorrow(matchId) {
  if (isViewer()) return;
  const match = getMatch(matchId);
  const next = C.nextSessionAfter(state.settings, nowMs()) || C.sessionWindows(state.settings).find((s) => s.id === 'saturday');
  if (!match || !next) return;
  match.holdUntilSession = next.id;
  match.priority = Number(match.priority || 0) - 5;
  state.history.push({ at: nowMs(), type: 'tomorrow', matchId, message: `Match ${match.displayId} held for ${next.label}.` });
  commit(`Match ${match.displayId} held for ${next.label}.`);
}

function undoLastResult() {
  if (isViewer()) return;
  const completed = [...state.matches].reverse().find((m) => m.status === 'complete' && !m.isBye && m.completedAt);
  if (!completed) {
    alert('No completed played match to undo.');
    return;
  }
  if (!confirm(`Undo result for Match ${completed.displayId}?`)) return;
  completed.status = 'ready';
  completed.winnerId = null;
  completed.loserId = null;
  completed.completedAt = null;
  // Clear downstream matches that depended on this result.
  const clearDownstream = (match) => {
    if (!match.nextMatchId) return;
    const next = getMatch(match.nextMatchId);
    if (!next) return;
    if (match.nextSlot === 'A') {
      next.playerAId = null;
      next.slotA.playerId = null;
    } else {
      next.playerBId = null;
      next.slotB.playerId = null;
    }
    if (!next.winnerId) next.status = 'waiting';
    if (next.winnerId) {
      next.winnerId = null;
      next.loserId = null;
      next.status = 'waiting';
      clearDownstream(next);
    }
  };
  clearDownstream(completed);
  C.propagateWinners(state.matches);
  commit(`Undid Match ${completed.displayId}.`);
}

function jumpTestClock(target) {
  if (!state.settings.testMode) {
    alert('Clock jump is only available in Test Mode.');
    return;
  }
  const windows = C.sessionWindows(state.settings);
  if (target === 'friday-cutoff') state.clock.testNowMs = (windows[0]?.softEndMs || nowMs()) - 5 * C.MINUTE;
  if (target === 'saturday-start') state.clock.testNowMs = windows[1]?.startMs || nowMs();
  if (target === 'friday-start') state.clock.testNowMs = windows[0]?.startMs || nowMs();
  updateSessionFromClock();
  commit('Test clock updated.');
}

function addFakePlayers(count) {
  state.playersText = sampleNames.slice(0, count).join('\n');
  commit(`Loaded ${count} sample players.`);
}

function tournamentIdFromName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ping-pong-retreat';
}

function firestoreBaseUrl() {
  const projectId = state.sync.projectId || 'beau-games';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

function firestoreTournamentUrl(id = state.sync.tournamentId) {
  return `${firestoreBaseUrl()}/tournaments/${encodeURIComponent(id)}`;
}

function firestoreTournamentFields(name, snapshotState) {
  return {
    fields: {
      name: { stringValue: name },
      updatedAt: { timestampValue: new Date().toISOString() },
      state: { stringValue: JSON.stringify(snapshotState) },
    },
  };
}

function readFirestoreStringField(doc, field) {
  return doc?.fields?.[field]?.stringValue || '';
}

function readFirestoreTimestampField(doc, field) {
  return doc?.fields?.[field]?.timestampValue || '';
}

function firestoreDocId(doc) {
  return String(doc?.name || '').split('/').pop() || '';
}

function testCompleteNextActive() {
  const active = activeMatches()[0];
  if (!active) {
    const ready = C.orderedReadyMatches(state.matches, state.currentSessionId)[0];
    if (!ready) return alert('No active or ready match found.');
    startWarmup(ready.id, true);
    return;
  }
  const winnerId = Math.random() < 0.5 ? active.playerAId : active.playerBId;
  finishMatch(active.id, winnerId);
}

async function pushSnapshot() {
  const name = String(state.sync.tournamentName || '').trim();
  if (!name) {
    alert('Enter a tournament name on Setup first.');
    return;
  }
  state.sync.tournamentId = tournamentIdFromName(name);
  try {
    const payload = exportSnapshotObject();
    const res = await fetch(firestoreTournamentUrl(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(firestoreTournamentFields(name, payload.state)),
    });
    if (!res.ok) throw new Error(await firestoreErrorMessage(res, `update tournaments/${state.sync.tournamentId}`));
    state.sync.lastPushedAt = Date.now();
    state.sync.lastError = '';
    commit('Tournament snapshot pushed to Firestore.');
  } catch (err) {
    state.sync.lastError = String(err.message || err);
    commit('Firestore push failed.');
  }
}

async function pullSnapshot() {
  if (!state.sync.tournamentId) {
    alert('Choose or enter a tournament first.');
    return;
  }
  try {
    const selected = document.querySelector('[data-input="tournament-select"]');
    if (selected?.value) {
      const selectedTournament = (state.sync.availableTournaments || []).find((t) => t.id === selected.value);
      if (selectedTournament) {
        state.sync.tournamentId = selectedTournament.id;
        state.sync.tournamentName = selectedTournament.name;
      }
    }
    const res = await fetch(firestoreTournamentUrl());
    if (!res.ok) throw new Error(await firestoreErrorMessage(res, `retrieve tournaments/${state.sync.tournamentId}`));
    const doc = await res.json();
    const rawState = readFirestoreStringField(doc, 'state');
    if (!rawState) throw new Error('No snapshot state found for that tournament.');
    const pulledState = JSON.parse(rawState);
    const keepSync = { ...state.sync };
    state = mergeDefaults(defaultState(), pulledState);
    state.sync = { ...state.sync, ...keepSync, lastPulledAt: Date.now(), lastError: '' };
    if (state.role === 'viewer') state.activeTab = 'overview';
    commit('Tournament snapshot retrieved from Firestore.');
  } catch (err) {
    state.sync.lastError = String(err.message || err);
    commit('Firestore retrieve failed.');
  }
}

async function listFirestoreTournaments() {
  try {
    const res = await fetch(`${firestoreBaseUrl()}/tournaments?pageSize=100`);
    if (!res.ok) throw new Error(await firestoreErrorMessage(res, 'list tournaments'));
    const payload = await res.json();
    state.sync.availableTournaments = (payload.documents || [])
      .map((doc) => ({
        id: firestoreDocId(doc),
        name: readFirestoreStringField(doc, 'name') || firestoreDocId(doc),
        updatedAt: readFirestoreTimestampField(doc, 'updatedAt'),
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (state.sync.availableTournaments.length && !state.sync.availableTournaments.some((t) => t.id === state.sync.tournamentId)) {
      state.sync.tournamentId = state.sync.availableTournaments[0].id;
      state.sync.tournamentName = state.sync.availableTournaments[0].name;
    }
    state.sync.lastListedAt = Date.now();
    state.sync.lastError = '';
    commit('Tournament list refreshed.');
  } catch (err) {
    state.sync.lastError = String(err.message || err);
    commit('Tournament list refresh failed.');
  }
}

async function deleteFirestoreTournament() {
  if (!state.sync.tournamentId) {
    alert('Choose or enter a tournament first.');
    return;
  }
  if (!confirm(`Delete tournament "${state.sync.tournamentName || state.sync.tournamentId}" from Firestore? Local data on this device will stay.`)) return;
  try {
    const res = await fetch(firestoreTournamentUrl(), { method: 'DELETE' });
    if (!res.ok) throw new Error(await firestoreErrorMessage(res, `delete tournaments/${state.sync.tournamentId}`));
    state.sync.availableTournaments = (state.sync.availableTournaments || []).filter((t) => t.id !== state.sync.tournamentId);
    state.sync.lastError = '';
    commit('Tournament deleted from Firestore.');
  } catch (err) {
    state.sync.lastError = String(err.message || err);
    commit('Firestore delete failed. Your Firestore rules may still have delete disabled.');
  }
}

async function firestoreErrorMessage(res, action) {
  let detail = '';
  try {
    const payload = await res.json();
    detail = payload?.error?.message || JSON.stringify(payload);
  } catch {
    try { detail = await res.text(); } catch {}
  }
  const project = state.sync.projectId || 'beau-games';
  const tournament = state.sync.tournamentId || '(none selected)';
  return `Firestore ${action} failed (${res.status} ${res.statusText || ''}). Project: ${project}. Tournament: ${tournament}.${detail ? ` Details: ${detail}` : ''}`;
}

function exportSnapshotObject() {
  return {
    exportedAt: new Date().toISOString(),
    state,
  };
}

function downloadSnapshot() {
  const blob = new Blob([JSON.stringify(exportSnapshotObject(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ping-pong-tournament-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSnapshotText(text) {
  try {
    const payload = JSON.parse(text);
    if (!payload.state) throw new Error('Snapshot must contain a state property.');
    const sync = { ...state.sync };
    state = mergeDefaults(defaultState(), payload.state);
    state.sync = { ...state.sync, ...sync };
    commit('Snapshot imported.');
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}

function render() {
  updateHeader();
  document.querySelectorAll('.bottom-nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
    if (state.role === 'viewer' && ['setup', 'control'].includes(btn.dataset.tab)) btn.disabled = true;
    else btn.disabled = false;
  });
  const app = document.getElementById('app');
  if (state.role === 'viewer' && ['setup', 'control'].includes(state.activeTab)) state.activeTab = 'overview';
  if (state.activeTab === 'setup') app.innerHTML = renderSetup();
  if (state.activeTab === 'control') app.innerHTML = renderControl();
  if (state.activeTab === 'overview') app.innerHTML = renderOverview();
  if (state.activeTab === 'bracket') app.innerHTML = renderBracket();
  if (state.activeTab === 'sync') app.innerHTML = renderSyncQa();
  bindEvents();
  updateVisibleTimers();
}

function updateHeader() {
  const modeBadge = document.getElementById('modeBadge');
  const clockBadge = document.getElementById('clockBadge');
  const subtitle = document.getElementById('headerSubtitle');
  if (!modeBadge || !clockBadge) return;
  const modeParts = [];
  if (state.settings.testMode) modeParts.push('TEST MODE');
  modeParts.push(state.role === 'viewer' ? 'Viewer' : state.mode === 'running' ? 'Running' : 'Setup');
  modeBadge.textContent = modeParts.join(' • ');
  modeBadge.className = `badge ${state.settings.testMode ? 'warn' : state.mode === 'running' ? 'good' : ''}`;
  clockBadge.textContent = state.settings.testMode ? `Test ${C.formatClock(nowMs())}` : `Now ${C.formatClock(Date.now())}`;
  subtitle.textContent = state.lastMessage || 'Offline-first tournament control board';
}

function bindEvents() {
  document.querySelectorAll('.bottom-nav button').forEach((btn) => {
    btn.onclick = () => setTab(btn.dataset.tab);
  });

  document.querySelectorAll('[data-action]').forEach((el) => {
    el.onclick = async () => {
      const action = el.dataset.action;
      const id = el.dataset.id;
      if (action === 'generate-options') { updateSettingsFromSetupForm(); generateOptions(); }
      if (action === 'start-tournament') { updateSettingsFromSetupForm(); startTournament(); }
      if (action === 'choose-option') chooseOption(id);
      if (action === 'fake-players') addFakePlayers(Number(el.dataset.count));
      if (action === 'reset-tournament') resetTournamentOnly();
      if (action === 'hard-reset') hardResetAll();
      if (action === 'start-warmup') startWarmup(id, false);
      if (action === 'start-anyway') startWarmup(id, true);
      if (action === 'start-game') startGame(id);
      if (action === 'finish') finishMatch(id, el.dataset.winner);
      if (action === 'cancel-active') cancelActive(id);
      if (action === 'prioritize') prioritizeMatch(id);
      if (action === 'delay') delayMatch(id);
      if (action === 'tomorrow') delayUntilTomorrow(id);
      if (action === 'undo') undoLastResult();
      if (action === 'toggle-round') toggleBracketRound(Number(el.dataset.round));
      if (action === 'jump-clock') jumpTestClock(el.dataset.target);
      if (action === 'test-complete-next') testCompleteNextActive();
      if (action === 'push') await pushSnapshot();
      if (action === 'pull') await pullSnapshot();
      if (action === 'list-tournaments') await listFirestoreTournaments();
      if (action === 'delete-tournament') await deleteFirestoreTournament();
      if (action === 'download-snapshot') downloadSnapshot();
    };
  });

  document.querySelectorAll('[data-input]').forEach((el) => {
    const updateInput = () => {
      if (el.dataset.input === 'role') state.role = el.value;
      if (el.dataset.input === 'tournament-name') {
        state.sync.tournamentName = el.value.trim();
        state.sync.tournamentId = tournamentIdFromName(state.sync.tournamentName);
      }
      if (el.dataset.input === 'tournament-select') {
        const selected = (state.sync.availableTournaments || []).find((t) => t.id === el.value);
        if (selected) {
          state.sync.tournamentId = selected.id;
          state.sync.tournamentName = selected.name;
        }
      }
      if (el.dataset.input === 'project-id') state.sync.projectId = el.value.trim() || 'beau-games';
      if (el.dataset.input === 'sync-url') state.sync.databaseUrl = el.value.trim();
      if (el.dataset.input === 'sync-key') state.sync.tournamentKey = el.value.trim();
      saveStateSoon();
    };
    el.onchange = updateInput;
    el.oninput = updateInput;
  });

  const playerSearch = document.getElementById('playerSearch');
  if (playerSearch) playerSearch.oninput = () => renderPlayerSearch(playerSearch.value);

  const playersText = document.getElementById('playersText');
  if (playersText) {
    playersText.oninput = () => {
      state.playersText = playersText.value;
      updateSetupPlayerCount();
      saveStateSoon();
    };
  }

  const importText = document.getElementById('importText');
  const importBtn = document.getElementById('importBtn');
  if (importBtn && importText) importBtn.onclick = () => importSnapshotText(importText.value);
}

function toggleBracketRound(round) {
  if (!round) return;
  state.ui = state.ui || { collapsedRounds: {} };
  state.ui.collapsedRounds = state.ui.collapsedRounds || {};
  if (state.ui.collapsedRounds[round]) {
    Object.keys(state.ui.collapsedRounds).forEach((key) => {
      if (Number(key) >= round) delete state.ui.collapsedRounds[key];
    });
  } else {
    state.ui.collapsedRounds[round] = true;
  }
  commit();
}

function updateSetupPlayerCount() {
  const countEl = document.getElementById('playerCountBadge');
  const textEl = document.getElementById('playersText');
  if (!countEl || !textEl) return;
  const count = C.parsePlayers(textEl.value).length;
  countEl.textContent = `Current: ${count}`;
}

function renderSetup() {
  const s = state.settings;
  const playerCount = C.parsePlayers(state.playersText).length;
  return `
    ${state.settings.testMode ? '<div class="alert warn"><strong>TEST MODE ACTIVE.</strong> Timers and the tournament clock can run faster than real time. Turn this off for the real retreat.</div>' : ''}
    <section class="card">
      <h2>Setup</h2>
      <p class="help">Enter players in signup order. First name listed is Seed #1. Highest seeds receive byes when needed.</p>
      <div class="grid two">
        <div>
          <label for="tournamentName">Tournament name</label>
          <input id="tournamentName" data-input="tournament-name" value="${escapeAttr(state.sync.tournamentName || '')}" placeholder="Men's Retreat 2026" />
          <p class="help">Firestore document: <span class="kbd">${escapeHtml(state.sync.tournamentId || tournamentIdFromName(state.sync.tournamentName))}</span></p>
          <label for="playersText">Players, one per line</label>
          <textarea id="playersText">${escapeHtml(state.playersText)}</textarea>
          <div class="button-row" style="margin-top: 10px;">
            <button class="ghost" data-action="fake-players" data-count="10">Load 10</button>
            <button class="ghost" data-action="fake-players" data-count="16">Load 16</button>
            <button class="ghost" data-action="fake-players" data-count="24">Load 24</button>
            <button class="ghost" data-action="fake-players" data-count="30">Load 30</button>
          </div>
          <p class="help player-count-line"><span id="playerCountBadge" class="badge muted">Current: ${playerCount}</span></p>
        </div>
        <div class="grid">
          <div class="grid two">
            <div>
              <label for="tables">Tables available</label>
              <input id="tables" type="number" min="1" max="8" value="${s.tables}" />
            </div>
            <div>
              <label for="testMode">Test mode</label>
              <select id="testModeSelect" class="hidden"></select>
              <div class="button-row">
                <label style="font-weight:700; margin:0;"><input id="testMode" type="checkbox" ${s.testMode ? 'checked' : ''} style="width:auto;" /> Use accelerated test clock</label>
              </div>
              <p class="help">Uses the same app logic with a faster clock.</p>
            </div>
          </div>
          <div class="grid two">
            <div><label for="fridayDate">Friday date</label><input id="fridayDate" type="date" value="${s.sessions[0].date}" /></div>
            <div><label for="saturdayDate">Saturday date</label><input id="saturdayDate" type="date" value="${s.sessions[1].date}" /></div>
            <div><label for="fridayStart">Friday start</label><input id="fridayStart" type="time" value="${s.sessions[0].startTime}" /></div>
            <div><label for="fridayEnd">Friday end</label><input id="fridayEnd" type="time" value="${s.sessions[0].endTime}" /></div>
            <div><label for="saturdayStart">Saturday start</label><input id="saturdayStart" type="time" value="${s.sessions[1].startTime}" /></div>
            <div><label for="saturdayEnd">Saturday end</label><input id="saturdayEnd" type="time" value="${s.sessions[1].endTime}" /></div>
          </div>
          <div class="grid three">
            <div><label for="lateStartBufferMin">Late-start buffer</label><input id="lateStartBufferMin" type="number" min="0" value="${s.lateStartBufferMin}" /></div>
            <div><label for="endBufferMin">End buffer / soft cutoff</label><input id="endBufferMin" type="number" min="0" value="${s.endBufferMin}" /></div>
            <div><label for="transitionMin">Transition minutes</label><input id="transitionMin" type="number" min="0" step="0.5" value="${s.transitionMin}" /></div>
          </div>
          <div class="grid two">
            <div><label for="standardWarmupMin">Normal warmup minutes</label><input id="standardWarmupMin" type="number" min="0" step="0.5" value="${s.standardWarmupMin}" /></div>
            <div><label for="aheadWarmupMin">Relaxed warmup minutes</label><input id="aheadWarmupMin" type="number" min="0" step="0.5" value="${s.aheadWarmupMin}" /></div>
          </div>
          <div class="grid four">
            <div><label for="duration11">11-point game min</label><input id="duration11" type="number" min="1" step="0.5" value="${s.gameDurations[11]}" /></div>
            <div><label for="duration15">15-point game min</label><input id="duration15" type="number" min="1" step="0.5" value="${s.gameDurations[15]}" /></div>
            <div><label for="duration21">21-point game min</label><input id="duration21" type="number" min="1" step="0.5" value="${s.gameDurations[21]}" /></div>
            <div><label for="timeScale">Test speed</label><input id="timeScale" type="number" min="1" value="${s.timeScale}" /></div>
          </div>
          <div class="button-row">
            <button data-action="generate-options">Generate Tournament Options</button>
            <button class="good" data-action="start-tournament">Start Tournament</button>
            <button class="ghost" data-action="reset-tournament">Reset Tournament</button>
          </div>
        </div>
      </div>
    </section>
    ${renderOptions()}
  `;
}

function renderOptions() {
  if (!state.options.length) {
    return `<section class="card"><h2>Tournament options</h2><p class="help">Generate options after entering players and timing assumptions.</p></section>`;
  }
  return `
    <section class="card">
      <h2>Tournament options</h2>
      <p class="help">Pick the option you want. The recommendation prioritizes finishing early while still giving later games a bigger feel.</p>
      <div class="grid three">
        ${state.options.map((o) => renderOptionCard(o)).join('')}
      </div>
    </section>
  `;
}

function renderOptionCard(o) {
  const e = o.estimate;
  const selected = o.id === state.selectedOptionId;
  const pressureClass = e.pressure === 'comfortable' ? 'good' : e.pressure === 'tight' ? 'warn' : 'bad';
  const roundFormats = Object.entries(o.formats).map(([round, points]) => `R${round}: ${points}`).join(' • ');
  return `
    <div class="card option-card ${selected ? 'selected' : ''} ${o.recommended ? 'recommended' : ''}" data-action="choose-option" data-id="${o.id}">
      <h3>${escapeHtml(o.name)}</h3>
      <p class="help">${escapeHtml(o.description)}</p>
      <p><span class="badge ${pressureClass}">${e.pressure.toUpperCase()}</span></p>
      <div class="stat-row">
        <div class="stat"><strong>${C.formatDuration(e.optimisticMinutes)}–${C.formatDuration(e.realisticMinutes)}</strong><span>estimate range</span></div>
        <div class="stat"><strong>${e.counts.total}</strong><span>played matches</span></div>
        <div class="stat"><strong>${e.counts[11] || 0}/${e.counts[15] || 0}/${e.counts[21] || 0}</strong><span>11 / 15 / 21</span></div>
        <div class="stat"><strong>${C.formatDuration(e.availableMinutes)}</strong><span>usable time</span></div>
      </div>
      <p class="help">${roundFormats}</p>
    </div>
  `;
}

function renderControl() {
  if (!state.matches.length) return emptyState();
  updateSessionFromClock();
  const active = activeMatches();
  const activePace = active.map(matchPaceInfo);
  const ready = C.orderedReadyMatches(state.matches, state.currentSessionId);
  const onDeck = ready.slice(0, Math.max(1, freeTables().length || 1));
  const later = ready.slice(onDeck.length);
  const held = state.matches.filter((m) => m.holdUntilSession && m.status !== 'complete');
  return `
    ${state.settings.testMode ? renderTestBanner() : ''}
    ${state.lastMessage ? `<div class="alert good">${escapeHtml(state.lastMessage)}</div>` : ''}
    <section class="card">
      <div class="section-title">
        <h2>Control Board</h2>
        <div class="button-row">
          <button class="secondary" data-action="push">Update Database</button>
          <button class="ghost" data-action="undo">Undo Last Result</button>
          <button class="ghost" data-action="reset-tournament">Reset</button>
        </div>
      </div>
      ${renderTables()}
      ${renderControlPaceSummary(activePace)}
    </section>
    <section class="card">
      <div class="section-title"><h2>Currently Playing / Warming Up</h2><span class="badge muted">${active.length} active</span></div>
      ${active.length ? active.map(renderActiveMatch).join('') : '<p class="help">No active matches. Start a warmup from On Deck.</p>'}
    </section>
    <section class="card">
      <div class="section-title"><h2>On Deck</h2><span class="badge muted">${onDeck.length}</span></div>
      ${onDeck.length ? onDeck.map((m) => renderReadyMatch(m, true)).join('') : '<p class="help">No ready matches right now. The next match depends on current results.</p>'}
    </section>
    <section class="card">
      <div class="section-title"><h2>Available Later</h2><span class="badge muted">${later.length}</span></div>
      ${later.length ? later.map((m) => renderReadyMatch(m, false)).join('') : '<p class="help">No additional ready matches.</p>'}
    </section>
    ${held.length ? `<section class="card"><h2>Held for Later Session</h2>${held.map(renderHeldMatch).join('')}</section>` : ''}
  `;
}

function renderControlPaceSummary(paceItems) {
  if (!paceItems.length) return '<p class="help">No active games right now. Pace will appear here once a warmup or game starts.</p>';
  const worst = paceItems.reduce((max, item) => Math.max(max, item.behindMin), 0);
  const best = paceItems.reduce((min, item) => Math.min(min, item.behindMin), 0);
  let label = 'On pace';
  let cls = 'good';
  if (worst >= 3) {
    label = `${Math.round(worst)}m behind`;
    cls = 'warn';
  } else if (best <= -3) {
    label = `${Math.abs(Math.round(best))}m ahead`;
    cls = 'good';
  }
  return `
    <div class="pace-summary">
      <span class="badge ${cls}" data-pace-summary-label>${label}</span>
      <span class="muted-text" data-pace-summary-text>${paceItems.length} active table${paceItems.length === 1 ? '' : 's'} tracked against expected match length.</span>
    </div>
  `;
}

function renderTables() {
  const activeByTable = new Map(activeMatches().map((m) => [Number(m.tableId), m]));
  return `<div class="table-list">${(state.tables || []).map((t) => {
    const m = activeByTable.get(Number(t.id));
    return `<div class="table-card"><strong>${escapeHtml(t.label)}</strong>${m ? `${playerName(m.playerAId)} vs ${playerName(m.playerBId)}<br><span class="badge ${m.status === 'warming' ? 'warn' : 'good'}">${m.status}</span>` : '<span class="muted-text">Free</span>'}</div>`;
  }).join('')}</div>`;
}

function renderActiveMatch(m) {
  const isWarmup = m.status === 'warming';
  const pace = matchPaceInfo(m);
  return `
    <div class="match-card active" data-match-id="${m.id}">
      <div class="match-title">
        <div>
          <h3>Table ${m.tableId} • Match ${m.displayId}</h3>
          <div class="players">${playerName(m.playerAId)} vs ${playerName(m.playerBId)}</div>
          <div class="meta">${m.roundName} • First to ${m.points} • ${isWarmup ? 'Warming up' : 'Game in progress'}</div>
        </div>
        <div class="match-badges">
          <span class="badge muted">${escapeHtml(m.roundName)}</span>
          <span class="badge ${isWarmup ? 'warn' : 'good'}">${isWarmup ? 'Warmup' : 'Playing'}</span>
        </div>
      </div>
      <div class="timer" data-timer="${isWarmup ? 'warmup' : 'game'}" data-id="${m.id}">--:--</div>
      <div class="active-pace-row" data-pace-id="${m.id}">
        <span data-pace-expected>Expected ${pace.expectedLabel}</span>
        <span data-pace-finish>Projected finish ${C.formatClock(pace.projectedEndMs)}</span>
        <span class="badge ${pace.badgeClass}" data-pace-status>${escapeHtml(pace.statusLabel)}</span>
      </div>
      <div class="button-row" style="margin-top: 12px;">
        ${isWarmup ? `<button class="good" data-action="start-game" data-id="${m.id}">Start Game</button>` : ''}
        ${m.status === 'playing' ? `<button class="good" data-action="finish" data-id="${m.id}" data-winner="${m.playerAId}">${escapeHtml(playerName(m.playerAId))} Won</button><button class="good" data-action="finish" data-id="${m.id}" data-winner="${m.playerBId}">${escapeHtml(playerName(m.playerBId))} Won</button>` : ''}
        <button class="ghost" data-action="cancel-active" data-id="${m.id}">Cancel / Return to Queue</button>
      </div>
    </div>
  `;
}

function matchPaceInfo(match) {
  const isWarmup = match.status === 'warming';
  const settings = state.settings || {};
  const warmupMin = Number(match.warmupDurationMin || settings.standardWarmupMin || 2);
  const expectedTotalMin = C.occupancyMinutesForMatch(match, settings, warmupMin);
  const expectedGameMin = C.gameMinutesForPoints(match.points, settings);
  const start = isWarmup ? Number(match.warmupStartedAt || nowMs()) : Number(match.gameStartedAt || nowMs());
  const elapsedMin = Math.max(0, (nowMs() - start) / C.MINUTE);
  const expectedForCurrentState = isWarmup ? expectedTotalMin : expectedGameMin;
  const remainingMin = Math.max(0, expectedForCurrentState - elapsedMin);
  const behindMin = elapsedMin - expectedForCurrentState;
  let statusLabel = 'On pace';
  let badgeClass = 'good';
  if (behindMin >= 1) {
    statusLabel = `${Math.round(behindMin)}m over`;
    badgeClass = behindMin >= 3 ? 'warn' : 'muted';
  } else if (behindMin <= -1) {
    statusLabel = `${Math.round(Math.abs(behindMin))}m left`;
    badgeClass = 'good';
  }
  return {
    expectedLabel: isWarmup ? C.formatDuration(expectedTotalMin) : C.formatDuration(expectedGameMin),
    projectedEndMs: nowMs() + remainingMin * C.MINUTE,
    behindMin,
    statusLabel,
    badgeClass,
  };
}

function renderReadyMatch(m, onDeck) {
  const est = estimatedForMatch(m.id);
  const safety = C.canStartMatch(m, est?.estimatedStartMs || nowMs(), state.settings, recommendedWarmupMinutes());
  const safetyClass = safety.level === 'safe' ? 'good' : safety.level === 'tight' ? 'warn' : safety.level === 'unsafe' ? 'bad' : 'muted';
  return `
    <div class="match-card ${safety.level === 'unsafe' ? 'warning' : ''}">
      <div class="match-title">
        <div>
          <h3>${onDeck ? 'On Deck' : 'Ready'} • Match ${m.displayId}</h3>
          <div class="players">${playerName(m.playerAId)} vs ${playerName(m.playerBId)}</div>
          <div class="meta">${m.roundName} • First to ${m.points} • Est. ${est ? C.formatClock(est.estimatedStartMs) : 'soon'}</div>
        </div>
        <div class="match-badges">
          <span class="badge muted">${escapeHtml(m.roundName)}</span>
          <span class="badge ${safetyClass}">${safety.level.toUpperCase()}</span>
        </div>
      </div>
      <p class="help">${escapeHtml(safety.message)}</p>
      <div class="button-row">
        <button class="good" data-action="start-warmup" data-id="${m.id}">Start Warmup</button>
        ${safety.level === 'unsafe' ? `<button class="warn" data-action="start-anyway" data-id="${m.id}">Start Anyway</button>` : ''}
        <button class="secondary" data-action="prioritize" data-id="${m.id}">Prioritize This Game</button>
        <button class="ghost" data-action="delay" data-id="${m.id}">Delay</button>
        <button class="ghost" data-action="tomorrow" data-id="${m.id}">Delay Until Tomorrow</button>
      </div>
    </div>
  `;
}

function renderHeldMatch(m) {
  const session = C.sessionWindows(state.settings).find((s) => s.id === m.holdUntilSession);
  return `
    <div class="match-card">
      <h3>Match ${m.displayId}</h3>
      <div class="players">${playerName(m.playerAId)} vs ${playerName(m.playerBId)}</div>
      <p><span class="badge muted">${escapeHtml(m.roundName)}</span></p>
      <p class="help">Held for ${session?.label || m.holdUntilSession}.</p>
      <button class="secondary" data-action="prioritize" data-id="${m.id}">Release / Prioritize</button>
    </div>
  `;
}

function renderOverview() {
  if (!state.matches.length) return emptyState();
  updateSessionFromClock();
  const active = activeMatches();
  const ready = C.orderedReadyMatches(state.matches, state.currentSessionId);
  const upcoming = ready.slice(0, 8);
  const champion = state.matches.find((m) => m.roundName === 'Final' && m.status === 'complete')?.winnerId;
  return `
    ${state.settings.testMode ? renderTestBanner() : ''}
    <section class="card">
      <div class="section-title">
        <h2>Tournament Overview</h2>
        <div class="button-row">
          <button class="secondary" data-action="pull">Retrieve Database</button>
          <span class="badge ${champion ? 'good' : 'muted'}">${champion ? `Champion: ${escapeHtml(playerName(champion))}` : 'In Progress'}</span>
        </div>
      </div>
      <div class="grid two">
        <div>
          <label for="playerSearch">Player lookup</label>
          <input id="playerSearch" placeholder="Type a player name…" />
          <div id="playerSearchResults" style="margin-top: 12px;"></div>
        </div>
        <div>
          <h3>For the helper</h3>
          <p class="help">Use this page to answer “when do I play?” and line up the next few games. It intentionally has no match-control buttons.</p>
          <p><span class="badge muted">Last local update: ${C.formatClock(nowMs())}</span></p>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Playing Now</h2>
      <div class="overview-hero">
      ${active.length ? active.map((m) => `
        <div class="match-card active">
          <h3>Table ${m.tableId} • ${m.status === 'warming' ? 'Warming Up' : 'Playing'}</h3>
          <div class="players">${playerName(m.playerAId)} vs ${playerName(m.playerBId)}</div>
          <div class="meta">Match ${m.displayId} • ${m.roundName} • First to ${m.points}</div>
          <div class="timer small" data-timer="${m.status === 'warming' ? 'warmup' : 'game'}" data-id="${m.id}">--:--</div>
        </div>`).join('') : '<p class="help">No matches currently active.</p>'}
      </div>
    </section>
    <section class="card">
      <h2>On Deck / Coming Soon</h2>
      ${upcoming.length ? upcoming.map((m, idx) => renderOverviewMatch(m, idx)).join('') : '<p class="help">No ready matches yet. Waiting on current results.</p>'}
    </section>
  `;
}

function renderOverviewMatch(m, idx) {
  const est = estimatedForMatch(m.id);
  const status = idx < Math.max(1, freeTables().length || 1) ? 'ON DECK' : idx < 4 ? 'COMING SOON' : 'LATER';
  const cls = status === 'ON DECK' ? 'warn' : status === 'COMING SOON' ? 'good' : 'muted';
  const check = est?.startCheck;
  const tomorrowText = check?.level === 'unsafe' && check.nextSession ? `Likely ${check.nextSession.label}` : `Approx. ${est ? C.formatClock(est.estimatedStartMs) : 'soon'}`;
  return `
    <div class="match-card">
      <div class="match-title">
        <div>
          <h3>Match ${m.displayId} • ${m.roundName}</h3>
          <div class="players">${playerName(m.playerAId)} vs ${playerName(m.playerBId)}</div>
          <div class="meta">${tomorrowText} • First to ${m.points}</div>
        </div>
        <span class="badge ${cls}">${status}</span>
      </div>
    </div>
  `;
}

function renderPlayerSearch(term) {
  const box = document.getElementById('playerSearchResults');
  if (!box) return;
  const q = String(term || '').trim().toLowerCase();
  if (!q) { box.innerHTML = '<p class="help">Search for a name to see current and possible next match.</p>'; return; }
  const player = state.players.find((p) => p.name.toLowerCase().includes(q));
  if (!player) { box.innerHTML = '<p class="help">No player found.</p>'; return; }
  const involved = state.matches.filter((m) => [m.playerAId, m.playerBId, m.winnerId].includes(player.id));
  const active = involved.find((m) => ['warming', 'playing'].includes(m.status));
  const ready = involved.find((m) => m.status === 'ready' || m.status === 'delayed');
  const completed = involved.filter((m) => m.status === 'complete' && !m.isBye);
  const eliminated = completed.some((m) => m.loserId === player.id);
  let html = `<div class="player-search-result"><h3>${escapeHtml(player.name)} <span class="badge muted">Seed #${player.seed}</span></h3>`;
  if (eliminated) html += '<p><span class="badge bad">Eliminated</span></p>';
  else if (active) html += `<p><span class="badge good">${active.status.toUpperCase()}</span> Table ${active.tableId}, Match ${active.displayId}</p>`;
  else if (ready) {
    const est = estimatedForMatch(ready.id);
    html += `<p><span class="badge warn">NEXT MATCH</span> Match ${ready.displayId}: ${playerName(ready.playerAId)} vs ${playerName(ready.playerBId)}<br>Approx. ${est ? C.formatClock(est.estimatedStartMs) : 'soon'}</p>`;
  } else {
    const waiting = state.matches.find((m) => (m.slotA.kind === 'winner' || m.slotB.kind === 'winner') && !m.winnerId && [m.playerAId, m.playerBId].includes(player.id));
    html += `<p><span class="badge muted">WAITING</span> ${waiting ? 'Waiting on another match result.' : 'No current match visible yet.'}</p>`;
  }
  html += '</div>';
  box.innerHTML = html;
}

function renderBracket() {
  if (!state.matches.length) return emptyState();
  const rounds = [...new Set(state.matches.map((m) => m.round))];
  const estimates = tournamentEstimateMap();
  const collapsed = state.ui?.collapsedRounds || {};
  const firstOpenRound = rounds.find((round) => !collapsed[round]) || rounds[rounds.length - 1];
  const lastRound = rounds[rounds.length - 1];
  const layout = buildBracketVisualLayout(rounds, firstOpenRound);
  return `
    <section class="card">
      <div class="section-title">
        <h2>Bracket</h2>
        <button class="secondary" data-action="pull">Retrieve Database</button>
      </div>
      <p class="help">Collapse the earliest round to pull later rounds together. Estimated times are approximate and update as matches finish.</p>
      <div class="bracket-rounds">
        ${rounds.map((round) => {
          const ms = visibleBracketMatches(round);
          const allRoundMatches = state.matches.filter((m) => m.round === round);
          const byeMatches = round === 1 ? allRoundMatches.filter((m) => m.isBye) : [];
          const isCollapsed = !!collapsed[round];
          const canExpand = isCollapsed;
          const canCollapse = !isCollapsed && round === firstOpenRound && round !== lastRound;
          return `
            <div class="bracket-round ${isCollapsed ? 'collapsed' : ''}" style="--bracket-rows: ${layout.totalRows};">
              ${renderBracketRoundHeader(round, allRoundMatches[0]?.roundName || `Round ${round}`, isCollapsed, allRoundMatches, canExpand || canCollapse)}
              ${ms.map((m) => renderBracketMatch(m, estimates, isCollapsed, layout)).join('')}
              ${byeMatches.length ? renderByeSummary(byeMatches, isCollapsed, layout.totalRows) : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function visibleBracketMatches(round) {
  return state.matches.filter((m) => m.round === round && !(round === 1 && m.isBye));
}

function buildBracketVisualLayout(rounds, firstOpenRound) {
  const rowStarts = new Map();
  const visibleByRound = new Map(rounds.map((round) => [round, visibleBracketMatches(round)]));
  let maxRow = 2;

  rounds.forEach((round) => {
    if (round < firstOpenRound) return;
    const matches = visibleByRound.get(round) || [];
    const previousVisible = visibleByRound.get(round - 1) || [];
    matches.forEach((match, idx) => {
      let rowStart;
      if (round === firstOpenRound) {
        rowStart = (idx * 2) + 2;
      } else {
        const feederRows = [match.slotA, match.slotB]
          .map((slot) => {
            if (slot.kind !== 'winner') return null;
            const source = getMatch(slot.sourceMatchId);
            if (!source || (source.round === 1 && source.isBye)) return null;
            return rowStarts.get(source.id) || null;
          })
          .filter((row) => row != null);

        const sourceMatches = [match.slotA, match.slotB]
          .filter((slot) => slot.kind === 'winner')
          .map((slot) => getMatch(slot.sourceMatchId))
          .filter(Boolean);
        const hasHiddenByeFeeder = sourceMatches.some((source) => source.round === 1 && source.isBye);

        if (feederRows.length === 1 && hasHiddenByeFeeder) {
          rowStart = feederRows[0];
        } else if (feederRows.length === 2) {
          rowStart = Math.round((feederRows[0] + feederRows[1]) / 2);
        } else {
          const visibleScale = Math.max(1, previousVisible.length / Math.max(1, matches.length));
          rowStart = Math.round((idx * visibleScale * 2) + visibleScale + 1);
        }
      }
      const previousMatch = matches[idx - 1];
      const previousRow = previousMatch ? rowStarts.get(previousMatch.id) : null;
      if (previousRow != null && rowStart < previousRow + 2) rowStart = previousRow + 2;
      rowStarts.set(match.id, rowStart);
      maxRow = Math.max(maxRow, rowStart + 2);
    });
  });

  return {
    rowStarts,
    totalRows: Math.max(maxRow + 2, visibleBracketMatches(firstOpenRound).length * 2 + 2, 4),
  };
}

function renderBracketRoundHeader(round, label, isCollapsed, matches, showToggle) {
  const activeCount = matches.filter((m) => ['warming', 'playing'].includes(m.status)).length;
  const completeCount = matches.filter((m) => m.status === 'complete' && !m.isBye).length;
  return `
    <div class="bracket-round-header">
      <h3>${escapeHtml(label)}</h3>
      ${showToggle ? `<button class="ghost bracket-collapse-btn" data-action="toggle-round" data-round="${round}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${escapeAttr(label)}">
        <span>${isCollapsed ? '>' : 'v'}</span>
      </button>` : '<span class="bracket-collapse-spacer"></span>'}
      <div class="bracket-round-summary">
        <span class="badge muted">${matches.length}</span>
        ${activeCount ? `<span class="badge good">${activeCount} live</span>` : ''}
        ${completeCount ? `<span class="badge muted">${completeCount} done</span>` : ''}
      </div>
    </div>
  `;
}

function renderBracketMatch(m, estimates, isCollapsed = false, layout = null) {
  const rowStart = layout?.rowStarts?.get(m.id) || 2;
  const estimate = estimates.get(m.id);
  const isActive = ['warming', 'playing'].includes(m.status);
  const detailLabel = bracketMatchDetailLabel(estimate, m);
  if (isCollapsed) {
    return `
      <div class="bracket-match compact ${isActive ? 'active' : ''}">
        <strong>M${m.displayId}</strong>
        <span>${escapeHtml(detailLabel)}</span>
      </div>
    `;
  }
  return `
    <div class="bracket-match ${isActive ? 'active' : ''}" style="grid-row: ${rowStart} / span 2;">
      <div class="bracket-match-head">
        <strong>Match ${m.displayId}</strong>
        <span class="badge muted">First to ${m.points}</span>
      </div>
      <div class="bracket-estimate ${isActive ? 'active-status' : ''}">${escapeHtml(detailLabel)}</div>
      ${renderBracketPlayer(m, 'A')}
      ${renderBracketPlayer(m, 'B')}
    </div>
  `;
}

function bracketMatchDetailLabel(estimate, match) {
  if (match.status === 'warming') return `Warming Table ${match.tableId || estimate?.tableId || '?'}`;
  if (match.status === 'playing') return `Playing Table ${match.tableId || estimate?.tableId || '?'}`;
  if (match.status === 'complete') return match.isBye ? 'BYE' : 'Done';
  return formatEstimateLabel(estimate, match);
}

function renderByeSummary(byeMatches, isCollapsed, totalRows) {
  const names = byeMatches
    .map((m) => playerName(m.winnerId || m.playerAId || m.playerBId))
    .filter(Boolean);
  if (!names.length) return '';
  if (isCollapsed) {
    return `
      <div class="bracket-bye-summary compact">
        <strong>Byes</strong>
        <span>${names.length}</span>
      </div>
    `;
  }
  return `
    <div class="bracket-bye-summary" style="grid-row: ${totalRows + 2} / span 2;">
      <strong>First-round byes</strong>
      <div>${names.map((name) => `<span>${escapeHtml(name)}</span>`).join('')}</div>
    </div>
  `;
}

function formatEstimateLabel(estimate, match) {
  if (match.status === 'complete') return match.isBye ? 'BYE' : 'Done';
  if (estimate?.active) return `EST Now, Table ${estimate.tableId || match.tableId || '?'}`;
  if (!estimate?.estimatedStartMs) return 'EST TBD';
  const start = estimate.estimatedStartMs;
  const current = new Date(nowMs());
  const date = new Date(start);
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const estimateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((estimateDay - currentDay) / (24 * 60 * 60 * 1000));
  const time = C.formatClock(start);
  if (dayDiff === 0) return `EST ${time}`;
  if (dayDiff === 1) return `EST Tomorrow ${time}`;
  const session = C.sessionWindows(state.settings).find((w) => w.startMs && start >= w.startMs && start <= w.endMs);
  return `EST ${session?.label || date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

function renderBracketPlayer(matchOrId, slotNameOrWinnerId) {
  if (typeof matchOrId === 'object') {
    const match = matchOrId;
    const slotName = slotNameOrWinnerId;
    const id = slotName === 'A' ? match.playerAId : match.playerBId;
    const slot = slotName === 'A' ? match.slotA : match.slotB;
    return renderBracketPlayerSlot(id, match.winnerId, slot);
  }
  return renderBracketPlayerSlot(matchOrId, slotNameOrWinnerId, null);
}

function renderBracketPlayerSlot(id, winnerId, slot) {
  const player = state.players.find((p) => p.id === id);
  if (!player) {
    const label = slot?.kind === 'winner' ? `Winner of Match ${sourceMatchDisplayId(slot.sourceMatchId)}` : 'TBD';
    return `<div class="bracket-player tbd"><span>${escapeHtml(label)}</span></div>`;
  }
  return `<div class="bracket-player ${winnerId === id ? 'winner' : ''}"><span>${escapeHtml(player.name)}</span><span>#${player.seed}</span></div>`;
}

function sourceMatchDisplayId(matchId) {
  return getMatch(matchId)?.displayId || '?';
}

function renderTournamentOptions() {
  const tournaments = state.sync.availableTournaments || [];
  if (!tournaments.length) return '<option value="">Refresh list to choose a tournament</option>';
  return tournaments.map((t) => `<option value="${escapeAttr(t.id)}" ${t.id === state.sync.tournamentId ? 'selected' : ''}>${escapeHtml(t.name)}${t.updatedAt ? ` - ${new Date(t.updatedAt).toLocaleString()}` : ''}</option>`).join('');
}

function renderSyncQa() {
  return `
    ${state.settings.testMode ? renderTestBanner() : ''}
    <section class="card">
      <h2>Device Role</h2>
      <p class="help">Master is the tournament director device. Viewer is for a helper or public display and should refresh from Firebase or import a snapshot.</p>
      <label for="roleSelect">This device role</label>
      <select id="roleSelect" data-input="role">
        <option value="master" ${state.role === 'master' ? 'selected' : ''}>Master / control device</option>
        <option value="viewer" ${state.role === 'viewer' ? 'selected' : ''}>Viewer / helper device</option>
      </select>
    </section>
    <section class="card">
      <h2>Firestore Tournament Sync</h2>
      <p class="help">Optional manual sync. Master uses Update Database; helper devices choose this tournament and use Retrieve Database.</p>
      <div class="grid two">
        <div>
          <label>Current tournament</label>
          <input data-input="tournament-name" value="${escapeAttr(state.sync.tournamentName || '')}" />
          <p class="help">Firestore path: <span class="kbd">tournaments/${escapeHtml(state.sync.tournamentId || tournamentIdFromName(state.sync.tournamentName))}</span></p>
        </div>
        <div>
          <label>Load existing tournament</label>
          <select data-input="tournament-select">${renderTournamentOptions()}</select>
          <p class="help">Last list refresh: ${state.sync.lastListedAt ? C.formatClock(state.sync.lastListedAt) : 'never'}</p>
        </div>
      </div>
      <div class="button-row" style="margin-top: 12px;">
        <button data-action="list-tournaments">Refresh Tournament List</button>
        <button class="secondary" data-action="pull">Retrieve Database</button>
        <button class="secondary" data-action="push">Update Database</button>
        <button class="bad" data-action="delete-tournament">Delete From Firestore</button>
      </div>
      <p class="help">Last pushed: ${state.sync.lastPushedAt ? C.formatClock(state.sync.lastPushedAt) : 'never'} • Last refreshed: ${state.sync.lastPulledAt ? C.formatClock(state.sync.lastPulledAt) : 'never'}</p>
      <details>
        <summary>Advanced Firebase details</summary>
        <p class="help">Project ID is fixed for this app. Keep this only in case you need to troubleshoot later.</p>
        <label>Firebase project ID</label>
        <input data-input="project-id" value="${escapeAttr(state.sync.projectId || 'beau-games')}" />
      </details>
      ${state.sync.lastError ? `<div class="alert bad">${escapeHtml(state.sync.lastError)}</div>` : ''}
    </section>
    <section class="card">
      <h2>Offline Snapshot Backup</h2>
      <p class="help">Use this if internet is not available. Download a JSON snapshot from the master device and import it on another device.</p>
      <button data-action="download-snapshot">Download Snapshot JSON</button>
      <hr>
      <label for="importText">Paste snapshot JSON to import</label>
      <textarea id="importText" style="min-height: 150px;"></textarea>
      <button id="importBtn" class="secondary">Import Snapshot</button>
    </section>
    <section class="card">
      <h2>QA Test Controls</h2>
      <p class="help">Use these before the retreat. They exercise the actual tournament logic, timers, buttons, bracket advancement, and Friday/Saturday cutoff behavior.</p>
      <div class="button-row">
        <button class="ghost" data-action="jump-clock" data-target="friday-start">Jump to Friday Start</button>
        <button class="ghost" data-action="jump-clock" data-target="friday-cutoff">Jump Near Friday Cutoff</button>
        <button class="ghost" data-action="jump-clock" data-target="saturday-start">Jump to Saturday Start</button>
        <button class="warn" data-action="test-complete-next">Test: Start/Finish Next</button>
      </div>
      <p class="help">The Test: Start/Finish Next button either starts the next ready warmup or randomly finishes the first active match. It is only for fast QA clicking.</p>
    </section>
    <section class="card">
      <h2>Recent Event Log</h2>
      <pre>${escapeHtml((state.history || []).slice(-30).map((h) => `${C.formatClock(h.at)} - ${h.message}`).join('\n') || 'No events yet.')}</pre>
    </section>
    <section class="card">
      <h2>Danger Zone</h2>
      <button class="bad" data-action="hard-reset">Delete All Local Data</button>
    </section>
  `;
}

function renderTestBanner() {
  return `<div class="alert warn"><strong>TEST MODE ACTIVE.</strong> Clock speed: ${state.settings.timeScale}x. Current test time: ${C.formatClock(nowMs())}. Turn this off before the real tournament.</div>`;
}

function emptyState() {
  return document.getElementById('emptyStateTemplate').innerHTML;
}

function updateVisibleTimers() {
  document.querySelectorAll('[data-timer]').forEach((el) => {
    const match = getMatch(el.dataset.id);
    if (!match) return;
    if (el.dataset.timer === 'warmup') {
      const total = Number(match.warmupDurationMin || state.settings.standardWarmupMin || 2) * C.MINUTE;
      const elapsed = Math.max(0, nowMs() - Number(match.warmupStartedAt || nowMs()));
      const remaining = Math.max(0, total - elapsed);
      el.textContent = remaining > 0 ? mmss(remaining) : '0:00 READY';
    }
    if (el.dataset.timer === 'game') {
      const elapsed = Math.max(0, nowMs() - Number(match.gameStartedAt || nowMs()));
      el.textContent = mmss(elapsed);
    }
  });
}

function updateVisiblePace() {
  const paceItems = [];
  document.querySelectorAll('[data-pace-id]').forEach((row) => {
    const match = getMatch(row.dataset.paceId);
    if (!match) return;
    const pace = matchPaceInfo(match);
    paceItems.push(pace);
    const expected = row.querySelector('[data-pace-expected]');
    const finish = row.querySelector('[data-pace-finish]');
    const status = row.querySelector('[data-pace-status]');
    if (expected) expected.textContent = `Expected ${pace.expectedLabel}`;
    if (finish) finish.textContent = `Projected finish ${C.formatClock(pace.projectedEndMs)}`;
    if (status) {
      status.textContent = pace.statusLabel;
      status.className = `badge ${pace.badgeClass}`;
    }
  });

  const summaryLabel = document.querySelector('[data-pace-summary-label]');
  const summaryText = document.querySelector('[data-pace-summary-text]');
  if (!summaryLabel || !summaryText || !paceItems.length) return;
  const worst = paceItems.reduce((max, item) => Math.max(max, item.behindMin), 0);
  const best = paceItems.reduce((min, item) => Math.min(min, item.behindMin), 0);
  let label = 'On pace';
  let cls = 'good';
  if (worst >= 3) {
    label = `${Math.round(worst)}m behind`;
    cls = 'warn';
  } else if (best <= -3) {
    label = `${Math.abs(Math.round(best))}m ahead`;
    cls = 'good';
  }
  summaryLabel.textContent = label;
  summaryLabel.className = `badge ${cls}`;
  summaryText.textContent = `${paceItems.length} active table${paceItems.length === 1 ? '' : 's'} tracked against expected match length.`;
}

function mmss(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
});

render();
renderTimer = setInterval(() => {
  tickClock();
}, 1000);
