'use strict';
const socket = io();

// ── Nickname ───────────────────────────────────────────────────────────────
const nickModal   = document.getElementById('nickModal');
const nickInput   = document.getElementById('nickInput');
const nickBtn     = document.getElementById('nickBtn');
const nickEditBtn = document.getElementById('nickEditBtn');
const nickDisplay = document.getElementById('nickDisplay');
let myNick = localStorage.getItem('nickname') || '';

if (myNick) { applyNick(myNick); }
else { nickModal.style.display = 'flex'; setTimeout(() => nickInput.focus(), 100); }

nickBtn.addEventListener('click', submitNick);
nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNick(); });
nickEditBtn.addEventListener('click', () => { nickModal.style.display = 'flex'; nickInput.value = myNick; nickInput.select(); });

function submitNick() {
  const v = nickInput.value.trim();
  if (!v) { document.getElementById('nickErr').textContent = 'Please enter a nickname'; return; }
  applyNick(v);
  nickModal.style.display = 'none';
}

function applyNick(name) {
  myNick = name;
  localStorage.setItem('nickname', name);
  nickDisplay.textContent = name;
  nickEditBtn.style.display = 'inline-flex';
  socket.emit('set_nickname', name);
}

// ── Broadcast banner sticky offset ─────────────────────────────────────────
const _header = document.querySelector('header');
const _bcBanner = document.getElementById('broadcastBanner');
const _updateBannerTop = () => { if (_header && _bcBanner) _bcBanner.style.top = _header.offsetHeight + 'px'; };
_updateBannerTop();
window.addEventListener('resize', _updateBannerTop);

// ── Connection ─────────────────────────────────────────────────────────────
const connDot   = document.getElementById('connDot');
const connLabel = document.getElementById('connLabel');

socket.on('connect', () => {
  connDot.classList.remove('off'); connLabel.textContent = 'Connected';
  socket.emit('join_client');
  if (myNick) socket.emit('set_nickname', myNick);
  Sounds.init();
});
socket.on('disconnect', () => { connDot.classList.add('off'); connLabel.textContent = 'Disconnected'; });
socket.on('kicked', () => {
  Sounds.kickSound?.();
  toast('You were removed by the admin');
  setTimeout(() => location.reload(), 2000);
});

// ── State tracking ─────────────────────────────────────────────────────────
let prevPhase = null, prevTimer = null, prevVoted = 0;
let wheelSpinning = false, latestState = null;

