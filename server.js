'use strict';
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const QRCode   = require('qrcode');

// ── Persistence ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('data.json load error:', e.message); }
  const defaults = { history: [], presets: {}, adminPassword: 'admin', settings: { defaultTimer: 60, minVoters: 0 } };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2));
    console.log(`Created ${DATA_FILE} with defaults`);
  } catch (e) { console.error('data.json create error:', e.message); }
  return defaults;
}

function saveData() {
  const d = {
    history:       state.history.slice(0, 100),
    presets:       state.presets,
    adminPassword: state.adminPassword,
    settings:      { defaultTimer: state.timer.duration, minVoters: state.settings.minVoters },
    games:         state.games.map(g => ({ name: g.name, emoji: g.emoji || '🎮', played: g.played || false })),
  };
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
  catch (e) { console.error('data.json save error:', e.message); }
}

const saved = loadData();

// ── Helpers ────────────────────────────────────────────────────────────────
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  phase: 'idle',          // idle | voting | tiebreaker | winner
  games:   (saved.games || []).map(g => ({ id: uid(), name: g.name, emoji: g.emoji || '🎮', played: g.played || false, vetoed: false })),
  votes:   {},            // socketId → gameId
  voteTs:  {},            // socketId → timestamp (vote cast time)
  locked:  {},            // socketId → bool
  vetoes:  {},            // socketId → gameId
  players: {},            // socketId → { nickname, weight, isAdmin }
  nominations: { open: false, pending: [] },
  veto:    { open: false },
  timer:   { duration: saved.settings?.defaultTimer || 60, remaining: saved.settings?.defaultTimer || 60, interval: null },
  tiebreaker: { gameIds: [] },
  winner:  null,
  round:   0,
  chat:    [],
  broadcast: null,
  lastRoundResults: null,
  streaks: {},
  waitingForVoters: false,
  history: saved.history  || [],
  presets: saved.presets  || {},
  adminPassword: saved.adminPassword || 'admin',
  settings: {
    minVoters:           saved.settings?.minVoters || 0,
    voteChangeSecs:      10,
    weightedVoting:      false,
  },
};

function eligibleGames() {
  if (state.phase === 'tiebreaker')
    return state.games.filter(g => state.tiebreaker.gameIds.includes(g.id) && !g.played);
  return state.games.filter(g => !g.played && !g.vetoed);
}

function weightOf(sid) {
  return (state.settings.weightedVoting ? (state.players[sid]?.weight || 1) : 1);
}

function getResults() {
  const counts = {};
  eligibleGames().forEach(g => { counts[g.id] = 0; });
  Object.entries(state.votes).forEach(([sid, gid]) => {
    if (counts[gid] !== undefined) counts[gid] += weightOf(sid);
  });
  return counts;
}

function totalVotes(results) {
  return Object.values(results || getResults()).reduce((a, b) => a + b, 0);
}

function namedCount()  { return Object.values(state.players).filter(p => !p.isAdmin && p.nickname).length; }
function voterCount()  { return Object.keys(state.votes).filter(s => !state.players[s]?.isAdmin).length; }

function findWinner() {
  const results = getResults();
  const eg = eligibleGames();
  if (!eg.length) return null;
  const max = Math.max(...eg.map(g => results[g.id] || 0));
  const tops = eg.filter(g => (results[g.id] || 0) === max);
  return tops.length > 1 ? { tied: true, games: tops, max } : { tied: false, game: tops[0], max };
}

