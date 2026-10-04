/*
 * Seis Mazos — sonidos y ambiente de casino generados con Web Audio (sin archivos de audio).
 * Expone window.SFX. Nada suena hasta que la persona toca la pantalla (regla de los navegadores).
 */
(function (root) {
  'use strict';
  const AC = root.AudioContext || root.webkitAudioContext;
  const S = { enabled: true, volume: 0.7, ambience: 'music', voice: false, voiceName: '' };
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

  /* ---------- Música lounge generativa ----------
   * Cambia sola cada minuto y medio aprox.: estilo (swing, bossa o balada), tonalidad, tempo,
   * progresión de acordes y, a veces, una melodía de vibráfono que se inventa sobre la marcha.
   * Entre una pieza y otra baja despacio y entra la siguiente.
   */
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // Voces sin fundamental (la pone el contrabajo), en semitonos sobre la raíz del acorde.
  const VOICING = {
    maj9: [4, 7, 11, 14],
    six9: [4, 9, 14, 19],
    m9: [3, 7, 10, 14],
    m7: [3, 7, 10, 15],
    d13: [4, 10, 14, 21],
    d9: [4, 7, 10, 14],
    alt: [4, 10, 15, 20],
    m7b5: [3, 6, 10, 15],
  };
  // Progresiones: [grado en semitonos sobre la tónica, tipo de acorde], un acorde por compás.
  const P = {
    lounge: [[0, 'maj9'], [9, 'm9'], [2, 'm9'], [7, 'd13']],
    twoFive: [[2, 'm9'], [7, 'd13'], [0, 'maj9'], [9, 'alt']],
    turnaround: [[0, 'six9'], [9, 'alt'], [2, 'm9'], [7, 'd13'], [4, 'm7'], [9, 'd13'], [2, 'm9'], [7, 'd13']],
    blues: [[0, 'd13'], [5, 'd9'], [0, 'd13'], [0, 'd13'], [5, 'd9'], [5, 'd9'], [0, 'd13'], [9, 'alt'], [2, 'm9'], [7, 'd13'], [0, 'd13'], [7, 'alt']],
    autumn: [[5, 'm7'], [10, 'd9'], [3, 'maj9'], [8, 'maj9'], [2, 'm7b5'], [7, 'alt'], [0, 'm9'], [0, 'm9']],
    ipanema: [[0, 'maj9'], [0, 'maj9'], [2, 'd13'], [2, 'd13'], [2, 'm9'], [1, 'd9'], [0, 'six9'], [1, 'd9']],
    minorBossa: [[0, 'm9'], [0, 'm9'], [5, 'm9'], [5, 'm9'], [2, 'm7b5'], [7, 'alt'], [0, 'm9'], [7, 'alt']],
    float: [[0, 'maj9'], [0, 'maj9'], [10, 'maj9'], [10, 'maj9']],
  };
  const STYLES = {
    swing: { bpm: [80, 96], bars: 32, swing: true, progs: [P.lounge, P.twoFive, P.turnaround, P.blues] },
    bossa: { bpm: [120, 136], bars: 48, swing: false, progs: [P.ipanema, P.minorBossa, P.lounge, P.twoFive] },
    ballad: { bpm: [60, 70], bars: 24, swing: false, progs: [P.float, P.autumn, P.lounge, P.twoFive] },
  };
  const KEYS = [0, 2, 3, 5, 7, 8, 10];

  function planSection(prev) {
    const names = Object.keys(STYLES).filter((s) => !prev || s !== prev.style);
    const style = pick(names);
    const st = STYLES[style];
    let key = pick(KEYS);
    while (prev && key === prev.key) key = pick(KEYS);
    const prog = pick(st.progs);
    return {
      style,
      key,
      prog,
      bars: prog.length * Math.max(1, Math.round(st.bars / prog.length)),
      bpm: Math.round(rand(st.bpm[0], st.bpm[1])),
      swing: st.swing,
      melody: Math.random() < 0.75,
      rhythm: null,
      last: 76,
      comp: [0, 3],
      dest: null,
    };
  }

  function voicing(pc, type) {
    const notes = VOICING[type].map((i) => 48 + pc + i);
    while (Math.min(...notes) < 55) notes.forEach((n, i) => (notes[i] = n + 12));
    while (Math.min(...notes) >= 67) notes.forEach((n, i) => (notes[i] = n - 12));
    return notes;
  }

  // Piano eléctrico.
  function ep(t, m, peak, dest, d) {
    const f = midi(m);
    tone({ t, freq: f, d: d || 2.2, peak, dest, lp: 2200, a: 0.012 });
    tone({ t, freq: f * 2, d: 0.6, peak: peak * 0.25, dest, a: 0.006 });
  }
  function chordHit(t, notes, peak, dest, d, roll) {
    notes.forEach((n, i) => ep(t + i * (roll || 0.008) + rand(0, 0.006), n, peak * rand(0.85, 1.1), dest, d));
  }
  // Contrabajo.
  function bass(t, pc, d, dest, peak) {
    let m = 40 + (((pc % 12) + 12) % 12);
    if (m > 50) m -= 12;
    tone({ t, freq: midi(m), type: 'triangle', lp: 520, d, peak: peak || 0.16, dest });
  }
  // Vibráfono.
  function vibe(t, m, peak, dest) {
    const f = midi(m);
    tone({ t, freq: f, d: 1.5, peak, dest, a: 0.004 });
    tone({ t, freq: f * 4, d: 0.2, peak: peak * 0.16, dest, a: 0.002 });
  }

  // Melodía: frases de dos compases y dos de silencio; el ritmo se repite para que tenga forma.
  function melody(sec, bar, i, t, pc, type) {
    if (!sec.melody || bar < 4) return;
    const phraseBar = bar % 4;
    if (phraseBar >= 2) return;
    if (bar % 4 === 0 && i === 0 && (!sec.rhythm || Math.random() < 0.35)) {
      const dense = sec.style === 'ballad' ? 4 : 6;
      const slots = [];
      for (let s = 0; s < 16; s++) if (Math.random() < (s % 2 === 0 ? 0.45 : 0.25) * (dense / 6)) slots.push(s);
      sec.rhythm = slots.length ? slots : [0, 3, 8];
    }
    const s = phraseBar * 8 + i;
    if (!sec.rhythm.includes(s)) return;
    const chordTones = VOICING[type].map((x) => (pc + x) % 12).concat([pc % 12]);
    const scale = [0, 2, 4, 7, 9].map((x) => (sec.key + x) % 12);
    const pool = i % 2 === 0 ? chordTones : chordTones.concat(scale);
    const cands = [];
    for (let m = 70; m <= 86; m++) if (pool.includes(m % 12)) cands.push(m);
    const near = cands.filter((m) => Math.abs(m - sec.last) <= 5 && m !== sec.last);
    const m = pick(near.length ? near : cands);
    sec.last = m;
    vibe(t, m, sec.style === 'bossa' ? 0.03 : 0.04, sec.dest);
  }

  function playStep(sec, k, t0, e) {
    const bar = Math.floor(k / 8);
    const i = k % 8;
    const d = sec.dest;
    const [deg, type] = sec.prog[bar % sec.prog.length];
    const [ndeg] = sec.prog[(bar + 1) % sec.prog.length];
    const pc = (sec.key + deg) % 12;
    const npc = (sec.key + ndeg) % 12;
    const t = t0 + (sec.swing && i % 2 === 1 ? e / 3 : 0) + rand(0, 0.006);
    const notes = voicing(pc, type);
    const third = type[0] === 'm' ? 3 : 4;
    const fifth = type === 'm7b5' ? 6 : 7;
    // Último compás: acorde de la tónica que se queda sonando mientras baja el volumen.
    if (bar === sec.bars - 1) {
      if (i === 0) {
        const [d0, t0type] = sec.prog[0];
        const tonic = (sec.key + d0) % 12;
        chordHit(t, voicing(tonic, t0type), 0.04, d, 4, 0.05);
        bass(t, tonic, 3, d);
      }
      return;
    }
    if (sec.style === 'swing') {
      if (i === 0) sec.comp = pick([[0, 3], [1, 4], [0, 5], [3, 6], [2, 5, 7], [0, 3, 6]]);
      if (sec.comp.includes(i)) chordHit(t, notes, i === 0 ? 0.042 : 0.032, d, 1.6);
      if (i % 2 === 0) {
        const q = i / 2;
        const approach = (npc - pc + 12 + (Math.random() < 0.5 ? 1 : -1)) % 12;
        const walk = [0, pick([third, fifth]), pick([fifth, 9, 12]), approach];
        bass(t, pc + walk[q], 0.42, d);
      }
      if (i % 2 === 0 || i === 3 || i === 7) burst({ t, dur: 0.14, freq: 8500, type: 'highpass', q: 0.5, peak: 0.016, dest: d });
      if (i === 2 || i === 6) burst({ t, dur: 0.05, freq: 7000, q: 1.5, peak: 0.018, dest: d });
    } else if (sec.style === 'bossa') {
      const s = (bar % 2) * 8 + i;
      if ([0, 3, 6, 10, 12].includes(s)) chordHit(t, notes, s === 0 ? 0.036 : 0.028, d, 0.55);
      if (i === 0) bass(t, pc, 0.5, d);
      if (i === 3) bass(t, pc + fifth, 0.2, d, 0.12);
      if (i === 4) bass(t, pc + fifth, 0.6, d);
      if ([0, 3, 6, 10, 13].includes(s)) burst({ t, dur: 0.03, freq: 1900, q: 4, peak: 0.03, dest: d });
      burst({ t, dur: 0.05, freq: 9000, type: 'highpass', q: 0.6, peak: i % 2 ? 0.012 : 0.007, dest: d });
    } else {
      if (i === 0) {
        chordHit(t, notes, 0.034, d, 3.2, 0.06);
        bass(t, pc, 2.6, d, 0.13);
        if (bar % 4 === 0) burst({ t, dur: 2.4, a: 1.2, freq: 7000, type: 'highpass', q: 0.4, peak: 0.01, dest: d });
      } else if (i >= 2 && Math.random() < 0.55) {
        const up = bar % 2 === 0;
        ep(t, notes[(up ? i : 9 - i) % notes.length] + 12, 0.016, d, 1.4);
      }
      if (i === 4 && Math.random() < 0.5) bass(t, pc + fifth, 1.2, d, 0.1);
    }
    melody(sec, bar, i, t, pc, type);
  }

  let playing = null; // qué suena ahora (para mostrarlo en Reglas)
  function startMusic() {
    let sec = null;
    let k = 0;
    let next = 0;
    const begin = (t) => {
      sec = planSection(sec);
      sec.dest = ctx.createGain();
      sec.dest.gain.setValueAtTime(0.0001, t);
      sec.dest.gain.exponentialRampToValueAtTime(1, t + 2.5);
      sec.dest.connect(music);
      playing = { style: sec.style, key: sec.key, bpm: sec.bpm, bars: sec.bars, seconds: Math.round((sec.bars * 8 * 30) / sec.bpm) };
      k = 0;
      next = t;
    };
    return setInterval(() => {
      if (!ready()) {
        if (sec) next = now() + 0.1;
        return;
      }
      if (!sec) begin(now() + 0.1);
      while (next < now() + 0.3) {
        const e = 60 / sec.bpm / 2;
        if (Math.floor(k / 8) >= sec.bars) {
          const old = sec.dest;
          old.gain.setTargetAtTime(0.0001, next, 0.5);
          setTimeout(() => old.disconnect(), (next - now() + 5) * 1000);
          begin(next + 1.2);
          continue;
        }
        playStep(sec, k, next, e);
        k++;
        next += e;
      }
    }, 60);
  }

  /* ---------- Voz del crupier ---------- */
  // Prefiere voces femeninas y naturales en español: las «mejoradas» o «premium» del iPhone,
  // las «Natural» de Edge y la de Google en Android suenan mucho más humanas.
  const FEMALE = /paulina|m[oó]nica|marisol|ang[eé]lica|soledad|isabela|francisca|sabina|helena|laura|dalia|elvira|paloma|carmen|luc[ií]a|esperanza|valeria|camila|ximena|renata|elena|beatriz|lupe|pen[eé]lope|conchita|google español|female|mujer/i;
  const MALE = /juan|jorge|diego|carlos|pablo|ra[uú]l|enrique|miguel|alberto|[aá]lvaro|jos[eé]|antonio|\bmale\b|hombre/i;
  const NOVELTY = /eddy|\bflo\b|grandma|grandpa|\breed\b|rocko|sandy|shelley|bells|bubbles|albert|bad news|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|bahh|junior|ralph|kathy|fred/i;
  function voiceScore(v) {
    const id = v.name + ' ' + (v.voiceURI || '');
    let s = 0;
    if (/^es[-_]MX/i.test(v.lang)) s += 4;
    else if (/^es[-_](US|419)/i.test(v.lang)) s += 3;
    else if (/^es[-_]ES/i.test(v.lang)) s += 2;
    if (FEMALE.test(id)) s += 6;
    if (MALE.test(id)) s -= 8;
    if (/premium/i.test(id)) s += 7;
    else if (/enhanced|mejorad|natural|neural|online/i.test(id)) s += 5;
    if (NOVELTY.test(id)) s -= 20;
    return s;
  }
  function spanishVoices() {
    if (!root.speechSynthesis) return [];
    return root.speechSynthesis
      .getVoices()
      .filter((v) => /^es/i.test(v.lang))
      .sort((a, b) => voiceScore(b) - voiceScore(a));
  }
  const voiceId = (v) => v.voiceURI || v.name;
  let voice = null;
  function pickVoice() {
    if (voice) return voice;
    const vs = spanishVoices();
    voice = (S.voiceName && vs.find((v) => voiceId(v) === S.voiceName)) || vs[0] || null;
    return voice;
  }
  let lastSaid = 0;
  // Pocas frases, despacio y bajito: nunca corta una frase a medias ni encadena una tras otra.
  function say(text, force) {
    const synth = root.speechSynthesis;
    if (!synth || !S.enabled || (!force && (!S.voice || !unlocked || document.visibilityState !== 'visible'))) return;
    if (!force && (synth.speaking || synth.pending || Date.now() - lastSaid < 6000)) return;
    if (force) synth.cancel();
    lastSaid = Date.now();
    const u = new root.SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'es-MX';
    u.rate = 0.9;
    u.pitch = 1.04;
    u.volume = Math.max(0.15, Math.min(1, S.volume * 0.8));
    synth.speak(u);
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
      if (opts.voiceName !== undefined && opts.voiceName !== S.voiceName) voice = null;
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
    get nowPlaying() {
      return ambience && ambience.music ? playing : null;
    },
    voices: () => spanishVoices().map((v) => ({ id: voiceId(v), name: v.name, lang: v.lang })),
    get voiceName() {
      const v = pickVoice();
      return v ? v.name : '';
    },
    testVoice() {
      say('Hola, bienvenido a la mesa. Hagan sus apuestas.', true);
    },
    onVoices: null,
  };
  for (const k of Object.keys(fxs))
    api[k] = (...args) => {
      if (ready()) fxs[k](...args);
    };
  if (root.speechSynthesis && root.speechSynthesis.addEventListener)
    root.speechSynthesis.addEventListener('voiceschanged', () => {
      voice = null;
      pickVoice();
      if (api.onVoices) api.onVoices();
    });
  root.SFX = api;
})(typeof window !== 'undefined' ? window : this);
