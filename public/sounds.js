// Web Audio API sound synthesis — no files, no dependencies
const Sounds = (() => {
  let ctx = null;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.25, delay = 0) {
    try {
      const c    = ac();
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type; osc.frequency.value = freq;
      const t0 = c.currentTime + delay;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur + 0.01);
    } catch (e) { /* silently ignore if audio unavailable */ }
  }

  // Countdown tick (last 5 s)
  function countdown()  { tone(880, 0.07, 'sine', 0.18); }

  // Final second tick — louder
  function finalBeep()  { tone(1320, 0.12, 'sine', 0.35); }

  // Buzzer when voting closes
  function buzzer() {
    tone(110, 0.55, 'sawtooth', 0.3);
    tone(90,  0.45, 'sawtooth', 0.15, 0.08);
  }

  // Ascending fanfare on winner screen
  function fanfare() {
    [[523,0],[659,0.14],[784,0.28],[1047,0.44],[1047,0.62],[1319,0.80]].forEach(([f,d]) => {
      tone(f, 0.32, 'sine', 0.35, d);
    });
  }

  // Short notification for chat
  function chat() {
    tone(660, 0.05, 'sine', 0.08);
    tone(880, 0.05, 'sine', 0.08, 0.07);
  }

  // Dramatic stab for tiebreaker reveal
  function tiebreaker() {
    [440, 440, 554].forEach((f, i) => tone(f, 0.18, 'square', 0.14, i * 0.14));
  }

  // Kick user out sound (descending)
  function kickSound() { [440,330,220].forEach((f,i) => tone(f,0.15,'sine',0.15,i*0.1)); }

  return { countdown, finalBeep, buzzer, fanfare, chat, tiebreaker, kickSound,
    init() { try { ac(); } catch(e){} } };
})();