// ── Phase machine ──────────────────────────────────────────────────────────
function transition(phase, data = {}) {
  state.phase = phase;
  state.waitingForVoters = false;

  if (phase === 'voting') {
    state.votes = {}; state.voteTs = {}; state.locked = {};
    state.round++;
    timerStart(state.timer.duration);
  }

  if (phase === 'tiebreaker') {
    state.tiebreaker.gameIds = data.gameIds || [];
    state.votes = {}; state.voteTs = {}; state.locked = {};
    timerStart(Math.max(30, Math.floor(state.timer.duration / 2)));
  }

  if (phase === 'winner') {
    timerStop();
    const egSnap = eligibleGames();
    const results = getResults();
    let winGame = data.game;
    if (!winGame) {
      const max = egSnap.length ? Math.max(...egSnap.map(g => results[g.id] || 0)) : 0;
      const tops = egSnap.filter(g => (results[g.id] || 0) === max);
      winGame = tops[Math.floor(Math.random() * tops.length)];
    }
    if (winGame) {
      const idx = state.games.findIndex(g => g.id === winGame.id);
      if (idx !== -1) state.games[idx].played = true;
      const tv = totalVotes(results);
      state.winner = { game: winGame, votes: results[winGame.id] || 0, results, totalVotes: tv, round: state.round };
      const resultsList = Object.entries(results).map(([id, v]) => {
        const g = state.games.find(x => x.id === id);
        return { id, name: g?.name || id, emoji: g?.emoji || '', votes: v };
      });
      state.lastRoundResults = {
        round:      state.round,
        winner:     { id: winGame.id, name: winGame.name, emoji: winGame.emoji || '🎮' },
        results:    resultsList,
        totalVotes: tv,
        games:      egSnap.map(g => ({ id: g.id, name: g.name, emoji: g.emoji || '🎮' })),
      };
      Object.entries(state.players).forEach(([sid, p]) => {
        if (p.isAdmin || !p.nickname) return;
        if (state.votes[sid]) state.streaks[p.nickname] = (state.streaks[p.nickname] || 0) + 1;
        else state.streaks[p.nickname] = 0;
      });
      state.history.unshift({
        round:      state.round,
        winner:     { id: winGame.id, name: winGame.name, emoji: winGame.emoji || '🎮' },
        results:    resultsList,
        totalVotes: tv,
        timestamp:  new Date().toISOString(),
      });
      if (state.history.length > 100) state.history.length = 100;
      saveData();
    }
  }

  if (phase === 'idle') {
    timerStop();
    state.timer.remaining = state.timer.duration;
    state.winner = null;
    state.tiebreaker.gameIds = [];
    state.games.forEach(g => { g.vetoed = false; });
    state.vetoes = {};
    state.nominations = { open: false, pending: [] };
    state.veto.open = false;
  }

  broadcastAll();
}

// ── Timer ──────────────────────────────────────────────────────────────────
function timerStart(secs) {
  timerStop();
  state.timer.remaining = secs;
  state.timer.interval = setInterval(() => {
    state.timer.remaining = Math.max(0, state.timer.remaining - 1);
    broadcastAll();
    if (state.timer.remaining <= 0) { timerStop(); onTimerEnd(); }
  }, 1000);
}

function timerStop() {
  if (state.timer.interval) { clearInterval(state.timer.interval); state.timer.interval = null; }
}

function onTimerEnd() {
  const min = state.settings.minVoters;
  if (min > 0 && voterCount() < min && state.phase === 'voting') {
    state.waitingForVoters = true;
    broadcastAll();
    return;
  }
  resolveVote();
}

function resolveVote() {
  state.waitingForVoters = false;
  const result = findWinner();
  if (!result) { transition('idle'); return; }
  if (result.tied && state.phase === 'voting') {
    transition('tiebreaker', { gameIds: result.games.map(g => g.id) });
  } else if (result.tied) {
    transition('winner', { game: result.games[Math.floor(Math.random() * result.games.length)] });
  } else {
    transition('winner', { game: result.game });
  }
}

function scheduleVoteLock(sid) {
  setTimeout(() => {
    if (state.votes[sid] && !state.locked[sid]) {
      state.locked[sid] = true;
      broadcastAll();
    }
  }, state.settings.voteChangeSecs * 1000);
}

