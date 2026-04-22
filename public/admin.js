'use strict';
const socket = io();

// ── Auth ───────────────────────────────────────────────────────────────────
const loginModal = document.getElementById('loginModal');
const loginPwd   = document.getElementById('loginPwd');
const loginBtn   = document.getElementById('loginBtn');
const loginErr   = document.getElementById('loginErr');

const savedPwd = localStorage.getItem('adminPwd') || '';
if (savedPwd) tryLogin(savedPwd);

loginBtn.addEventListener('click', () => tryLogin(loginPwd.value));
loginPwd.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(loginPwd.value); });

function tryLogin(pwd) {
  loginErr.textContent = '';
  socket.emit('join_admin', pwd);
}

socket.on('admin_auth', ({ ok, error }) => {
  if (ok) {
    localStorage.setItem('adminPwd', loginPwd.value || savedPwd);
    loginModal.style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    loadQR();
  } else {
    loginErr.textContent = error || 'Wrong password';
    localStorage.removeItem('adminPwd');
  }
});

// ── Connection ─────────────────────────────────────────────────────────────
const connDot   = document.getElementById('connDot');
const connLabel = document.getElementById('connLabel');
socket.on('connect',    () => { connDot.classList.remove('off'); connLabel.textContent = 'Connected'; const p = localStorage.getItem('adminPwd'); if (p) socket.emit('join_admin', p); });
socket.on('disconnect', () => { connDot.classList.add('off');    connLabel.textContent = 'Disconnected'; });

// ── State ──────────────────────────────────────────────────────────────────
let S = null;
const CIRC = 2 * Math.PI * 50; // r=50 SVG ring
let prevPhase = null;
let prevTimerSec = null;

socket.on('admin_state', s => {
  S = s;
  renderAll(s);
  handleSoundTriggers(s);
  prevPhase     = s.phase;
  prevTimerSec  = s.timerRemaining;
});

// ── Tabs ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`[data-pane="${id}"]`)?.classList.add('active');
  });
});

// ── Render all ─────────────────────────────────────────────────────────────
function renderAll(s) {
  renderHeader(s);
  renderSidebar(s);
  renderResults(s);
  renderGamesTab(s);
  renderPlayersTab(s);
  renderNomsTab(s);
  renderHistoryTab(s);
  renderSettingsTab(s);
  renderWinnerOverlay(s);
}

// ── Header ─────────────────────────────────────────────────────────────────
const PHASE_CLASSES = { idle:'phase-idle', voting:'phase-voting', tiebreaker:'phase-tiebreaker', winner:'phase-winner' };
const PHASE_LABELS  = { idle:'IDLE', voting:'VOTING', tiebreaker:'TIEBREAKER ⚔️', winner:'WINNER 🏆' };

function renderHeader(s) {
  const badge = document.getElementById('phaseBadge');
  badge.className = 'phase-badge ' + (PHASE_CLASSES[s.phase] || 'phase-idle');
  badge.textContent = PHASE_LABELS[s.phase] || s.phase.toUpperCase();

  // Tiebreaker / waiting banners
  document.getElementById('tieBanner').style.display  = s.phase === 'tiebreaker' ? 'block' : 'none';
  document.getElementById('waitBanner').style.display = s.waitingForVoters ? 'block' : 'none';
  if (s.phase === 'tiebreaker' && s.tiebreaker) {
    const names = s.tiebreaker.gameIds.map(id => s.games.find(g=>g.id===id)?.name || id).join(' vs ');
    document.getElementById('tieBannerGames').textContent = names;
  }
}

// ── Sidebar ────────────────────────────────────────────────────────────────
const ringArc   = document.getElementById('ringArc');
const timerNum  = document.getElementById('timerNum');
const timerStat = document.getElementById('timerStatus');
const btnStart  = document.getElementById('btnStart');
const btnStop   = document.getElementById('btnStop');
const btnNR1    = document.getElementById('btnNextRound');