socket.on('state_update', s => {
  latestState = s;
  const enterWinner = prevPhase !== null && prevPhase !== 'winner' && s.phase === 'winner';
  renderAll(s);
  handleSounds(s);
  prevPhase = s.phase; prevTimer = s.timerRemaining; prevVoted = s.votedPlayers;

  if (wheelSpinning) return; // wheel controls winner overlay via onComplete

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

// ── Render ─────────────────────────────────────────────────────────────────
const PHASE_CLASSES = { idle:'phase-idle', voting:'phase-voting', tiebreaker:'phase-tiebreaker', winner:'phase-winner' };
const PHASE_LABELS  = { idle:'IDLE', voting:'VOTING', tiebreaker:'TIEBREAKER ⚔️', winner:'WINNER 🏆' };

function renderAll(s) {
  // Phase badge
  const badge = document.getElementById('phaseBadge');
  badge.className   = 'phase-badge ' + (PHASE_CLASSES[s.phase] || 'phase-idle');
  badge.textContent = PHASE_LABELS[s.phase] || s.phase.toUpperCase();

  renderTimer(s);
  renderBanner(s);
  renderBroadcastBanner(s);
  renderGames(s);
  renderNomForm(s);

  // Veto note
  document.getElementById('vetoNote').style.display = s.veto?.open && s.phase === 'idle' ? 'block' : 'none';
}

function renderTimer(s) {
  const pct = s.timerDuration > 0 ? Math.min(100, Math.max(0, s.timerRemaining / s.timerDuration * 100)) : 0;
  const urgent = s.timerRemaining <= 10 && (s.phase === 'voting' || s.phase === 'tiebreaker');
  const num = document.getElementById('ctNum');
  const bar = document.getElementById('ctBar');
  const lbl = document.getElementById('ctLabel');

  num.textContent = (s.phase === 'voting' || s.phase === 'tiebreaker') ? s.timerRemaining : '—';
  num.classList.toggle('urgent', urgent);
  bar.style.width = pct + '%';
  bar.classList.toggle('urgent', urgent);

  if (s.waitingForVoters) {
    lbl.textContent = `⏳ Waiting for ${s.minVoters} votes…`;
  } else if (s.phase === 'voting') {
    lbl.textContent = `${s.timerRemaining}s left · ${s.votedPlayers}/${s.namedPlayers} voted`;
  } else if (s.phase === 'tiebreaker') {
    lbl.textContent = `⚔️ Tiebreaker — ${s.timerRemaining}s`;
  } else if (s.phase === 'winner') {
    lbl.textContent = "🏆 Voting complete";
  } else {
    lbl.textContent = 'Waiting for voting to start…';
  }
}

function renderBanner(s) {
  const el = document.getElementById('statusBanner');
  if (s.phase === 'voting') {
    el.innerHTML = '<div class="banner banner-open">✅ Voting is open — tap a game to cast your vote!</div>';
  } else if (s.phase === 'tiebreaker') {
    el.innerHTML = `<div class="tie-banner"><h3>⚔️ TIEBREAKER!</h3><p>It's a tie — vote again from the options below</p></div>`;
  } else if (s.phase === 'winner') {
    el.innerHTML = '<div class="banner banner-closed">🔒 Voting closed — see winner above</div>';
  } else if (s.waitingForVoters) {
    el.innerHTML = `<div class="banner banner-wait">⏳ Timer ended — waiting for minimum ${s.minVoters} votes</div>`;
  } else {
    el.innerHTML = '';
  }
}

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

function renderGames(s) {
  const el = document.getElementById('gameList');
  if (!s.games.length) { el.innerHTML = '<div class="empty">No games listed yet…</div>'; return; }

  const canVote = s.phase === 'voting' || s.phase === 'tiebreaker';
  const maxVotes = Math.max(1, ...Object.values(s.results));
  const winCount = Math.max(0, ...Object.values(s.results));
  const showWin  = s.phase === 'winner' && winCount > 0;

  const sorted = [...s.games].sort((a, b) => (s.results[b.id]||0) - (s.results[a.id]||0));

  el.innerHTML = sorted.map(g => {
    const votes   = s.results[g.id] || 0;
    const pct     = s.totalVotes ? Math.round(votes / s.totalVotes * 100) : 0;
    const width   = Math.round(votes / maxVotes * 100);
    const isMe    = s.myVote === g.id;
    const isWin   = showWin && votes === winCount && g.eligible;
    const isVeto  = s.myVeto === g.id;
    const vetoOn  = s.veto?.open && s.phase === 'idle';
    const locked  = isMe && s.voteLocked;
    const canClick = canVote && g.eligible && !g.played;

    let tags = '';
    if (isMe)    tags += `<span class="tag tag-me">✓ Yours${locked ? ' 🔒' : ''}</span>`;
    if (isWin)   tags += `<span class="tag tag-win">🏆 Winner</span>`;
    if (g.vetoed) tags += `<span class="tag tag-veto">Vetoed</span>`;
    if (g.played) tags += `<span class="tag tag-played">Played</span>`;

    const lockCd = isMe && !locked && s.voteSecsLeft > 0
      ? `<div class="lock-cd">🔓 Change vote in ${s.voteSecsLeft}s</div>` : '';

    const vetoBtn = vetoOn && !g.played
      ? `<button class="veto-btn ${isVeto?'my-veto':''}" data-veto="${g.id}">${isVeto ? '↩ Un-veto' : '🚫 Veto'}</button>` : '';

    const classes = [
      'cgame',
      canClick ? 'votable' : '',
      isMe     ? 'my-vote' : '',
      isWin    ? 'winner'  : '',
      g.vetoed ? 'vetoed'  : '',
      g.played ? 'played'  : '',
    ].filter(Boolean).join(' ');

    return `<div class="${classes}" data-id="${g.id}">
      <div class="cgame-top">
        <span class="cgame-emoji">${esc(g.emoji||'🎮')}</span>
        <span class="cgame-name">${esc(g.name)}</span>
        ${tags}
        ${vetoBtn}
        <span class="cgame-pct">${pct}%</span>
      </div>
      ${lockCd}
      <div class="bar-track"><div class="bar-fill ${isWin?'winner-bar':''}" style="width:${g.eligible?width:0}%"></div></div>
    </div>`;
  }).join('');

  // Vote listeners
  el.querySelectorAll('.cgame.votable').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-veto]')) return; // don't vote when clicking veto
      const id = row.dataset.id;
      if (s.myVote === id) socket.emit('unvote');
      else socket.emit('vote', id);
      Sounds.init();
    });
  });

  // Veto listeners
  el.querySelectorAll('[data-veto]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      socket.emit('use_veto', btn.dataset.veto);
    });
  });
}

// ── Nomination form ────────────────────────────────────────────────────────
const NOM_EMOJIS = ['🎮','🎯','🏆','🎲','🃏','⚔️','🔫','🚀','🏎️','⚽','🎵','🧩','🔥','💥','🌍'];
let selectedEmoji = '🎮';

