/*
 * Seis Mazos — sonidos y ambiente de casino generados con Web Audio (sin archivos de audio).
 * Expone window.SFX. Nada suena hasta que la persona toca la pantalla (regla de los navegadores).
 */
(function (root) {
  'use strict';
  const AC = root.AudioContext || root.webkitAudioContext;
  const S = { enabled: true, volume: 0.7, ambience: 'music', voice: false };
  let ctx = null;
  let master;
  let fx;
  let amb;
  let music;
  let verb;
  let noise;
  let unlocked = false;
  let ambience = null; // nodos y temporizadores del ambiente activo
  let lastCard = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => ctx.currentTime;
  const ready = () => ctx && unlocked && S.enabled && ctx.state === 'running';

  function init() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = S.enabled ? S.volume : 0;
    master.connect(ctx.destination);
    // Sala: reverberación sintética para que el ambiente y la música suenen "en el salón".
    verb = ctx.createConvolver();
    verb.buffer = impulse(2.2, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    verb.connect(wet);
    wet.connect(master);
    fx = bus(1, 0.15);
    amb = bus(0.6, 0.7);
    music = bus(0.55, 0.45);
    noise = noiseBuffer(3);
    return ctx;
  }

  function bus(level, send) {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(master);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(verb);
    }
    return g;
  }

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Ruido rosado aproximado (filtro de Paul Kellet): más natural que el blanco.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q == null ? 0.7 : q;
    return f;
  }

  // Nota con envolvente percusiva.
  function tone(o) {
    const t = o.t == null ? now() : o.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.d || 0.2));
    const g = ctx.createGain();
    const a = o.a || 0.004;
    const d = o.d || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    let node = osc;
    if (o.lp) {
      const f = filter('lowpass', o.lp);
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest || fx);
    osc.start(t);
    osc.stop(t + a + d + 0.05);
  }

  // Ráfaga de ruido filtrado (cartas, fichas, platillos).
  function burst(o) {
    const t = o.t == null ? now() : o.t;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = o.rate || 1;
    const f = filter(o.type || 'bandpass', o.freq || 3000, o.q == null ? 1 : o.q);
    const g = ctx.createGain();
    const dur = o.dur || 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak || 0.2, t + (o.a || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || fx);
    src.start(t, rand(0, 2.5), dur + 0.05);
  }

  /* ---------- Efectos ---------- */
  const fxs = {
    card() {
      const n = performance.now();
      if (n - lastCard < 45) return;
      lastCard = n;
      const t = now();
      burst({ t, dur: 0.075, freq: rand(2300, 3300), q: 0.8, peak: 0.2 });
      burst({ t: t + 0.055, dur: 0.05, freq: 700, type: 'lowpass', peak: 0.16 });
    },
    flip() {
      const t = now();
      burst({ t, dur: 0.04, freq: 3400, peak: 0.13 });
      burst({ t: t + 0.06, dur: 0.06, freq: 2100, peak: 0.14 });
    },
    chip(n) {
      const count = n || 1;
      for (let i = 0; i < count; i++) {
        const t = now() + i * rand(0.04, 0.07);
        tone({ t, freq: rand(2900, 3400), type: 'triangle', d: 0.05, peak: 0.16 });
        tone({ t, freq: rand(4700, 5300), d: 0.035, peak: 0.07 });
        burst({ t, dur: 0.025, freq: 5200, q: 2, peak: 0.11 });
      }
    },
    shuffle() {
      const t0 = now();
      for (let i = 0; i < 46; i++) {
        const t = t0 + Math.pow(i / 46, 0.85) * 1.15;
        burst({ t, dur: 0.028, freq: rand(3200, 5200), q: 1.4, peak: rand(0.05, 0.11) });
      }
      burst({ t: t0 + 1.2, dur: 0.4, freq: 1400, q: 0.5, peak: 0.14, a: 0.05 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ t: now() + i * 0.085, freq: f, type: 'triangle', d: 0.55, peak: 0.13 }));
      setTimeout(() => ready() && fxs.chip(4), 260);
    },
    blackjack() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
        tone({ t: now() + i * 0.07, freq: f, type: 'triangle', d: 0.7, peak: 0.13 }),
      );
      for (let i = 0; i < 8; i++) tone({ t: now() + 0.45 + i * 0.05, freq: rand(2500, 4200), d: 0.25, peak: 0.04 });
      setTimeout(() => ready() && fxs.chip(7), 380);
    },
    lose() {
      tone({ freq: 392, to: 330, type: 'square', lp: 900, d: 0.32, peak: 0.07 });
      tone({ t: now() + 0.16, freq: 311, to: 262, type: 'square', lp: 800, d: 0.42, peak: 0.06 });
    },
    push() {
      tone({ freq: 587.33, type: 'triangle', d: 0.3, peak: 0.1 });
    },
    good() {
      tone({ freq: 1318.5, d: 0.25, peak: 0.1 });
      tone({ t: now() + 0.07, freq: 1760, d: 0.32, peak: 0.07 });
    },
    bad() {
      tone({ freq: 196, type: 'sawtooth', lp: 650, d: 0.22, peak: 0.12 });
      tone({ t: now() + 0.13, freq: 175, type: 'sawtooth', lp: 600, d: 0.3, peak: 0.1 });
    },
  };

  /* ---------- Ambiente de sala ---------- */
  function loopNoise(rate) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.playbackRate.value = rate || 1;
    src.start(now(), rand(0, 2));
    return src;
  }

  function startAmbience() {
    if (ambience || !ready() || S.ambience === 'off') return;
    const nodes = [];
    const timers = [];
    // Murmullo de la sala: ruido grave que crece y baja despacio.
    const bed = loopNoise(0.9);
    const bedBp = filter('bandpass', 420, 0.55);
    const bedLp = filter('lowpass', 1300);
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.07;
    bed.connect(bedBp);
    bedBp.connect(bedLp);
    bedLp.connect(bedGain);
    bedGain.connect(amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(bedGain.gain);
    lfo.start();
    nodes.push(bed, lfo);
    // Conversaciones: sílabas de ruido con formantes que cambian.
    const chat = loopNoise(1.25);
    const chatBp = filter('bandpass', 1000, 3.5);
    const chatGain = ctx.createGain();
    chatGain.gain.value = 0.0001;
    chat.connect(chatBp);
    chatBp.connect(chatGain);
    chatGain.connect(amb);
    nodes.push(chat);
    timers.push(
      setInterval(() => {
        if (!ready()) return;
        const t = now();
        chatBp.frequency.setTargetAtTime(rand(650, 1700), t, 0.04);
        const peak = Math.random() < 0.3 ? 0.0001 : rand(0.008, 0.026);
        chatGain.gain.setTargetAtTime(peak, t, 0.05);
      }, 170),
    );
    // Sonidos lejanos del casino.
    const distant = () => {
      if (ready()) {
        const r = Math.random();
        const t = now();
        if (r < 0.4) {
          // tragamonedas pagando
          const notes = [1046.5, 1318.5, 1568, 2093, 1568, 2093, 2637];
          notes.forEach((f, i) => tone({ t: t + i * 0.075, freq: f, type: 'square', lp: 2600, d: 0.09, peak: 0.018, dest: amb }));
        } else if (r < 0.75) {
          for (let i = 0; i < 6; i++) {
            const tt = t + i * rand(0.04, 0.09);
            tone({ t: tt, freq: rand(2800, 3500), type: 'triangle', d: 0.05, peak: 0.03, dest: amb });
            burst({ t: tt, dur: 0.02, freq: 5000, q: 2, peak: 0.02, dest: amb });
          }
        } else {
          tone({ t, freq: 1568, d: 1.2, peak: 0.02, dest: amb });
          tone({ t: t + 0.18, freq: 2093, d: 1.4, peak: 0.016, dest: amb });
        }
      }
      timers.push(setTimeout(distant, rand(5000, 13000)));
    };
    timers.push(setTimeout(distant, rand(2000, 5000)));
    ambience = { nodes, timers, music: null };
    if (S.ambience === 'music') ambience.music = startMusic();
  }

  function stopAmbience() {
    if (!ambience) return;
    for (const n of ambience.nodes)
      try {
        n.stop();
      } catch (e) {
        /* ya detenido */
      }
    for (const id of ambience.timers) {
      clearInterval(id);
      clearTimeout(id);
    }
    if (ambience.music) clearInterval(ambience.music);
    ambience = null;
  }

  /* ---------- Música lounge generativa (piano eléctrico, contrabajo y escobillas) ---------- */
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [
    { root: 48, notes: [64, 67, 71, 74] }, // Cmaj9
    { root: 45, notes: [60, 64, 67, 71] }, // Am9
    { root: 50, notes: [65, 69, 72, 76] }, // Dm9
    { root: 43, notes: [65, 69, 71, 76] }, // G13
  ];

  function ep(t, m, peak) {
    const f = midi(m);
    tone({ t, freq: f, d: 2.2, peak, dest: music, lp: 2200, a: 0.012 });
    tone({ t, freq: f * 2, d: 0.6, peak: peak * 0.25, dest: music, a: 0.006 });
  }

  function startMusic() {
    const beat = 60 / 82;
    let step = 0; // corcheas
    let next = now() + 0.1;
    return setInterval(() => {
      if (!ready()) {
        next = now() + 0.1;
        return;
      }
      while (next < now() + 0.25) {
        const bar = Math.floor(step / 8);
        const inBar = step % 8;
        const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
        const nextChord = CHORDS[(Math.floor(bar / 2) + 1) % CHORDS.length];
        const swing = inBar % 2 === 1 ? beat / 6 : 0;
        const t = next + swing;
        // piano: golpe en 1 y en el "y" del 2
        if (inBar === 0 || inBar === 3) for (const n of chord.notes) ep(t, n, inBar === 0 ? 0.045 : 0.032);
        // contrabajo caminando en negras
        if (inBar % 2 === 0) {
          const q = inBar / 2;
          const last = bar % 2 === 1 && q === 3;
          const m = last ? nextChord.root - 1 : chord.root + [0, 7, 12, 7][q] - (q === 2 ? 12 : 0);
          tone({ t, freq: midi(m), type: 'triangle', lp: 520, d: 0.42, peak: 0.16, dest: music });
        }
        // platillo con escobillas
        if (inBar % 2 === 0 || inBar === 3 || inBar === 7) burst({ t, dur: 0.14, freq: 8500, type: 'highpass', q: 0.5, peak: 0.018, dest: music });
        if (inBar === 2 || inBar === 6) burst({ t, dur: 0.05, freq: 7000, q: 1.5, peak: 0.02, dest: music });
        step++;
        next += beat / 2;
      }
    }, 60);
  }

  /* ---------- Voz del crupier ---------- */
  let voice = null;
  function pickVoice() {
    if (voice || !root.speechSynthesis) return voice;
    const vs = root.speechSynthesis.getVoices();
    voice =
      vs.find((v) => /^es[-_](MX|US|419)/i.test(v.lang)) || vs.find((v) => /^es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
    return voice;
  }
  function say(text) {
    if (!S.voice || !S.enabled || !unlocked || !root.speechSynthesis || document.visibilityState !== 'visible') return;
    const u = new root.SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'es-MX';
    u.rate = 1.03;
    u.pitch = 0.92;
    u.volume = Math.min(1, S.volume + 0.25);
    root.speechSynthesis.cancel();
    root.speechSynthesis.speak(u);
  }

  /* ---------- API ---------- */
  function applyMaster() {
    if (!ctx) return;
    master.gain.setTargetAtTime(S.enabled ? S.volume : 0, now(), 0.05);
  }

  // iPhone: con 'playback' el juego suena como una app multimedia (también con el interruptor de silencio).
  function audioSession() {
    try {
      if (root.navigator && root.navigator.audioSession) root.navigator.audioSession.type = S.enabled ? 'playback' : 'auto';
    } catch (e) {
      /* no disponible */
    }
  }

  let voiceWarm = false;
  const api = {
    supported: !!AC,
    get state() {
      return !ctx ? 'sin iniciar' : ctx.state;
    },
    // Se llama en cada toque mientras el audio no esté funcionando: el iPhone solo deja
    // arrancarlo dentro de un gesto (al levantar el dedo) y lo vuelve a pausar en segundo plano.
    unlock() {
      if (!init()) return;
      unlocked = true;
      audioSession();
      const go = () => {
        applyMaster();
        if (S.enabled) startAmbience();
      };
      if (ctx.state !== 'running') {
        // Un búfer mudo reproducido dentro del gesto desbloquea el audio en Safari.
        try {
          const b = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = b;
          src.connect(ctx.destination);
          src.start(0);
        } catch (e) {
          /* sin efecto */
        }
        const p = ctx.resume();
        if (p && p.then) p.then(go, () => {});
      } else go();
      if (S.voice && !voiceWarm && root.speechSynthesis) {
        voiceWarm = true;
        const u = new root.SpeechSynthesisUtterance(' ');
        u.volume = 0;
        root.speechSynthesis.speak(u);
      }
    },
    configure(opts) {
      const prevAmb = S.ambience;
      Object.assign(S, opts);
      if (!ctx) return;
      audioSession();
      applyMaster();
      if (!S.enabled || S.ambience === 'off' || S.ambience !== prevAmb) stopAmbience();
      if (S.enabled && unlocked) startAmbience();
      if (!S.voice && root.speechSynthesis) root.speechSynthesis.cancel();
    },
    pause() {
      stopAmbience();
      if (root.speechSynthesis) root.speechSynthesis.cancel();
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    resume() {
      if (!ctx || !unlocked) return;
      ctx.resume().then(() => {
        if (S.enabled) startAmbience();
      }, () => {});
    },
    say,
  };
  for (const k of Object.keys(fxs))
    api[k] = (...args) => {
      if (ready()) fxs[k](...args);
    };
  if (root.speechSynthesis && root.speechSynthesis.addEventListener)
    root.speechSynthesis.addEventListener('voiceschanged', () => {
      voice = null;
      pickVoice();
    });
  root.SFX = api;
})(typeof window !== 'undefined' ? window : this);