function renderSidebar(s) {
  // Timer ring
  const r = s.timerRemaining, d = s.timerDuration || 1;
  const frac = Math.min(1, Math.max(0, r / d));
  timerNum.textContent = r;
  ringArc.style.strokeDashoffset = CIRC * (1 - frac);
  ringArc.setAttribute('class', 'ring-arc' + (r <= 10 && s.phase === 'voting' ? ' urgent' : s.waitingForVoters ? ' waiting' : ''));

  if (s.phase === 'voting') {
    timerStat.textContent = '● Voting OPEN';
    timerStat.className = 'timer-status ts-active';
  } else if (s.phase === 'tiebreaker') {
    timerStat.textContent = '⚔️ Tiebreaker';
    timerStat.className = 'timer-status ts-tie';
  } else if (s.phase === 'winner') {
    timerStat.textContent = '🏆 Round ended';
    timerStat.className = 'timer-status ts-ended';
  } else if (s.waitingForVoters) {
    timerStat.textContent = `⏳ Waiting for ${s.minVoters} voters`;
    timerStat.className = 'timer-status ts-waiting';
  } else {
    timerStat.textContent = 'Voting closed';
    timerStat.className = 'timer-status ts-idle';
  }

  btnStart.disabled = s.phase !== 'idle';
  btnStop.disabled  = s.phase === 'idle' || s.phase === 'winner';
  btnNR1.style.display = s.phase === 'winner' ? 'inline-flex' : 'none';

  // Stats
  document.getElementById('sVotes').textContent   = s.totalVotes;
  document.getElementById('sClients').textContent = s.clientCount;
  document.getElementById('sRound').textContent   = s.round || '—';
  document.getElementById('voterProgress').textContent =
    `${s.votedPlayers} / ${s.namedPlayers} named players voted` +
    (s.minVoters ? ` (min ${s.minVoters})` : '');

  // Nomination / veto toggles
  document.getElementById('btnNoms').textContent = `📋 Nominations: ${s.nominations.open ? 'ON' : 'OFF'}`;
  document.getElementById('btnNoms').className   = `btn-${s.nominations.open ? 'warn' : 'ghost'} btn-sm`;
  document.getElementById('btnVeto').textContent = `🚫 Veto: ${s.veto.open ? 'ON' : 'OFF'}`;
  document.getElementById('btnVeto').className   = `btn-${s.veto.open ? 'warn' : 'ghost'} btn-sm`;

  // Broadcast active state
  const activeBC = document.getElementById('activeBroadcast');
  if (s.broadcast) {
    document.getElementById('activeBroadcastText').textContent = s.broadcast;
    activeBC.style.display = 'block';
  } else {
    activeBC.style.display = 'none';
  }
}

// ── Results tab ─────────────────────────────────────────────────────────────
function renderResults(s) {
  const el = document.getElementById('resultsList');
  if (!s.games.length && !(s.phase === 'idle' && s.lastRoundResults)) { el.innerHTML = '<div class="empty">Add games to see results</div>'; return; }

  if (s.phase === 'idle' && s.lastRoundResults) {
    const lrr = s.lastRoundResults;
    const sorted = [...lrr.results].sort((a,b) => b.votes - a.votes);
    const maxV = sorted.length ? sorted[0].votes : 1;
    el.innerHTML = `<div class="last-round-label">Round ${lrr.round} — Final Results</div>` +
      sorted.map(r => {
        const isW = r.id === lrr.winner.id;
        const pct = lrr.totalVotes ? Math.round(r.votes / lrr.totalVotes * 100) : 0;
        const w   = maxV ? Math.round(r.votes / maxV * 100) : 0;
        return `<div class="game-row ${isW ? 'is-winner' : ''}">
          <div class="gr-top">
            <span class="gr-emoji">${esc(r.emoji||'🎮')}</span>
            <span class="gr-name">${isW?'🏆 ':''}${esc(r.name)}</span>
            <span class="gr-count">${r.votes}v · ${pct}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill ${isW?'winner-bar':''}" style="width:${w}%"></div></div>
        </div>`;
      }).join('');
    return;
  }

  const eligible = s.phase === 'tiebreaker' && s.tiebreaker
    ? s.games.filter(g => s.tiebreaker.gameIds.includes(g.id))
    : s.games.filter(g => !g.played && !g.vetoed);

  const maxVotes = Math.max(1, ...Object.values(s.results));
  const winCount = s.phase === 'winner' ? Math.max(0, ...Object.values(s.results)) : 0;
  const sorted   = [...s.games].sort((a, b) => (s.results[b.id]||0) - (s.results[a.id]||0));

  el.innerHTML = sorted.map(g => {
    const v     = s.results[g.id] || 0;
    const pct   = s.totalVotes ? Math.round(v / s.totalVotes * 100) : 0;
    const w     = Math.round(v / maxVotes * 100);
    const isWin = s.phase === 'winner' && v === winCount && v > 0 && !g.played;
    const isElig = eligible.some(e => e.id === g.id);
    const dimmed = g.played || g.vetoed || (s.phase === 'tiebreaker' && !isElig);

    return `<div class="game-row ${isWin ? 'is-winner' : ''} ${g.vetoed ? 'is-vetoed' : ''} ${g.played ? 'is-played' : ''}">
      <div class="gr-top">
        <span class="gr-emoji">${esc(g.emoji||'🎮')}</span>
        <span class="gr-name">${isWin?'🏆 ':''}${esc(g.name)}</span>
        <span class="gr-count">${v}v · ${pct}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${isWin?'winner-bar':''}" style="width:${dimmed?0:w}%"></div></div>
    </div>`;
  }).join('');
}