// ── Broadcast ──────────────────────────────────────────────────────────────
function clientPayload(sid) {
  const results = getResults();
  const tv      = totalVotes(results);
  const eg      = eligibleGames();
  const myVote  = state.votes[sid] || null;
  const locked  = !!state.locked[sid];
  const ts      = state.voteTs[sid];
  const secsLeft = myVote && !locked && ts
    ? Math.max(0, state.settings.voteChangeSecs - Math.floor((Date.now() - ts) / 1000)) : 0;

  return {
    phase:        state.phase,
    games:        state.games.map(g => ({
                    id:       g.id, name: g.name, emoji: g.emoji || '🎮',
                    played:   g.played || false,
                    vetoed:   g.vetoed || false,
                    eligible: eg.some(e => e.id === g.id),
                  })),
    results, totalVotes: tv,
    timerRemaining:  state.timer.remaining,
    timerDuration:   state.timer.duration,
    nominations:     { open: state.nominations.open },
    veto:            { open: state.veto.open },
    winner:          state.winner ? { game: state.winner.game, votes: state.winner.votes, results: state.winner.results, totalVotes: state.winner.totalVotes } : null,
    round:           state.round,
    myVote, myVeto:  state.vetoes[sid] || null,
    voteLocked:      locked, voteSecsLeft: secsLeft,
    chat:            state.chat.slice(-20),
    namedPlayers:    namedCount(),
    votedPlayers:    voterCount(),
    minVoters:       state.settings.minVoters,
    waitingForVoters: state.waitingForVoters,
    tiebreaker:      state.phase === 'tiebreaker' ? { gameIds: state.tiebreaker.gameIds } : null,
    broadcast:       state.broadcast,
    lastRoundResults: state.lastRoundResults,
  };
}

function adminPayload() {
  const results = getResults();
  const tv      = totalVotes(results);
  return {
    phase:        state.phase,
    games:        state.games,
    results, totalVotes: tv,
    timerRemaining:  state.timer.remaining,
    timerDuration:   state.timer.duration,
    nominations:     state.nominations,
    veto:            state.veto,
    winner:          state.winner,
    round:           state.round,
    chat:            state.chat.slice(-50),
    clientCount:     Object.values(state.players).filter(p => !p.isAdmin).length,
    namedPlayers:    namedCount(),
    votedPlayers:    voterCount(),
    players:         Object.entries(state.players)
                       .filter(([, p]) => !p.isAdmin)
                       .map(([sid, p]) => ({
                         socketId: sid, nickname: p.nickname || '', weight: p.weight || 1,
                         voted: !!state.votes[sid], votedGame: state.votes[sid] || null,
                         voteLocked: !!state.locked[sid],
                         streak: state.streaks[p.nickname] || 0,
                       })),
    history:         state.history.slice(0, 25),
    presets:         state.presets,
    settings:        state.settings,
    waitingForVoters: state.waitingForVoters,
    tiebreaker:      state.phase === 'tiebreaker' ? { gameIds: state.tiebreaker.gameIds } : null,
    broadcast:       state.broadcast,
    lastRoundResults: state.lastRoundResults,
  };
}

function displayPayload() {
  const results = getResults();
  return {
    phase:          state.phase,
    games:          state.games,
    results, totalVotes: totalVotes(results),
    timerRemaining: state.timer.remaining,
    timerDuration:  state.timer.duration,
    winner:         state.winner,
    round:          state.round,
    namedPlayers:   namedCount(),
    votedPlayers:   voterCount(),
    waitingForVoters: state.waitingForVoters,
    tiebreaker:     state.phase === 'tiebreaker' ? { gameIds: state.tiebreaker.gameIds } : null,
    broadcast:      state.broadcast,
    lastRoundResults: state.lastRoundResults,
  };
}

function broadcastAll() {
  io.to('admins').emit('admin_state', adminPayload());
  io.to('displays').emit('display_state', displayPayload());
  io.sockets.sockets.forEach(s => {
    if (!s.isAdmin && !s.isDisplay) s.emit('state_update', clientPayload(s.id));
  });
}

// ── Express ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/client-url', (req, res) => {
  res.json({ url: `http://${getLocalIP()}:${PORT}/` });
});