function renderNomForm(s) {
  const sec = document.getElementById('nomSection');
  sec.style.display = s.nominations?.open ? 'block' : 'none';
  if (!s.nominations?.open) return;

  const picker = document.getElementById('emojiPicker');
  if (!picker.dataset.built) {
    picker.innerHTML = NOM_EMOJIS.map(e => `<span class="emoji-pick${e===selectedEmoji?' sel':''}" data-e="${e}">${e}</span>`).join('');
    picker.querySelectorAll('.emoji-pick').forEach(span => {
      span.addEventListener('click', () => {
        selectedEmoji = span.dataset.e;
        document.getElementById('nomEmoji').value = selectedEmoji;
        picker.querySelectorAll('.emoji-pick').forEach(s => s.classList.remove('sel'));
        span.classList.add('sel');
      });
    });
    picker.dataset.built = '1';
    document.getElementById('nomEmoji').value = selectedEmoji;
  }
}

document.getElementById('nomSubmit').addEventListener('click', submitNom);
document.getElementById('nomName').addEventListener('keydown', e => { if (e.key === 'Enter') submitNom(); });
function submitNom() {
  const name  = document.getElementById('nomName').value.trim();
  const emoji = document.getElementById('nomEmoji').value.trim() || selectedEmoji;
  if (!name) return;
  socket.emit('nominate_game', { name, emoji });
  document.getElementById('nomName').value = '';
  toast('Nomination submitted!');
}

// ── Winner overlay ─────────────────────────────────────────────────────────
function renderWinnerOverlay(s) {
  const overlay = document.getElementById('winnerOverlay');
  if (s.phase === 'winner' && s.winner) {
    document.getElementById('woEmoji').textContent  = s.winner.game.emoji || '🎮';
    document.getElementById('woName').textContent   = s.winner.game.name;
    const pct = s.winner.totalVotes ? Math.round(s.winner.votes / s.winner.totalVotes * 100) : 0;
    document.getElementById('woVotes').textContent  = `${s.winner.votes} vote${s.winner.votes!==1?'s':''} — ${pct}%`;
    const res = s.winner.results || {};
    const gMap = Object.fromEntries(s.games.map(g=>[g.id,g]));
    document.getElementById('woBreakdown').innerHTML = Object.entries(res)
      .sort((a,b)=>b[1]-a[1])
      .map(([id,v]) => {
        const g = gMap[id]; if (!g || !v) return '';
        const isW = id === s.winner.game.id;
        return `<span class="winner-chip ${isW?'top':''}">${g.emoji||'🎮'} ${esc(g.name)} — ${v}v</span>`;
      }).join('');
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
    if (s.phase !== 'winner') Confetti.stop();
  }
}

// ── Sound triggers ─────────────────────────────────────────────────────────
function handleSounds(s) {
  if (prevPhase === null) return;
  if (prevPhase !== 'winner' && s.phase === 'winner')      { Sounds.fanfare();    Confetti.start(); }
  if (prevPhase !== 'tiebreaker' && s.phase==='tiebreaker'){ Sounds.tiebreaker(); }
  if (prevPhase === 'voting' && s.phase !== 'voting' && s.phase !== 'tiebreaker') Sounds.buzzer();
  if (s.phase === 'voting' || s.phase === 'tiebreaker') {
    if (prevTimer > 5 && s.timerRemaining <= 5 && s.timerRemaining > 0) Sounds.countdown();
    if (s.timerRemaining === 1) Sounds.finalBeep();
  }
}

// ── Chat ───────────────────────────────────────────────────────────────────
const chatToggle = document.getElementById('chatToggle');
const chatPanel  = document.getElementById('chatPanel');
const chatMsgs   = document.getElementById('chatMsgs');
const chatInput  = document.getElementById('chatInput');
const chatSend   = document.getElementById('chatSend');
const chatBadge  = document.getElementById('chatBadge');
let chatOpen = false, unreadChat = 0;

chatToggle.addEventListener('click', () => {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle('open', chatOpen);
  chatToggle.textContent = chatOpen ? '✕' : '💬';
  if (chatOpen) { unreadChat = 0; chatBadge.textContent = '0'; chatBadge.classList.remove('show'); chatInput.focus(); scrollChat(); }
});

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat_message', text);
  chatInput.value = '';
}

socket.on('chat_message', msg => {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `${esc(msg.text)} <span class="ts">${fmtTime(msg.ts)}</span>`;
  chatMsgs.appendChild(el);
  if (chatMsgs.children.length > 60) chatMsgs.firstChild.remove();
  scrollChat();
  if (!chatOpen) {
    unreadChat++;
    chatBadge.textContent = unreadChat;
    chatBadge.classList.add('show');
    Sounds.chat();
  }
});

function scrollChat() { chatMsgs.scrollTop = chatMsgs.scrollHeight; }
function fmtTime(ts)  { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

// ── Toast ──────────────────────────────────────────────────────────────────
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Util ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