// ── Games tab ───────────────────────────────────────────────────────────────
function renderGamesTab(s) {
  const el = document.getElementById('adminGameItems');
  if (!s.games.length) { el.innerHTML = '<div class="empty">No games added yet</div>'; return; }
  el.innerHTML = s.games.map(g => `
    <div class="game-item ${g.played?'played-item':''} ${g.vetoed?'vetoed-item':''}">
      <span class="gi-emoji">${esc(g.emoji||'🎮')}</span>
      <span class="gi-name">${esc(g.name)}</span>
      ${g.played ? '<span class="tag tag-played">Played</span>' : ''}
      ${g.vetoed ? '<span class="tag tag-veto">Vetoed</span>' : ''}
      <button class="btn-ghost btn-xs" data-played="${g.id}" title="${g.played?'Mark unplayed':'Mark played'}">${g.played?'↩':'✓'}</button>
      <button class="btn-ghost btn-xs btn-icon" data-del="${g.id}" title="Remove" style="color:var(--red)">✕</button>
    </div>`).join('');

  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => socket.emit('admin_remove_game', b.dataset.del)));
  el.querySelectorAll('[data-played]').forEach(b => b.addEventListener('click', () => socket.emit('admin_toggle_played', b.dataset.played)));
}

// ── Players tab ─────────────────────────────────────────────────────────────
function renderPlayersTab(s) {
  const el = document.getElementById('playerList');
  if (!s.players.length) { el.innerHTML = '<div class="empty">No clients connected</div>'; return; }
  el.innerHTML = s.players.map(p => `
    <div class="player-item">
      <span class="voted-dot ${p.voted?'':'no'}" title="${p.voted?'Voted':'Not voted'}"></span>
      <span class="player-nick">${p.nickname ? esc(p.nickname) : '<em style="color:var(--muted)">unnamed</em>'}${p.streak > 0 ? `<span class="streak-badge">\uD83D\uDD25${p.streak}</span>` : ''}</span>
      ${p.voted && p.votedGame ? `<span style="font-size:.72rem;color:var(--muted)">${esc(s.games.find(g=>g.id===p.votedGame)?.name||'?')}</span>` : ''}
      ${p.voteLocked ? '<span class="tag tag-lock">🔒</span>' : ''}
      <label style="display:flex;align-items:center;gap:5px;font-size:.75rem;color:var(--muted)">
        W: <input type="number" class="weight-input" data-wsid="${p.socketId}" min="1" max="10" value="${p.weight||1}">
      </label>
      <button class="btn-danger btn-xs" data-kick="${p.socketId}">Kick</button>
    </div>`).join('');

  el.querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Kick this player?')) socket.emit('admin_kick', b.dataset.kick);
  }));
  el.querySelectorAll('.weight-input').forEach(inp => inp.addEventListener('change', () => {
    socket.emit('admin_set_weight', { socketId: inp.dataset.wsid, weight: inp.value });
  }));
}

// ── Nominations tab ──────────────────────────────────────────────────────────
function renderNomsTab(s) {
  const cnt = s.nominations.pending.length;
  const badge = document.getElementById('nomsCount');
  badge.textContent = cnt; badge.style.display = cnt ? 'inline-flex' : 'none';
  document.getElementById('nomsOpenStatus').textContent = s.nominations.open ? '📋 Nominations are OPEN' : 'Nominations are closed';
  document.getElementById('nomsOpenStatus').className   = `banner ${s.nominations.open ? 'banner-open' : 'banner-closed'}`;

  const el = document.getElementById('nomList');
  if (!cnt) { el.innerHTML = '<div class="empty">No pending nominations</div>'; return; }
  el.innerHTML = s.nominations.pending.map(n => `
    <div class="nom-item">
      <span class="nom-emoji">${esc(n.emoji||'🎮')}</span>
      <div class="nom-info">
        <div class="nom-name">${esc(n.name)}</div>
        <div class="nom-by">by ${esc(n.nominatorName)}</div>
      </div>
      <button class="btn-success btn-xs" data-approve="${n.id}">✓ Approve</button>
      <button class="btn-danger btn-xs"  data-reject="${n.id}">✕ Reject</button>
    </div>`).join('');

  el.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => socket.emit('admin_approve_nomination', b.dataset.approve)));
  el.querySelectorAll('[data-reject]').forEach(b  => b.addEventListener('click', () => socket.emit('admin_reject_nomination',  b.dataset.reject)));
}