app.get('/api/qr.svg', async (req, res) => {
  try {
    const url = `http://${getLocalIP()}:${PORT}/`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#a855f7', light: '#13151f' } });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (e) { res.status(500).send('QR error'); }
});

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  state.players[socket.id] = { nickname: '', weight: 1, isAdmin: false };

  // ── Join ────────────────────────────────────────────────────────────────
  socket.on('join_admin', pwd => {
    if (pwd !== state.adminPassword) {
      socket.emit('admin_auth', { ok: false, error: 'Wrong password' });
      return;
    }
    socket.isAdmin = true;
    state.players[socket.id].isAdmin = true;
    socket.join('admins');
    socket.emit('admin_auth', { ok: true });
    socket.emit('admin_state', adminPayload());
  });

  socket.on('join_display', () => {
    socket.isDisplay = true;
    socket.join('displays');
    socket.emit('display_state', displayPayload());
  });

  socket.on('join_client', () => {
    socket.emit('state_update', clientPayload(socket.id));
    broadcastAll(); // notify admins of new player
  });

  socket.on('set_nickname', raw => {
    const name = String(raw).trim().slice(0, 30);
    if (name) { state.players[socket.id].nickname = name; broadcastAll(); }
  });

  // ── Voting ──────────────────────────────────────────────────────────────
  socket.on('vote', gameId => {
    if (socket.isAdmin || socket.isDisplay) return;
    if (state.phase !== 'voting' && state.phase !== 'tiebreaker') return;
    if (state.locked[socket.id]) return;
    if (!eligibleGames().find(g => g.id === gameId)) return;

    const fresh = !state.votes[socket.id];
    state.votes[socket.id] = gameId;
    state.voteTs[socket.id] = Date.now();
    if (fresh) scheduleVoteLock(socket.id);

    // Check if waiting for min voters and threshold now met
    if (state.waitingForVoters && voterCount() >= state.settings.minVoters) resolveVote();
    else broadcastAll();
  });

  socket.on('unvote', () => {
    if (socket.isAdmin || socket.isDisplay) return;
    if (state.locked[socket.id]) return;
    delete state.votes[socket.id]; delete state.voteTs[socket.id];
    broadcastAll();
  });

  // ── Nominations ─────────────────────────────────────────────────────────
  socket.on('nominate_game', ({ name, emoji }) => {
    if (!state.nominations.open) return;
    const n = String(name).trim().slice(0, 80);
    if (!n) return;
    state.nominations.pending.push({
      id: uid(), name: n,
      emoji: String(emoji || '🎮').trim().slice(0, 4),
      nominatorId:   socket.id,
      nominatorName: state.players[socket.id]?.nickname || 'Anonymous',
    });
    broadcastAll();
  });

  // ── Veto ────────────────────────────────────────────────────────────────
  socket.on('use_veto', gameId => {
    if (!state.veto.open || state.phase !== 'idle') return;
    const old = state.vetoes[socket.id];
    if (old) {
      const noOthers = !Object.entries(state.vetoes).some(([s, g]) => s !== socket.id && g === old);
      const gOld = state.games.find(g => g.id === old);
      if (gOld && noOthers) gOld.vetoed = false;
    }
    if (old === gameId) { delete state.vetoes[socket.id]; }
    else {
      state.vetoes[socket.id] = gameId;
      const g = state.games.find(x => x.id === gameId);
      if (g) g.vetoed = true;
    }
    broadcastAll();
  });

  // ── Chat ────────────────────────────────────────────────────────────────
  socket.on('chat_message', raw => {
    const text = String(raw).trim().slice(0, 100);
    if (!text) return;
    const msg = { id: uid(), text, ts: Date.now() };
    state.chat.push(msg);
    if (state.chat.length > 50) state.chat.shift();
    io.emit('chat_message', msg);
  });

  // ── Admin: games ─────────────────────────────────────────────────────────
  socket.on('admin_add_game', ({ name, emoji }) => {
    if (!socket.isAdmin) return;
    const n = String(name).trim().slice(0, 80);
    if (!n) return;
    state.games.push({ id: uid(), name: n, emoji: String(emoji || '🎮').trim().slice(0, 4), played: false, vetoed: false });
    broadcastAll(); saveData();
  });

  socket.on('admin_remove_game', id => {
    if (!socket.isAdmin) return;
    state.games = state.games.filter(g => g.id !== id);
    Object.keys(state.votes).forEach(s => { if (state.votes[s] === id) delete state.votes[s]; });
    Object.keys(state.vetoes).forEach(s => { if (state.vetoes[s] === id) delete state.vetoes[s]; });
    broadcastAll(); saveData();
  });

  socket.on('admin_toggle_played', id => {
    if (!socket.isAdmin) return;
    const g = state.games.find(x => x.id === id);
    if (g) { g.played = !g.played; broadcastAll(); saveData(); }
  });

  // ── Admin: phase + timer ─────────────────────────────────────────────────
  socket.on('admin_set_timer', secs => {
    if (!socket.isAdmin) return;
    const v = parseInt(secs, 10);
    if (isNaN(v) || v < 5 || v > 3600) return;
    state.timer.duration = v;
    if (state.phase === 'idle') state.timer.remaining = v;
    broadcastAll(); saveData();
  });

  socket.on('admin_start_voting', () => {
    if (!socket.isAdmin || state.phase !== 'idle') return;
    transition('voting');
  });

  socket.on('admin_stop_voting', () => {
    if (!socket.isAdmin) return;
    timerStop();
    state.phase = 'idle';
    state.votes = {}; state.voteTs = {}; state.locked = {};
    state.waitingForVoters = false;
    broadcastAll();
  });

  socket.on('admin_next_round', () => {
    if (!socket.isAdmin) return;
    transition('idle');
  });

  socket.on('admin_reset_votes', () => {
    if (!socket.isAdmin) return;
    state.votes = {}; state.voteTs = {}; state.locked = {};
    broadcastAll();
  });

  socket.on('admin_add_time', secs => {
    if (!socket.isAdmin) return;
    const v = parseInt(secs, 10);
    if (isNaN(v)) return;
    state.timer.remaining = Math.max(0, state.timer.remaining + v);
    if (state.waitingForVoters) { state.waitingForVoters = false; timerStart(state.timer.remaining); }
    else if ((state.phase === 'voting' || state.phase === 'tiebreaker') && !state.timer.interval) {
      timerStart(state.timer.remaining);
    }
    broadcastAll();
  });

  socket.on('admin_clear_games', () => {
    if (!socket.isAdmin) return;
    state.games = []; state.votes = {}; state.voteTs = {}; state.locked = {};
    state.vetoes = {}; state.nominations.pending = [];
    broadcastAll(); saveData();
  });

  // ── Admin: nominations ───────────────────────────────────────────────────
  socket.on('admin_toggle_nominations', open => {
    if (!socket.isAdmin) return;
    state.nominations.open = !!open; broadcastAll();
  });

  socket.on('admin_approve_nomination', nomId => {
    if (!socket.isAdmin) return;
    const idx = state.nominations.pending.findIndex(n => n.id === nomId);
    if (idx === -1) return;
    const nom = state.nominations.pending.splice(idx, 1)[0];
    state.games.push({ id: uid(), name: nom.name, emoji: nom.emoji || '🎮', played: false, vetoed: false, fromNom: true });
    broadcastAll();
  });

  socket.on('admin_reject_nomination', nomId => {
    if (!socket.isAdmin) return;
    state.nominations.pending = state.nominations.pending.filter(n => n.id !== nomId);
    broadcastAll();
  });

  // ── Admin: veto ──────────────────────────────────────────────────────────
  socket.on('admin_toggle_veto', open => {
    if (!socket.isAdmin) return;
    state.veto.open = !!open;
    if (!open) { state.games.forEach(g => { g.vetoed = false; }); state.vetoes = {}; }
    broadcastAll();
  });

  // ── Admin: players ───────────────────────────────────────────────────────
  socket.on('admin_set_weight', ({ socketId, weight }) => {
    if (!socket.isAdmin) return;
    const w = Math.max(1, Math.min(10, parseInt(weight, 10) || 1));
    if (state.players[socketId]) { state.players[socketId].weight = w; broadcastAll(); }
  });

  socket.on('admin_kick', targetId => {
    if (!socket.isAdmin) return;
    const target = io.sockets.sockets.get(targetId);
    if (!target) return;
    delete state.votes[targetId]; delete state.players[targetId];
    target.emit('kicked');
    target.disconnect(true);
    broadcastAll();
  });

  // ── Admin: presets ───────────────────────────────────────────────────────
  socket.on('admin_save_preset', name => {
    if (!socket.isAdmin) return;
    const n = String(name).trim().slice(0, 50);
    if (!n) return;
    state.presets[n] = state.games.map(g => ({ name: g.name, emoji: g.emoji || '🎮' }));
    broadcastAll(); saveData();
  });

  socket.on('admin_load_preset', name => {
    if (!socket.isAdmin || !state.presets[name]) return;
    state.games  = state.presets[name].map(g => ({ id: uid(), name: g.name, emoji: g.emoji || '🎮', played: false, vetoed: false }));
    state.votes  = {}; state.vetoes = {};
    broadcastAll();
  });

  socket.on('admin_delete_preset', name => {
    if (!socket.isAdmin) return;
    delete state.presets[name]; broadcastAll(); saveData();
  });

  // ── Admin: settings ──────────────────────────────────────────────────────
  socket.on('admin_set_min_voters', n => {
    if (!socket.isAdmin) return;
    state.settings.minVoters = Math.max(0, parseInt(n, 10) || 0);
    broadcastAll(); saveData();
  });

  socket.on('admin_set_weighted', enabled => {
    if (!socket.isAdmin) return;
    state.settings.weightedVoting = !!enabled; broadcastAll();
  });

  socket.on('admin_broadcast', msg => {
    if (!socket.isAdmin) return;
    const text = String(msg).trim().slice(0, 120);
    if (!text) return;
    state.broadcast = text;
    broadcastAll();
  });

  socket.on('admin_clear_broadcast', () => {
    if (!socket.isAdmin) return;
    state.broadcast = null;
    broadcastAll();
  });

  socket.on('admin_change_password', ({ current, next }) => {
    if (!socket.isAdmin) return;
    if (current !== state.adminPassword) { socket.emit('pwd_result', { ok: false, error: 'Current password wrong' }); return; }
    const n = String(next).trim();
    if (!n) { socket.emit('pwd_result', { ok: false, error: 'Password empty' }); return; }
    state.adminPassword = n; saveData();
    socket.emit('pwd_result', { ok: true });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const old = state.vetoes[socket.id];
    if (old) {
      const noOthers = !Object.entries(state.vetoes).some(([s, g]) => s !== socket.id && g === old);
      const g = state.games.find(x => x.id === old);
      if (g && noOthers) g.vetoed = false;
    }
    delete state.votes[socket.id]; delete state.voteTs[socket.id];
    delete state.vetoes[socket.id]; delete state.players[socket.id];
    broadcastAll();
  });
});

// ── Local IP ───────────────────────────────────────────────────────────────
function getLocalIP() {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i.family === 'IPv4' && !i.internal);
  return ips[0]?.address || 'localhost';
}

const PORT = process.env.PORT || 2000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n🎮  Caulfield LAN Party Vote Server');
  console.log('════════════════════════════════════════');
  console.log(`  Admin   → http://localhost:${PORT}/admin.html`);
  console.log(`  Clients → http://${ip}:${PORT}/`);
  console.log(`  Display → http://${ip}:${PORT}/display.html`);
  console.log('════════════════════════════════════════\n');
});
