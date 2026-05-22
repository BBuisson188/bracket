/*
  Ping Pong Retreat Tournament - pure logic helpers
  This file intentionally has no DOM dependencies so it can be tested in Node or reused by Codex.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PingPongCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MINUTE = 60 * 1000;

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nextPowerOfTwo(n) {
    if (n <= 1) return 2;
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  function seedOrder(size) {
    if (size === 1) return [1];
    const prev = seedOrder(size / 2);
    const out = [];
    prev.forEach((seed) => {
      out.push(seed);
      out.push(size + 1 - seed);
    });
    return out;
  }

  function parsePlayers(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name, idx) => ({
        id: `p${idx + 1}`,
        seed: idx + 1,
        name,
      }));
  }

  function roundName(round, totalRounds) {
    const remaining = totalRounds - round + 1;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinal';
    if (remaining === 3) return 'Quarterfinal';
    return `Round ${round}`;
  }

  function formatLabel(points) {
    return `First to ${points}`;
  }

  function defaultRoundFormats(totalRounds, style) {
    const formats = {};
    for (let r = 1; r <= totalRounds; r += 1) formats[r] = 11;

    if (style === 'fast') {
      if (totalRounds >= 1) formats[totalRounds] = 21;
      if (totalRounds >= 2) formats[totalRounds - 1] = 21;
    }

    if (style === 'balanced') {
      if (totalRounds >= 1) formats[totalRounds] = 21;
      if (totalRounds >= 2) formats[totalRounds - 1] = 21;
      if (totalRounds >= 3) formats[totalRounds - 2] = 15;
    }

    if (style === 'relaxed') {
      for (let r = 1; r <= totalRounds; r += 1) formats[r] = 15;
      if (totalRounds <= 3) {
        for (let r = 1; r <= totalRounds; r += 1) formats[r] = 21;
      } else {
        formats[totalRounds] = 21;
        formats[totalRounds - 1] = 21;
        if (totalRounds >= 3) formats[totalRounds - 2] = 21;
      }
    }

    return formats;
  }

  function formatScore(roundFormats) {
    return Object.values(roundFormats).reduce((sum, points) => sum + Number(points || 11), 0);
  }

  function upgradeRoundFormats(totalRounds, targetScore) {
    const formats = {};
    for (let r = 1; r <= totalRounds; r += 1) formats[r] = 11;

    const upgradeOrder = [];
    for (let r = totalRounds; r >= 1; r -= 1) upgradeOrder.push({ round: r, points: 21 });
    for (let r = totalRounds; r >= 1; r -= 1) upgradeOrder.push({ round: r, points: 15 });

    let currentScore = formatScore(formats);
    upgradeOrder.forEach(({ round, points }) => {
      if (formats[round] >= points) return;
      const nextScore = currentScore + (points - formats[round]);
      if (nextScore <= targetScore) {
        formats[round] = points;
        currentScore = nextScore;
      }
    });
    return formats;
  }

  function generateFormatCandidates(totalRounds, rules = {}) {
    const candidates = [];
    const pointChoices = [11, 15, 21];
    const minFinalPoints = rules.allowShortFinal ? 11 : 21;
    const minSemifinalPoints = rules.allowShortSemifinal ? 11 : 15;

    function build(round, formats) {
      if (round > totalRounds) {
        candidates.push({ ...formats });
        return;
      }
      pointChoices.forEach((points) => {
        if (round > 1 && points < formats[round - 1]) return;
        if (round === totalRounds && points < minFinalPoints) return;
        if (round === totalRounds - 1 && points < minSemifinalPoints) return;
        formats[round] = points;
        build(round + 1, formats);
      });
    }

    build(1, {});
    return candidates.sort((a, b) => formatScore(a) - formatScore(b));
  }

  function allRoundsFormat(totalRounds, points) {
    const formats = {};
    for (let r = 1; r <= totalRounds; r += 1) formats[r] = points;
    return formats;
  }

  function chooseSmartFormats(playerCount, tableCount, totalRounds, settings, targetMinutes, maxMinutes, rules = {}) {
    const candidates = generateFormatCandidates(totalRounds, rules);
    let best = candidates[0];
    let bestDistance = Infinity;
    candidates.forEach((formats) => {
      const estimate = estimateOption(playerCount, tableCount, formats, settings);
      if (estimate.realisticMinutes <= maxMinutes) {
        const distance = Math.abs(targetMinutes - estimate.realisticMinutes);
        if (distance < bestDistance || (distance === bestDistance && formatScore(formats) > formatScore(best))) {
          bestDistance = distance;
          best = formats;
        }
      } else if (bestDistance === Infinity && estimate.realisticMinutes < estimateOption(playerCount, tableCount, best, settings).realisticMinutes) {
        best = formats;
      }
    });
    return best;
  }

  function gameMinutesForPoints(points, settings = {}) {
    const durations = settings.gameDurations || {};
    if (points === 11) return Number(durations[11] ?? 7);
    if (points === 15) return Number(durations[15] ?? 10);
    if (points === 21) return Number(durations[21] ?? 14);
    return Math.max(5, Math.round(points * 0.65));
  }

  function occupancyMinutesForMatch(matchOrPoints, settings = {}, warmupOverride = null) {
    const points = typeof matchOrPoints === 'number' ? matchOrPoints : Number(matchOrPoints.points || 11);
    const warmup = warmupOverride == null ? Number(settings.standardWarmupMin ?? 2) : Number(warmupOverride);
    const transition = Number(settings.transitionMin ?? 1);
    return warmup + gameMinutesForPoints(points, settings) + transition;
  }

  function sessionMinutes(settings = {}) {
    const late = Number(settings.lateStartBufferMin ?? 10);
    const end = Number(settings.endBufferMin ?? 15);
    const sessions = settings.sessions || defaultSessions();
    return sessions.map((s) => {
      const start = parseTimeToMinutes(s.startTime);
      const endM = parseTimeToMinutes(s.endTime);
      const raw = Math.max(0, endM - start);
      const effective = Math.max(0, raw - late - end);
      return { ...s, rawMinutes: raw, effectiveMinutes: effective };
    });
  }

  function totalEffectiveMinutes(settings = {}) {
    return sessionMinutes(settings).reduce((sum, session) => sum + session.effectiveMinutes, 0);
  }

  function doubleEliminationMatchCounts(playersCount, roundFormats) {
    const total = Math.max(0, (playersCount * 2) - 1);
    const championshipRound = Math.max(...Object.keys(roundFormats || { 1: 11 }).map(Number));
    const counts = { total, 11: 0, 15: 0, 21: 0 };
    const finalPoints = roundFormats?.[championshipRound] || 11;
    const earlyPoints = roundFormats?.[1] || 11;
    counts[earlyPoints] = Math.max(0, total - 1);
    counts[finalPoints] = (counts[finalPoints] || 0) + (total > 0 ? 1 : 0);
    return counts;
  }

  function optionMatchCounts(playersCount, totalRounds, roundFormats, tournamentFormat = 'single-elimination') {
    if (tournamentFormat === 'double-elimination') return doubleEliminationMatchCounts(playersCount, roundFormats);
    const counts = { total: Math.max(0, playersCount - 1), 11: 0, 15: 0, 21: 0 };
    const size = nextPowerOfTwo(playersCount);
    for (let r = 1; r <= totalRounds; r += 1) {
      const matchesThisRound = size / Math.pow(2, r);
      const points = roundFormats[r] || 11;
      // Real completed matches in a single-elimination tournament are always players - 1,
      // but bye matches appear in the generated bracket. Estimate playable first-round matches
      // by subtracting first-round byes.
      let playable = matchesThisRound;
      if (r === 1) playable = Math.max(0, playersCount - size / 2);
      counts[points] = (counts[points] || 0) + playable;
    }
    counts.total = counts[11] + counts[15] + counts[21];
    return counts;
  }

  function estimateOption(playersCount, tableCount, roundFormats, settings = {}, tournamentFormat = 'single-elimination') {
    const size = nextPowerOfTwo(playersCount);
    const totalRounds = Math.log2(size);
    const counts = optionMatchCounts(playersCount, totalRounds, roundFormats, tournamentFormat);
    let tableMinutes = 0;
    [11, 15, 21].forEach((points) => {
      tableMinutes += (counts[points] || 0) * occupancyMinutesForMatch(points, settings);
    });
    const tables = Math.max(1, Number(tableCount || 1));
    const optimistic = tableMinutes / tables / 0.95;
    const realistic = tableMinutes / tables / 0.8;
    const conservative = tableMinutes / tables / 0.68;
    const available = totalEffectiveMinutes(settings);
    let pressure = 'comfortable';
    if (conservative > available) pressure = 'tight';
    if (realistic > available) pressure = 'risky';
    return {
      tableMinutes: Math.round(tableMinutes),
      optimisticMinutes: Math.round(optimistic),
      realisticMinutes: Math.round(realistic),
      conservativeMinutes: Math.round(conservative),
      availableMinutes: Math.round(available),
      pressure,
      counts,
    };
  }

  function generateTournamentOptions(players, settings = {}) {
    const playerCount = Array.isArray(players) ? players.length : Number(players || 0);
    const tableCount = Number(settings.tables || 2);
    const size = nextPowerOfTwo(playerCount);
    const totalRounds = Math.log2(size);
    const available = totalEffectiveMinutes(settings);
    const fastMax = Math.min(180, available * 0.9);
    const balancedMax = Math.min(190, available * 0.95);
    const relaxedMax = available;
    const fastFormats = playerCount > 28
      ? allRoundsFormat(totalRounds, 11)
      : chooseSmartFormats(playerCount, tableCount, totalRounds, settings, fastMax, fastMax);
    const balancedFormats = chooseSmartFormats(
      playerCount,
      tableCount,
      totalRounds,
      settings,
      Math.min(185, balancedMax),
      balancedMax,
      { allowShortSemifinal: playerCount > 28 }
    );
    const relaxedFormats = chooseSmartFormats(playerCount, tableCount, totalRounds, settings, available, relaxedMax);
    const rawOptions = [
      {
        id: 'fast',
        name: 'Fast / Safest',
        description: 'Protects the schedule first. Uses the longest game formats that still leave a large time cushion.',
        tournamentFormat: 'single-elimination',
        formats: fastFormats,
      },
      {
        id: 'balanced',
        name: 'Balanced',
        description: 'Middle option. Adds longer games when the player count, tables, and session windows make room.',
        tournamentFormat: 'single-elimination',
        formats: balancedFormats,
      },
      {
        id: 'relaxed',
        name: 'Relaxed',
        description: 'Most generous safe option. Can become all 21-point games when the schedule clearly allows it.',
        tournamentFormat: 'single-elimination',
        formats: relaxedFormats,
      },
    ];

    if (settings.allowDoubleElimination && playerCount >= 4 && playerCount <= 17) {
      const doubleRounds = Math.max(1, (Math.log2(size) * 2) - 1);
      const doubleFormats = allRoundsFormat(doubleRounds, 11);
      rawOptions[2] = {
        id: 'double-elimination',
        name: 'Double Elimination',
        description: 'Everyone gets a second life. Uses 11-point games throughout, with a second 11-point final if the losers bracket winner takes the championship.',
        tournamentFormat: 'double-elimination',
        formats: doubleFormats,
      };
    }

    const estimated = rawOptions.map((option) => ({
      ...option,
      estimate: estimateOption(playerCount, tableCount, option.formats, settings, option.tournamentFormat),
    }));

    // Recommend the most enjoyable option that still protects the schedule.
    let recommendedId = 'fast';
    const relaxed = estimated.find((o) => o.id === 'relaxed');
    const balanced = estimated.find((o) => o.id === 'balanced');
    const doubleElimination = estimated.find((o) => o.id === 'double-elimination');
    if (doubleElimination && doubleElimination.estimate.pressure !== 'risky') {
      recommendedId = 'double-elimination';
    } else if (relaxed && relaxed.estimate.pressure !== 'risky' && relaxed.estimate.realisticMinutes <= relaxed.estimate.availableMinutes * 0.82) {
      recommendedId = 'relaxed';
    } else if (balanced && balanced.estimate.pressure !== 'risky' && balanced.estimate.realisticMinutes <= balanced.estimate.availableMinutes * 0.72) {
      recommendedId = 'balanced';
    }

    return estimated.map((option) => ({
      ...option,
      recommended: option.id === recommendedId,
    }));
  }

  function buildBracket(players, option) {
    if (option?.tournamentFormat === 'double-elimination') return buildDoubleEliminationBracket(players, option);

    const safePlayers = players.map((p, idx) => ({ ...p, seed: idx + 1, id: p.id || `p${idx + 1}` }));
    const size = nextPowerOfTwo(safePlayers.length);
    const totalRounds = Math.log2(size);
    const order = seedOrder(size);
    const bySeed = new Map(safePlayers.map((p) => [p.seed, p]));
    const matches = [];

    let previousRound = [];
    let matchCounter = 1;
    for (let i = 0; i < size; i += 2) {
      const seedA = order[i];
      const seedB = order[i + 1];
      const playerA = bySeed.get(seedA) || null;
      const playerB = bySeed.get(seedB) || null;
      const match = {
        id: `m${matchCounter++}`,
        displayId: matchCounter - 1,
        round: 1,
        roundName: roundName(1, totalRounds),
        roundIndex: i / 2,
        points: option.formats?.[1] || 11,
        slotA: { kind: 'seed', seed: seedA, playerId: playerA?.id || null },
        slotB: { kind: 'seed', seed: seedB, playerId: playerB?.id || null },
        playerAId: playerA?.id || null,
        playerBId: playerB?.id || null,
        status: 'waiting',
        tableId: null,
        winnerId: null,
        loserId: null,
        nextMatchId: null,
        nextSlot: null,
        priority: 0,
        holdUntilSession: null,
        createdAt: Date.now(),
      };
      matches.push(match);
      previousRound.push(match);
    }

    for (let round = 2; round <= totalRounds; round += 1) {
      const nextRound = [];
      for (let i = 0; i < previousRound.length; i += 2) {
        const prevA = previousRound[i];
        const prevB = previousRound[i + 1];
        const match = {
          id: `m${matchCounter++}`,
          displayId: matchCounter - 1,
          round,
          roundName: roundName(round, totalRounds),
          roundIndex: i / 2,
          points: option.formats?.[round] || 11,
          slotA: { kind: 'winner', sourceMatchId: prevA.id, playerId: null },
          slotB: { kind: 'winner', sourceMatchId: prevB.id, playerId: null },
          playerAId: null,
          playerBId: null,
          status: 'waiting',
          tableId: null,
          winnerId: null,
          loserId: null,
          nextMatchId: null,
          nextSlot: null,
          priority: 0,
          holdUntilSession: null,
          createdAt: Date.now(),
        };
        prevA.nextMatchId = match.id;
        prevA.nextSlot = 'A';
        prevB.nextMatchId = match.id;
        prevB.nextSlot = 'B';
        matches.push(match);
        nextRound.push(match);
      }
      previousRound = nextRound;
    }

    propagateWinners(matches);
    return matches;
  }

  function makeMatch(matchCounter, attrs) {
    return {
      id: `m${matchCounter}`,
      displayId: matchCounter,
      status: 'waiting',
      tableId: null,
      winnerId: null,
      loserId: null,
      nextMatchId: null,
      nextSlot: null,
      priority: 0,
      holdUntilSession: null,
      createdAt: Date.now(),
      ...attrs,
    };
  }

  function buildDoubleEliminationBracket(players, option) {
    const safePlayers = players.map((p, idx) => ({ ...p, seed: idx + 1, id: p.id || `p${idx + 1}` }));
    const size = nextPowerOfTwo(safePlayers.length);
    const totalWinnerRounds = Math.log2(size);
    const order = seedOrder(size);
    const bySeed = new Map(safePlayers.map((p) => [p.seed, p]));
    const matches = [];
    let matchCounter = 1;
    let stage = 1;
    let previousWinnerRound = [];
    const makeStageName = (label) => label;

    for (let i = 0; i < size; i += 2) {
      const seedA = order[i];
      const seedB = order[i + 1];
      const playerA = bySeed.get(seedA) || null;
      const playerB = bySeed.get(seedB) || null;
      const match = makeMatch(matchCounter++, {
        round: stage,
        bracketName: 'Winners Bracket',
        roundName: makeStageName(`Winners ${roundName(1, totalWinnerRounds)}`),
        roundIndex: i / 2,
        points: option.formats?.[stage] || 11,
        slotA: { kind: 'seed', seed: seedA, playerId: playerA?.id || null },
        slotB: { kind: 'seed', seed: seedB, playerId: playerB?.id || null },
        playerAId: playerA?.id || null,
        playerBId: playerB?.id || null,
      });
      matches.push(match);
      previousWinnerRound.push(match);
    }

    const winnerRounds = [previousWinnerRound];
    for (let wbRound = 2; wbRound <= totalWinnerRounds; wbRound += 1) {
      stage += 1;
      const nextWinnerRound = [];
      for (let i = 0; i < previousWinnerRound.length; i += 2) {
        const prevA = previousWinnerRound[i];
        const prevB = previousWinnerRound[i + 1];
        const match = makeMatch(matchCounter++, {
          round: stage,
          bracketName: 'Winners Bracket',
          roundName: makeStageName(`Winners ${roundName(wbRound, totalWinnerRounds)}`),
          roundIndex: i / 2,
          points: option.formats?.[stage] || 11,
          slotA: { kind: 'winner', sourceMatchId: prevA.id, playerId: null },
          slotB: { kind: 'winner', sourceMatchId: prevB.id, playerId: null },
          playerAId: null,
          playerBId: null,
        });
        prevA.nextMatchId = match.id;
        prevA.nextSlot = 'A';
        prevB.nextMatchId = match.id;
        prevB.nextSlot = 'B';
        matches.push(match);
        nextWinnerRound.push(match);
      }
      winnerRounds.push(nextWinnerRound);
      previousWinnerRound = nextWinnerRound;
    }

    let loserPool = [];
    let loserRoundNumber = 1;
    const makeLoserRound = (slots, targetCount = null) => {
      if (slots.length <= 1) return slots;
      stage += 1;
      const out = [];
      for (let i = 0; i < slots.length; i += 2) {
        const slotA = slots[i];
        const slotB = slots[i + 1] || null;
        if (!slotB) {
          out.push(slotA);
          continue;
        }
        const match = makeMatch(matchCounter++, {
          round: stage,
          bracketName: 'Losers Bracket',
          roundName: `Losers Round ${loserRoundNumber}`,
          roundIndex: i / 2,
          points: option.formats?.[stage] || 11,
          slotA: { ...slotA, playerId: null },
          slotB: { ...slotB, playerId: null },
          playerAId: null,
          playerBId: null,
        });
        matches.push(match);
        out.push({ kind: 'winner', sourceMatchId: match.id, playerId: null });
      }
      loserRoundNumber += 1;
      if (targetCount && out.length > targetCount) return makeLoserRound(out, targetCount);
      return out;
    };

    winnerRounds.forEach((wbMatches, idx) => {
      const entrants = wbMatches.map((m) => ({ kind: 'loser', sourceMatchId: m.id, playerId: null }));
      loserPool = makeLoserRound([...loserPool, ...entrants]);
      const nextEntrantCount = winnerRounds[idx + 1]?.length || 1;
      if (idx < winnerRounds.length - 1 && loserPool.length > nextEntrantCount) {
        loserPool = makeLoserRound(loserPool, nextEntrantCount);
      }
    });

    stage += 1;
    const winnersFinal = winnerRounds[winnerRounds.length - 1][0];
    const losersChampionSlot = loserPool[0] || { kind: 'loser', sourceMatchId: winnersFinal.id, playerId: null };
    const championship = makeMatch(matchCounter++, {
      round: stage,
      bracketName: 'Championship',
      roundName: 'Championship',
      roundIndex: 0,
      points: 11,
      note: 'If the losers bracket winner wins, play one additional 11-point deciding game.',
      slotA: { kind: 'winner', sourceMatchId: winnersFinal.id, playerId: null },
      slotB: { ...losersChampionSlot, playerId: null },
      playerAId: null,
      playerBId: null,
      priority: 20,
    });
    matches.push(championship);

    propagateWinners(matches);
    return matches;
  }

  function cloneMatches(matches) {
    return JSON.parse(JSON.stringify(matches));
  }

  function propagateWinners(matches) {
    const byId = new Map(matches.map((m) => [m.id, m]));
    let changed = true;
    let guard = 0;
    while (changed && guard < 50) {
      changed = false;
      guard += 1;

      matches.forEach((match) => {
        ['A', 'B'].forEach((slotName) => {
          const slot = slotName === 'A' ? match.slotA : match.slotB;
          if (slot.kind === 'winner' || slot.kind === 'loser') {
            const prev = byId.get(slot.sourceMatchId);
            const resolvedId = slot.kind === 'winner' ? prev?.winnerId : prev?.loserId;
            if (resolvedId && slot.playerId !== resolvedId) {
              slot.playerId = resolvedId;
              if (slotName === 'A') match.playerAId = resolvedId;
              else match.playerBId = resolvedId;
              changed = true;
            }
          }
        });

        if (match.status !== 'complete' && match.status !== 'playing' && match.status !== 'warming') {
          const a = match.playerAId;
          const b = match.playerBId;
          const slotAIsRealBye = match.slotA.kind === 'seed' && !match.slotA.playerId;
          const slotBIsRealBye = match.slotB.kind === 'seed' && !match.slotB.playerId;
          const slotAResolvedEmpty = slotResolvedEmpty(match.slotA, byId);
          const slotBResolvedEmpty = slotResolvedEmpty(match.slotB, byId);

          // Only auto-advance true first-round byes.
          // Do NOT auto-advance future-round matches just because one prior match has finished
          // and the other prior match is still waiting. That was the most important bracket edge case.
          if (!a && !b && slotAResolvedEmpty && slotBResolvedEmpty) {
            match.status = 'complete';
            match.winnerId = null;
            match.loserId = null;
            match.isBye = true;
            changed = true;
          } else if (a && !b && (slotBIsRealBye || slotBResolvedEmpty)) {
            match.status = 'complete';
            match.winnerId = a;
            match.loserId = null;
            match.isBye = true;
            changed = true;
          } else if (!a && b && (slotAIsRealBye || slotAResolvedEmpty)) {
            match.status = 'complete';
            match.winnerId = b;
            match.loserId = null;
            match.isBye = true;
            changed = true;
          } else if (a && b && match.status === 'waiting') {
            match.status = 'ready';
            changed = true;
          }
        }
      });
    }
    return matches;
  }

  function slotResolvedEmpty(slot, byId) {
    if (!slot || slot.kind === 'seed') return false;
    const source = byId.get(slot.sourceMatchId);
    if (!source || source.status !== 'complete') return false;
    if (slot.kind === 'winner') return !source.winnerId;
    if (slot.kind === 'loser') return !source.loserId;
    return false;
  }

  function findPlayer(players, id) {
    return players.find((p) => p.id === id) || null;
  }

  function playerName(players, id) {
    if (!id) return 'TBD';
    return findPlayer(players, id)?.name || 'Unknown Player';
  }

  function completeMatch(matches, matchId, winnerId) {
    const match = matches.find((m) => m.id === matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    if (![match.playerAId, match.playerBId].includes(winnerId)) {
      throw new Error('Winner must be one of the match players.');
    }
    match.status = 'complete';
    match.winnerId = winnerId;
    match.loserId = winnerId === match.playerAId ? match.playerBId : match.playerAId;
    match.tableId = null;
    match.completedAt = Date.now();
    match.completedSeq = nextCompletedSeq(matches);
    match.isBye = false;
    propagateWinners(matches);
    return matches;
  }

  function orderedReadyMatches(matches, currentSessionId = 'friday') {
    const ready = matches
      .filter((m) => {
        if (!(m.playerAId && m.playerBId)) return false;
        if (['complete', 'playing', 'warming'].includes(m.status)) return false;
        if (m.holdUntilSession && m.holdUntilSession !== currentSessionId) return false;
        return true;
      });
    if (!matches.some((m) => m.bracketName === 'Losers Bracket' || m.bracketName === 'Championship')) {
      return ready.sort(sortSingleEliminationReady);
    }
    return ready.sort((a, b) => sortDoubleEliminationReady(a, b, matches));
  }

  function sortSingleEliminationReady(a, b) {
    const pa = Number(a.priority || 0);
    const pb = Number(b.priority || 0);
    if (pa !== pb) return pb - pa;
    if (a.round !== b.round) return a.round - b.round;
    return a.roundIndex - b.roundIndex;
  }

  function nextCompletedSeq(matches) {
    return matches.reduce((max, m) => Math.max(max, Number(m.completedSeq || 0)), 0) + 1;
  }

  function completedMatchSeq(match) {
    return Number(match.completedSeq || 0);
  }

  function recentPlayedMatches(matches, count = 2) {
    return matches
      .filter((m) => m.status === 'complete' && !m.isBye && m.completedAt)
      .sort((a, b) => completedMatchSeq(b) - completedMatchSeq(a) || Number(b.completedAt || 0) - Number(a.completedAt || 0))
      .slice(0, count);
  }

  function sortDoubleEliminationReady(a, b, matches) {
    const scoreA = doubleEliminationReadyScore(a, matches);
    const scoreB = doubleEliminationReadyScore(b, matches);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if ((a.bracketName || '') !== (b.bracketName || '')) {
      const bracketRank = { Championship: 3, 'Losers Bracket': 2, 'Winners Bracket': 1 };
      const ar = bracketRank[a.bracketName] || 0;
      const br = bracketRank[b.bracketName] || 0;
      if (ar !== br) return br - ar;
    }
    if (a.round !== b.round) return a.round - b.round;
    return a.roundIndex - b.roundIndex;
  }

  function doubleEliminationReadyScore(match, matches) {
    const recent = recentPlayedMatches(matches, 2);
    const recentByPlayer = new Map();
    recent.forEach((completed, idx) => {
      [completed.playerAId, completed.playerBId].filter(Boolean).forEach((playerId) => {
        if (!recentByPlayer.has(playerId)) recentByPlayer.set(playerId, idx + 1);
      });
    });

    let score = Number(match.priority || 0) * 100;
    if (match.bracketName === 'Championship') score += 500;
    else if (match.bracketName === 'Losers Bracket') score += 200;
    else score += 100;

    const playerPenalty = [match.playerAId, match.playerBId].reduce((penalty, playerId) => {
      const depth = recentByPlayer.get(playerId);
      if (depth === 1) return Math.max(penalty, 500);
      if (depth === 2) return Math.max(penalty, 260);
      return penalty;
    }, 0);
    score -= playerPenalty;

    if (match.bracketName === 'Losers Bracket' && loserDropRecentlyPlayed(match, matches, recent)) {
      score -= 300;
    }

    return score;
  }

  function loserDropRecentlyPlayed(match, matches, recent) {
    const byId = new Map(matches.map((m) => [m.id, m]));
    const recentIds = new Set(recent.map((m) => m.id));
    return [match.slotA, match.slotB].some((slot) => {
      if (slot?.kind !== 'loser') return false;
      const source = byId.get(slot.sourceMatchId);
      return source?.bracketName === 'Winners Bracket' && recentIds.has(source.id);
    });
  }

  function parseTimeToMinutes(timeString) {
    const [h, m] = String(timeString || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function dateTimeMs(dateString, timeString) {
    if (!dateString) return null;
    const [year, month, day] = String(dateString).split('-').map(Number);
    const [hour, minute] = String(timeString || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).getTime();
  }

  function defaultSessions() {
    return [
      { id: 'friday', label: 'Friday', date: '', startTime: '13:00', endTime: '15:00' },
      { id: 'saturday', label: 'Saturday', date: '', startTime: '13:30', endTime: '16:00' },
    ];
  }

  function sessionWindows(settings = {}) {
    const sessions = settings.sessions || defaultSessions();
    const endBuffer = Number(settings.endBufferMin ?? 15);
    return sessions.map((session) => {
      const startMs = dateTimeMs(session.date, session.startTime);
      const endMs = dateTimeMs(session.date, session.endTime);
      return {
        ...session,
        startMs,
        endMs,
        softEndMs: endMs == null ? null : endMs - endBuffer * MINUTE,
      };
    });
  }

  function currentSession(settings, nowMs) {
    const windows = sessionWindows(settings).filter((w) => w.startMs != null && w.endMs != null);
    return windows.find((w) => nowMs >= w.startMs && nowMs <= w.endMs) || windows.find((w) => nowMs < w.endMs) || windows[windows.length - 1] || null;
  }

  function nextSessionAfter(settings, nowMs) {
    return sessionWindows(settings).find((w) => w.startMs != null && w.startMs > nowMs) || null;
  }

  function canStartMatch(match, nowMs, settings = {}, warmupMinutes = null) {
    const session = currentSession(settings, nowMs);
    if (!session) return { ok: true, level: 'unknown', message: 'No session date is configured.' };
    if (!session.softEndMs || !session.endMs) return { ok: true, level: 'unknown', message: 'Session cutoff is not configured.' };
    const duration = occupancyMinutesForMatch(match, settings, warmupMinutes) * MINUTE;
    const projectedEnd = nowMs + duration;
    if (projectedEnd <= session.softEndMs) {
      return { ok: true, level: 'safe', message: 'Safe to start.', projectedEndMs: projectedEnd, session };
    }
    if (projectedEnd <= session.endMs) {
      return { ok: true, level: 'tight', message: 'Tight. It may finish near the session end.', projectedEndMs: projectedEnd, session };
    }
    const next = nextSessionAfter(settings, nowMs);
    return {
      ok: false,
      level: 'unsafe',
      message: next ? `Do not start now. Hold this match for ${next.label}.` : 'Do not start now. It is likely to run past the hard stop.',
      projectedEndMs: projectedEnd,
      session,
      nextSession: next,
    };
  }

  function formatClock(ms) {
    if (!ms && ms !== 0) return '';
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatDuration(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  function buildEstimatedSchedule(state, nowMs) {
    const tables = state.tables || [];
    const matches = state.matches || [];
    const settings = state.settings || {};
    const currentSessionId = state.currentSessionId || currentSession(settings, nowMs)?.id || 'friday';
    const ready = orderedReadyMatches(matches, currentSessionId);
    const active = matches.filter((m) => ['warming', 'playing'].includes(m.status));
    const tableAvailable = new Map(tables.map((t) => [t.id, nowMs]));

    active.forEach((match) => {
      const tableId = match.tableId;
      if (!tableId) return;
      let remaining = occupancyMinutesForMatch(match, settings) * MINUTE;
      if (match.status === 'warming' && match.warmupStartedAt) {
        const warmupTotal = Number(match.warmupDurationMin || settings.standardWarmupMin || 2) * MINUTE;
        const elapsed = Math.max(0, nowMs - match.warmupStartedAt);
        remaining = Math.max(0, warmupTotal - elapsed) + gameMinutesForPoints(match.points, settings) * MINUTE;
      }
      if (match.status === 'playing' && match.gameStartedAt) {
        const gameTotal = gameMinutesForPoints(match.points, settings) * MINUTE;
        const elapsed = Math.max(0, nowMs - match.gameStartedAt);
        remaining = Math.max(0, gameTotal - elapsed);
      }
      tableAvailable.set(tableId, nowMs + remaining);
    });

    const schedule = [];
    ready.forEach((match) => {
      const sortedTables = [...tableAvailable.entries()].sort((a, b) => a[1] - b[1]);
      const [tableId, start] = sortedTables[0] || [1, nowMs];
      const startCheck = canStartMatch(match, start, settings);
      const durationMs = occupancyMinutesForMatch(match, settings) * MINUTE;
      schedule.push({
        matchId: match.id,
        tableId,
        estimatedStartMs: start,
        estimatedEndMs: start + durationMs,
        startCheck,
      });
      tableAvailable.set(tableId, start + durationMs);
    });
    return schedule;
  }

  return {
    MINUTE,
    uid,
    clamp,
    nextPowerOfTwo,
    seedOrder,
    parsePlayers,
    roundName,
    formatLabel,
    defaultRoundFormats,
    gameMinutesForPoints,
    occupancyMinutesForMatch,
    sessionMinutes,
    totalEffectiveMinutes,
    optionMatchCounts,
    estimateOption,
    generateTournamentOptions,
    buildBracket,
    cloneMatches,
    propagateWinners,
    findPlayer,
    playerName,
    completeMatch,
    orderedReadyMatches,
    parseTimeToMinutes,
    dateTimeMs,
    defaultSessions,
    sessionWindows,
    currentSession,
    nextSessionAfter,
    canStartMatch,
    formatClock,
    formatDuration,
    buildEstimatedSchedule,
  };
});