// ── History tab ──────────────────────────────────────────────────────────────
function renderHistoryTab(s) {
  const el = document.getElementById('histList');
  if (!s.history.length) { el.innerHTML = '<div class="empty">No rounds played yet</div>'; return; }
  el.innerHTML = s.history.map(h => {
    const dt = new Date(h.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const breakdown = (h.results||[]).sort((a,b)=>b.votes-a.votes).map(r => {
      const isW = r.id === h.winner?.id;
      return `<span class="hist-chip${isW?' win-chip':''}">${esc(r.emoji||'')} ${esc(r.name)} ${r.votes}v</span>`;
    }).join('');
    return `<div class="hist-item">
      <div class="hist-top">
        <span class="hist-round">Round ${h.round}</span>
        <span class="hist-winner">🏆 ${esc(h.winner?.emoji||'🎮')} ${esc(h.winner?.name||'?')}</span>
        <span class="hist-ts">${dt}</span>
      </div>
      <div class="hist-breakdown">${breakdown}</div>
    </div>`;
  }).join('');
}

// ── Settings tab ─────────────────────────────────────────────────────────────
function renderSettingsTab(s) {
  document.getElementById('weightedCheck').checked = !!s.settings.weightedVoting;
  document.getElementById('minVotersInput').value  = s.settings.minVoters || 0;

  const el = document.getElementById('presetList');
  const keys = Object.keys(s.presets || {});
  if (!keys.length) { el.innerHTML = '<div class="empty">No presets saved</div>'; return; }
  el.innerHTML = keys.map(name => `
    <div class="preset-item">
      <span class="preset-name">${esc(name)}</span>
      <span style="font-size:.72rem;color:var(--muted)">${s.presets[name].length} games</span>
      <button class="btn-primary btn-xs"  data-load="${esc(name)}">Load</button>
      <button class="btn-danger btn-xs"   data-del-preset="${esc(name)}">✕</button>
    </div>`).join('');

  el.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
    if (confirm(`Load preset "${b.dataset.load}"? Current games will be replaced.`)) socket.emit('admin_load_preset', b.dataset.load);
  }));
  el.querySelectorAll('[data-del-preset]').forEach(b => b.addEventListener('click', () => {
    if (confirm(`Delete preset "${b.dataset.delPreset}"?`)) socket.emit('admin_delete_preset', b.dataset.delPreset);
  }));
}

// ── Winner overlay ────────────────────────────────────────────────────────────
function renderWinnerOverlay(s) {
  const overlay = document.getElementById('winnerOverlay');
  if (s.phase === 'winner' && s.winner) {
    document.getElementById('woEmoji').textContent  = s.winner.game.emoji || '🎮';
    document.getElementById('woName').textContent   = s.winner.game.name;
    document.getElementById('woVotes').textContent  = `${s.winner.votes} vote${s.winner.votes!==1?'s':''} · ${s.winner.totalVotes?Math.round(s.winner.votes/s.winner.totalVotes*100):0}%`;
    const res = s.winner.results || {};
    const gMap = Object.fromEntries(s.games.map(g=>[g.id,g]));
    document.getElementById('woBreakdown').innerHTML = Object.entries(res)
      .sort((a,b)=>b[1]-a[1])
      .map(([id,v]) => {
        const g = gMap[id]; if (!g) return '';
        const isW = id === s.winner.game.id;
        return `<span class="winner-chip ${isW?'top':''}">${g.emoji||'🎮'} ${esc(g.name)} — ${v}v</span>`;
      }).join('');
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
    Confetti.stop();
  }
}

// ── Sound triggers ────────────────────────────────────────────────────────────
function handleSoundTriggers(s) {
  if (!prevPhase) return;
  if (prevPhase !== 'winner' && s.phase === 'winner')     { Sounds.fanfare(); Confetti.start(); }
  if (prevPhase !== 'tiebreaker' && s.phase === 'tiebreaker') Sounds.tiebreaker();
  if (s.phase === 'voting' || s.phase === 'tiebreaker') {
    const prev = prevTimerSec;
    if (prev > 5 && s.timerRemaining <= 5 && s.timerRemaining > 0) Sounds.countdown();
    else if (s.timerRemaining === 1) Sounds.finalBeep();
  }
}

