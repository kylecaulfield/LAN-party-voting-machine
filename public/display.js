'use strict';
const socket = io();

socket.on('connect',    () => { connDot.classList.remove('off'); socket.emit('join_display'); Sounds.init(); });
socket.on('disconnect', () => connDot.classList.add('off'));

const connDot   = document.getElementById('connDot');
const phaseBadge= document.getElementById('phaseBadge');
const timerNum  = document.getElementById('timerNum');
const tieBanner = document.getElementById('tieBanner');
const waitBanner= document.getElementById('waitBanner');
const content   = document.getElementById('displayContent');
const footRound = document.getElementById('footRound');
const footVoted = document.getElementById('footVoted');
const footPlay  = document.getElementById('footPlayers');
const winOverlay= document.getElementById('displayWinner');

const PHASE_CLASSES = { idle:'phase-idle', voting:'phase-voting', tiebreaker:'phase-tiebreaker', winner:'phase-winner' };
const PHASE_LABELS  = { idle:'IDLE', voting:'VOTING', tiebreaker:'TIEBREAKER ⚔️', winner:'WINNER 🏆' };

let prevPhase = null, prevTimer = null;
let wheelSpinning = false, latestState = null;

socket.on('display_state', s => {
  latestState = s;
  const enterWinner = prevPhase !== null && prevPhase !== 'winner' && s.phase === 'winner';
  renderPhase(s);
  renderTimer(s);
  renderBanners(s);
  renderBroadcastBanner(s);
  renderGames(s);
  renderFooter(s);
  handleSounds(s);
  prevPhase = s.phase; prevTimer = s.timerRemaining;

  if (wheelSpinning) return;

  if (enterWinner && s.lastRoundResults && s.lastRoundResults.games.length > 1) {
    const lrr = s.lastRoundResults;
    const wi = lrr.games.findIndex(g => g.id === lrr.winner.id);
    if (wi !== -1) {
      wheelSpinning = true;
      Wheel.spin(lrr.games, wi, () => { wheelSpinning = false; renderWinnerOverlay(latestState); });
      return;
    }
  }
  renderWinnerOverlay(s);
});

// ── Phase badge ────────────────────────────────────────────────────────────
function renderPhase(s) {
  phaseBadge.className   = 'phase-badge ' + (PHASE_CLASSES[s.phase] || 'phase-idle');
  phaseBadge.textContent = PHASE_LABELS[s.phase] || s.phase.toUpperCase();
}

// ── Timer ──────────────────────────────────────────────────────────────────
function renderTimer(s) {
  const active  = s.phase === 'voting' || s.phase === 'tiebreaker';
  const urgent  = s.timerRemaining <= 10 && active;
  timerNum.textContent = active ? s.timerRemaining : '—';
  timerNum.classList.toggle('urgent', urgent);
}

// ── Banners ────────────────────────────────────────────────────────────────
function renderBanners(s) {
  tieBanner.style.display  = s.phase === 'tiebreaker' ? 'block' : 'none';
  waitBanner.style.display = s.waitingForVoters ? 'block' : 'none';
  if (s.phase === 'tiebreaker' && s.tiebreaker) {
    const names = s.tiebreaker.gameIds.map(id => s.games.find(g=>g.id===id)?.name || id).join(' vs ');
    document.getElementById('tieBannerGames').textContent = names;
  }
}

// ── Broadcast banner ───────────────────────────────────────────────────────
function renderBroadcastBanner(s) {
  const el = document.getElementById('broadcastBanner');
  if (!el) return;
  if (s.broadcast) {
    el.textContent = '\uD83D\uDCE2 ' + s.broadcast;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ── Games ──────────────────────────────────────────────────────────────────
function renderGames(s) {
  if (s.phase === 'winner' && s.winner) return; // winner overlay covers this
  if (!s.games.length) {
    content.innerHTML = '<div class="empty" style="font-size:1.1rem;padding:60px">Waiting for games…</div>';
    return;
  }

  const eligible = s.phase === 'tiebreaker' && s.tiebreaker
    ? s.games.filter(g => s.tiebreaker.gameIds.includes(g.id))
    : s.games.filter(g => !g.played && !g.vetoed);

  const maxVotes = Math.max(1, ...Object.values(s.results));
  const sorted   = [...s.games]
    .filter(g => eligible.some(e => e.id === g.id))
    .sort((a, b) => (s.results[b.id]||0) - (s.results[a.id]||0));

  content.innerHTML = sorted.map(g => {
    const v    = s.results[g.id] || 0;
    const pct  = s.totalVotes ? Math.round(v / s.totalVotes * 100) : 0;
    const w    = Math.round(v / maxVotes * 100);
    return `
      <div class="display-game-row">
        <div class="dg-top">
          <span class="dg-emoji">${esc(g.emoji||'🎮')}</span>
          <span class="dg-name">${esc(g.name)}</span>
          <span class="dg-count">${v} vote${v!==1?'s':''} · ${pct}%</span>
        </div>
        <div class="dg-bar-track"><div class="dg-bar-fill" style="width:${w}%"></div></div>
      </div>`;
  }).join('');
}

// ── Footer ─────────────────────────────────────────────────────────────────
function renderFooter(s) {
  footRound.textContent  = s.round || '—';
  footVoted.textContent  = s.votedPlayers;
  footPlay.textContent   = s.namedPlayers;
}

// ── Winner overlay ─────────────────────────────────────────────────────────
function renderWinnerOverlay(s) {
  if (s.phase === 'winner' && s.winner) {
    document.getElementById('dwEmoji').textContent = s.winner.game.emoji || '🎮';
    document.getElementById('dwName').textContent  = s.winner.game.name;
    document.getElementById('dwRound').textContent = s.winner.round || s.round;
    const pct = s.winner.totalVotes ? Math.round(s.winner.votes / s.winner.totalVotes * 100) : 0;
    document.getElementById('dwVotes').textContent = `${s.winner.votes} votes — ${pct}%`;
    winOverlay.classList.add('show');
  } else {
    winOverlay.classList.remove('show');
    if (s.phase !== 'winner') Confetti.stop();
  }
}

// ── Sounds ─────────────────────────────────────────────────────────────────
function handleSounds(s) {
  if (prevPhase === null) return;
  if (prevPhase !== 'winner' && s.phase === 'winner')         { Sounds.fanfare();    Confetti.start(220); }
  if (prevPhase !== 'tiebreaker' && s.phase === 'tiebreaker') { Sounds.tiebreaker(); }
  if ((prevPhase==='voting'||prevPhase==='tiebreaker') && s.phase==='idle') Sounds.buzzer();
  if (s.phase === 'voting' || s.phase === 'tiebreaker') {
    if (prevTimer > 5 && s.timerRemaining <= 5 && s.timerRemaining > 0) Sounds.countdown();
    if (s.timerRemaining === 1) Sounds.finalBeep();
  }
}

// ── Util ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