// ── Controls ───────────────────────────────────────────────────────────────
document.getElementById('btnStart').addEventListener('click',  () => socket.emit('admin_start_voting'));
document.getElementById('btnStop').addEventListener('click',   () => socket.emit('admin_stop_voting'));
document.getElementById('btnNextRound').addEventListener('click', () => socket.emit('admin_next_round'));
document.getElementById('btnNextRound2').addEventListener('click', () => socket.emit('admin_next_round'));
document.getElementById('btnAdd30').addEventListener('click',  () => socket.emit('admin_add_time', 30));
document.getElementById('btnAdd60').addEventListener('click',  () => socket.emit('admin_add_time', 60));
document.getElementById('btnResetVotes').addEventListener('click', () => { if (confirm('Reset votes?')) socket.emit('admin_reset_votes'); });

document.getElementById('btnSetTimer').addEventListener('click', () => {
  const v = parseInt(document.getElementById('timerInput').value, 10);
  if (v >= 5) { socket.emit('admin_set_timer', v); toast(`Timer set to ${v}s`); }
});
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
  const v = parseInt(b.dataset.preset, 10);
  document.getElementById('timerInput').value = v;
  socket.emit('admin_set_timer', v); toast(`Timer set to ${v}s`);
}));

// Nomination / Veto toggles
document.getElementById('btnNoms').addEventListener('click', () => socket.emit('admin_toggle_nominations', !S?.nominations.open));
document.getElementById('btnVeto').addEventListener('click', () => socket.emit('admin_toggle_veto', !S?.veto.open));

// Broadcast
document.getElementById('btnBroadcast').addEventListener('click', sendBroadcast);
document.getElementById('broadcastInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendBroadcast(); });
function sendBroadcast() {
  const msg = document.getElementById('broadcastInput').value.trim();
  if (!msg) return;
  socket.emit('admin_broadcast', msg);
  document.getElementById('broadcastInput').value = '';
  toast('📢 Broadcast sent');
}
document.getElementById('btnClearBroadcast').addEventListener('click', () => socket.emit('admin_clear_broadcast'));

// Add game
document.getElementById('btnAddGame').addEventListener('click', addGame);
document.getElementById('addGameName').addEventListener('keydown', e => { if (e.key === 'Enter') addGame(); });
function addGame() {
  const name = document.getElementById('addGameName').value.trim();
  const emoji = document.getElementById('addGameEmoji').value.trim() || '🎮';
  if (!name) return;
  socket.emit('admin_add_game', { name, emoji });
  document.getElementById('addGameName').value = '';
  document.getElementById('addGameEmoji').value = '';
  document.getElementById('addGameName').focus();
  toast(`✓ "${name}" added to game list`);
}

document.getElementById('btnClearGames').addEventListener('click', () => {
  if (confirm('Remove ALL games and votes?')) socket.emit('admin_clear_games');
});

// Weighted voting
document.getElementById('weightedCheck').addEventListener('change', e => socket.emit('admin_set_weighted', e.target.checked));

// Min voters
document.getElementById('btnSetMinVoters').addEventListener('click', () => {
  const v = parseInt(document.getElementById('minVotersInput').value, 10) || 0;
  socket.emit('admin_set_min_voters', v); toast(`Minimum voters: ${v || 'disabled'}`);
});

// Preset save
document.getElementById('btnSavePreset').addEventListener('click', () => {
  const name = document.getElementById('presetNameInput').value.trim();
  if (!name) return;
  socket.emit('admin_save_preset', name);
  document.getElementById('presetNameInput').value = '';
  toast(`Preset "${name}" saved`);
});

// Password change
document.getElementById('btnChangePwd').addEventListener('click', () => {
  socket.emit('admin_change_password', {
    current: document.getElementById('curPwd').value,
    next:    document.getElementById('newPwd').value,
  });
});
socket.on('pwd_result', r => {
  document.getElementById('pwdErr').textContent = r.ok ? '✓ Password changed' : (r.error || 'Error');
  document.getElementById('pwdErr').style.color = r.ok ? 'var(--green)' : 'var(--red)';
  if (r.ok) { localStorage.setItem('adminPwd', document.getElementById('newPwd').value); document.getElementById('newPwd').value = ''; document.getElementById('curPwd').value = ''; }
});

// ── QR Code ────────────────────────────────────────────────────────────────
async function loadQR() {
  try {
    const res = await fetch('/api/client-url');
    const { url } = await res.json();
    document.getElementById('qrUrl').textContent = url;
  } catch {}
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Util ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
