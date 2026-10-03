/* Seis Mazos — interfaz: mesa, ejercicios, tablas y reglas. Usa window.BJ (engine.js). */
(function () {
  'use strict';
  const BJ = window.BJ;
  const rng = BJ.defaultRng();
  const NAME = Object.assign({}, BJ.ACTION_NAMES, { I: 'Tomar seguro', N: 'No tomar seguro' });
  const ACTIONS = ['H', 'S', 'D', 'P', 'R'];
  const AVAIL_KEY = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };
  const SPEEDS = { slow: 650, normal: 380, fast: 190, instant: 0 };
  const BOT_NAMES = ['Marta', 'Joel', 'Inés', 'Raúl'];
  const CODE_LABEL = { H: 'H', S: 'S', D: 'D', Ds: 'Ds', P: 'P', R: 'R', Rh: 'R', Rs: 'Rs', Rp: 'Rp', '': '' };
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props)
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const money = (n) => {
    const v = Math.round(Math.abs(n) * 100) / 100;
    return (n < 0 ? '−$' : '$') + v.toLocaleString('es-MX', { maximumFractionDigits: 2 });
  };
  const signed = (n, d = 0) => {
    const v = Number(n.toFixed(d));
    if (v === 0) return d ? (0).toFixed(d) : '0';
    return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function handLabel(cards) {
    const hv = BJ.handValue(cards);
    if (BJ.isPair(cards)) {
      const r = cards[0].v === 1 ? 'A' : String(cards[0].v);
      return `pareja ${r},${r}`;
    }
    return `${hv.soft ? 'blando' : 'duro'} ${hv.total}`;
  }
  function totalText(cards) {
    const hv = BJ.handValue(cards);
    if (hv.soft && hv.total < 21) return `${hv.total - 10}/${hv.total}`;
    return String(hv.total);
  }
  const RANK_NAME = { A: 'As', J: 'Jota', Q: 'Reina', K: 'Rey' };
  const SUIT_NAME = { s: 'picas', h: 'corazones', d: 'diamantes', c: 'tréboles' };
  const cardName = (c) => `${RANK_NAME[c.rank] || c.rank} de ${SUIT_NAME[c.suit]}`;

  /* ---------- Estado y persistencia ---------- */
  const STORE = 'seis-mazos-v1';
  const DEFAULT_TRAINING = {
    useDeviations: true,
    onMistake: 'retry',
    quiz: 'every5',
    quizTC: true,
    showTags: false,
    showDecks: false,
    gradeBets: true,
    unit: 25,
    maxSpread: 12,
    bots: 2,
    seat: 'third',
    speed: 'normal',
    showHud: false,
  };
  const START_BANK = 5000;
  const emptyStats = () => ({
    hands: 0,
    decisions: 0,
    correct: 0,
    devSeen: 0,
    devCorrect: 0,
    ins: 0,
    insCorrect: 0,
    quiz: 0,
    quizCorrect: 0,
    bets: 0,
    betsOk: 0,
    net: 0,
    errors: [],
  });
  const emptyDrills = () => ({
    sd: { n: 0, ok: 0, streak: 0, best: 0, cells: {} },
    dv: { n: 0, ok: 0, streak: 0, best: 0, per: {} },
    cd: { history: [] },
  });

  const settings = { rules: clone(BJ.DEFAULT_RULES), training: clone(DEFAULT_TRAINING) };
  let stats = emptyStats();
  let drills = emptyDrills();
  const state = { bankroll: START_BANK, tab: 'mesa', token: '' };

  function snapshot() {
    return {
      rules: settings.rules,
      training: settings.training,
      bankroll: state.bankroll,
      stats,
      drills,
      tab: state.tab,
      token: state.token,
    };
  }
  function readStore() {
    try {
      const raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(snapshot()));
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }
  function restore(data) {
    if (!data || typeof data !== 'object') return;
    if (data.rules) Object.assign(settings.rules, data.rules);
    if (data.training) Object.assign(settings.training, data.training);
    if (typeof data.bankroll === 'number') state.bankroll = data.bankroll;
    if (data.stats) stats = Object.assign(emptyStats(), data.stats);
    if (data.drills) {
      const d = emptyDrills();
      drills = {
        sd: Object.assign(d.sd, data.drills.sd),
        dv: Object.assign(d.dv, data.drills.dv),
        cd: Object.assign(d.cd, data.drills.cd),
      };
    }
    if (data.tab) state.tab = data.tab;
    if (typeof data.token === 'string') state.token = data.token;
  }

  /* ---------- Cartas en el DOM ---------- */
  function fillCardEl(el, card) {
    const red = card.suit === 'h' || card.suit === 'd';
    const sym = BJ.SUIT_SYMBOL[card.suit];
    const face = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
    const t = BJ.hiLo(BJ.rankValue(card.rank));
    el.classList.toggle('red', red);
    el.innerHTML =
      `<span class="idx"><b>${card.rank}</b><i>${sym}</i></span>` +
      `<span class="pip${face ? ' face' : ''}">${face ? card.rank : sym}</span>` +
      `<span class="idx br"><b>${card.rank}</b><i>${sym}</i></span>` +
      `<span class="back"></span>` +
      `<span class="tag" data-t="${t}">${t > 0 ? '+1' : t < 0 ? '−1' : '0'}</span>`;
    el.setAttribute('aria-label', cardName(card));
    return el;
  }
  function makeCardEl(card, extraClass) {
    return fillCardEl(h('div', { class: 'card' + (extraClass ? ' ' + extraClass : ''), role: 'img' }), card);
  }
  // Carta boca abajo cuyo valor aún no se conoce (en el teléfono invitado).
  function makeBackEl() {
    const el = h('div', { class: 'card', role: 'img' });
    el.innerHTML = '<span class="back"></span>';
    return el;
  }

  function speedMs() {
    const v = SPEEDS[settings.training.speed];
    return v == null ? 380 : v;
  }
  function applySpeed() {
    const ms = speedMs();
    document.documentElement.style.setProperty('--deal-ms', Math.max(ms * 0.9, 120) + 'ms');
  }

  function animateFrom(el, fromEl) {
    if (reducedMotion || speedMs() === 0) return;
    if (fromEl) {
      const a = fromEl.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (a.width && b.width) {
        el.style.setProperty('--dx', a.left + a.width / 2 - (b.left + b.width / 2) + 'px');
        el.style.setProperty('--dy', a.top + a.height / 2 - (b.top + b.height / 2) + 'px');
      }
    }
    el.classList.add('deal-in');
    el.addEventListener('animationend', () => el.classList.remove('deal-in'), { once: true });
  }
  function flipIn(el) {
    if (reducedMotion || speedMs() === 0) return;
    el.classList.add('flip');
    el.addEventListener('animationend', () => el.classList.remove('flip'), { once: true });
  }

  // Sincroniza un contenedor con una lista de nodos sin recrear los que ya están en su sitio.
  function syncChildren(box, want) {
    const kids = box.children;
    let i = 0;
    while (i < kids.length && i < want.length && kids[i] === want[i]) i++;
    if (i === kids.length) for (let j = i; j < want.length; j++) box.appendChild(want[j]);
    else box.replaceChildren(...want);
  }

  /* ======================================================================
   * MESA
   * Quien crea la mesa (o juega solo) es el anfitrión: reparte, corrige y lleva el dinero.
   * Los invitados reciben una vista de la mesa y solo contestan a lo que se les pregunta.
   * ==================================================================== */
  const T = {
    shoe: null,
    rc: 0,
    rules: clone(BJ.DEFAULT_RULES),
    dealer: { cards: [] },
    hidden: new Set(),
    seats: [],
    active: null,
    pending: null,
    msg: '',
    msgFor: {},
    discards: 0,
    needShuffle: true,
    round: 0,
    bet: 25,
    lastBet: 25,
    quizDue: false,
    upV: null,
    veilHud: false,
    loopGen: 0,
    betCollector: null,
    model: null,
    paintedRound: -1,
    tickDecks: 0,
  };
  const cardNodes = new Map();
  const seatNodes = new Map();
  const handNodes = new Map();
  let handSeq = 0;

  const emptySession = () => ({ decisions: 0, correct: 0, net: 0, roundNet: 0 });
  // p1 es siempre el jugador de este teléfono cuando hace de anfitrión o juega solo.
  // Los jugadores no tienen nombre propio: "Jugador 1" es quien crea la mesa.
  const ME = { id: 'p1', name: 'Jugador 1', local: true, session: emptySession() };
  let players = [ME];
  const team = { bank: 0 };

  const humans = () => players.filter((p) => !p.gone);
  const playerById = (id) => players.find((p) => p.id === id);
  const myId = () => (NET.role === 'guest' ? NET.myId : 'p1');

  function newHand(bet) {
    return {
      id: ++handSeq,
      cards: [],
      bet,
      baseBet: bet,
      fromSplit: false,
      splitAces: false,
      done: false,
      surrendered: false,
      doubled: false,
      evenMoney: false,
      result: null,
    };
  }

  // bets: Map idJugador -> apuesta. Sin apuestas (vista previa) se sientan todos los humanos.
  function setupSeats(bets) {
    const hs = humans().filter((p) => !bets || (bets.get(p.id) || 0) > 0);
    const block = [...hs.filter((p) => !p.local), ...hs.filter((p) => p.local)];
    const n = Math.max(0, Math.min(settings.training.bots, 7 - block.length));
    const pos = settings.training.seat === 'first' ? 0 : settings.training.seat === 'middle' ? Math.floor(n / 2) : n;
    const seats = [];
    let b = 0;
    for (let i = 0; i <= n; i++) {
      if (i === pos)
        for (const p of block)
          seats.push({ id: 'seat-' + p.id, pid: p.id, name: p.name, hands: [newHand(bets ? bets.get(p.id) : 0)] });
      if (i < n) {
        seats.push({ id: 'bot' + b, pid: null, name: BOT_NAMES[b], hands: [newHand(settings.training.unit)] });
        b++;
      }
    }
    T.seats = seats;
  }

  function tableCardCount() {
    let n = T.dealer.cards.length;
    for (const s of T.seats) for (const hd of s.hands) n += hd.cards.length;
    return n;
  }

  function clearTable() {
    T.discards += tableCardCount();
    T.dealer.cards = [];
    for (const s of T.seats) s.hands = [];
    T.hidden.clear();
    T.active = null;
  }

  function shuffleShoe() {
    const r = settings.rules;
    T.shoe = new BJ.Shoe(r.decks, r.penetration, rng);
    T.rc = 0;
    T.discards = 0;
    T.needShuffle = false;
  }

  // Conteo visible para este teléfono (anfitrión: el real; invitado: el que manda el anfitrión).
  function liveCount() {
    if (NET.role === 'guest') {
      const v = NET.view;
      return v && v.shoe ? { rc: v.rc, remaining: v.shoe.remaining } : { rc: 0, remaining: activeRules().decks * 52 };
    }
    return { rc: T.rc, remaining: T.shoe ? T.shoe.remaining : settings.rules.decks * 52 };
  }
  function tcExact() {
    const c = liveCount();
    return BJ.trueCount(c.rc, c.remaining);
  }
  function tcEst() {
    const c = liveCount();
    return c.rc / BJ.estimatedDecks(c.remaining);
  }
  function activeRules() {
    return NET.role === 'guest' && NET.view ? NET.view.rules : settings.rules;
  }
  function tableUnit() {
    return NET.role === 'guest' && NET.view ? NET.view.unit : settings.training.unit;
  }
  function tableSpread() {
    return NET.role === 'guest' && NET.view ? NET.view.maxSpread : settings.training.maxSpread;
  }

  // Mensaje de estado; `per` permite un texto distinto para cada jugador.
  function setMsg(m, per) {
    T.msg = m;
    T.msgFor = per || {};
    if (NET.role !== 'guest') renderTable();
  }

  function pause(mult) {
    const ms = speedMs() * (mult || 1);
    return ms ? sleep(ms) : Promise.resolve();
  }

  async function draw(target, faceUp) {
    const card = T.shoe.draw();
    if (T.shoe.emergency) {
      T.shoe.emergency = false;
      T.rc = 0;
      T.discards = 0;
      setMsg('Se acabaron las cartas del zapato: se baraja uno nuevo y el conteo vuelve a 0.');
    }
    target.cards.push(card);
    if (faceUp) T.rc += BJ.hiLo(card);
    else T.hidden.add(card.id);
    renderTable();
    await pause();
    return card;
  }

  // Pregunta a quien tiene este teléfono y espera la respuesta en los controles.
  function ask(kind, data) {
    return new Promise((resolve) => {
      T.pending = {
        kind,
        data: data || {},
        resolve: (v) => {
          T.pending = null;
          renderControls();
          resolve(v);
        },
      };
      renderControls();
    });
  }
  // Pregunta a un jugador, esté en este teléfono o en otro. Devuelve null si se desconecta.
  function askP(p, kind, data) {
    return p.local ? ask(kind, data) : NET.ask(p, kind, data);
  }
  function feedback(p, verdict, title, lines) {
    if (p.local) showFeedback($('feedback'), verdict, title, lines);
    else NET.send(p, { t: 'fb', verdict, title, lines });
  }
  function applyStat(d, err) {
    for (const k in d) stats[k] = (stats[k] || 0) + d[k];
    if (err) pushError(err);
    renderStats();
  }
  function recordStat(p, d, err) {
    if (d.decisions) {
      p.session.decisions += d.decisions;
      p.session.correct += d.correct || 0;
    }
    if (p.local) applyStat(d, err);
    else NET.send(p, { t: 'stat', d, err: err || null });
  }
  function bankOf(p) {
    if (NET.mode === 'coop') return team.bank;
    return p.local ? state.bankroll : p.bank;
  }
  function credit(p, net) {
    if (!p || !net) return;
    p.session.net += net;
    p.session.roundNet += net;
    if (NET.mode === 'coop') team.bank += net;
    else if (p.local) state.bankroll += net;
    else p.bank += net;
    if (p.local) stats.net += net;
    else NET.send(p, { t: 'stat', d: { net }, err: null });
  }

  /* ---------- Vista de la mesa (la misma para anfitrión e invitados) ---------- */
  function cardView(c) {
    return T.hidden.has(c.id) ? { id: c.id, down: true } : { id: c.id, rank: c.rank, suit: c.suit, v: c.v };
  }
  function buildModel() {
    const s = T.shoe;
    return {
      round: T.round,
      dealer: T.dealer.cards.map(cardView),
      seats: T.seats.map((seat) => ({
        id: seat.id,
        pid: seat.pid,
        name: seat.name,
        hands: seat.hands.map((hd) => ({
          id: hd.id,
          cards: hd.cards.map(cardView),
          bet: hd.bet,
          doubled: hd.doubled,
          result: hd.result,
          active: T.active === hd,
          natural: BJ.isNatural(hd),
        })),
      })),
      shoe: s ? { remaining: s.remaining, size: s.size, cutIndex: s.cutIndex, decks: s.decks } : null,
      discards: T.discards,
      rc: T.rc,
      msg: T.msg,
      msgFor: T.msgFor,
      rules: settings.rules,
      unit: settings.training.unit,
      maxSpread: settings.training.maxSpread,
      mode: NET.mode,
      team: team.bank,
      players: players.map((p) => ({ id: p.id, name: p.name, gone: !!p.gone, bank: bankOf(p), s: p.session })),
    };
  }

  function renderTable() {
    const m = NET.role === 'guest' ? NET.view : buildModel();
    if (!m) return;
    T.model = m;
    paintTable(m);
    if (NET.role === 'host') NET.broadcastView(m);
  }

  function paintTable(m) {
    if (m.round !== T.paintedRound) {
      T.paintedRound = m.round;
      cardNodes.clear();
      handNodes.clear();
    }
    syncCards($('dealer-cards'), m.dealer);
    const dt = $('dealer-total');
    const visible = m.dealer.filter((c) => !c.down);
    dt.hidden = !m.dealer.length;
    if (visible.length) dt.textContent = totalText(visible);
    syncChildren($('seats'), m.seats.map(seatNode));
    renderShoe(m);
    renderHud(m);
    $('status-msg').textContent = (m.msgFor && m.msgFor[myId()]) || m.msg || '';
    renderScore(m);
    renderBank(m);
  }

  /* ---------- Render de cartas, manos y asientos ---------- */
  function cardNode(cv) {
    let el = cardNodes.get(cv.id);
    if (!el) {
      el = cv.down ? makeBackEl() : makeCardEl(cv);
      el._fresh = true;
      el._blank = !!cv.down;
      if (cv.down) el.classList.add('down');
      cardNodes.set(cv.id, el);
    } else if (el.classList.contains('down') && !cv.down) {
      if (el._blank) {
        fillCardEl(el, cv);
        el._blank = false;
      }
      el.classList.remove('down');
      flipIn(el);
    }
    el.setAttribute('aria-label', cv.down ? 'Carta boca abajo' : cardName(cv));
    return el;
  }

  function syncCards(box, cards) {
    const want = cards.map(cardNode);
    syncChildren(box, want);
    const shoe = $('shoe');
    for (const el of want)
      if (el._fresh) {
        el._fresh = false;
        animateFrom(el, shoe);
      }
  }

  function chipValue(amount) {
    if (amount >= 500) return 500;
    if (amount >= 100) return 100;
    if (amount >= 25) return 25;
    return 5;
  }

  const RESULT_TEXT = {
    win: 'Gana',
    lose: 'Pierde',
    bust: 'Se pasa',
    push: 'Empate',
    bj: 'Blackjack',
    surrender: 'Rendida',
    even: 'Pago igual',
  };
  function signedMoney(n) {
    return (n > 0 ? '+' : '') + money(n);
  }

  function handNode(hv, seat) {
    let n = handNodes.get(hv.id);
    if (!n) {
      const cards = h('div', { class: 'cards' });
      const total = h('span', { class: 'pill' });
      const res = h('span', { class: 'pill' });
      const chip = h('div', { class: 'chip' });
      const amt = h('span', { class: 'amt' });
      const spot = h('div', { class: 'spot' }, chip, amt);
      const meta = h('div', { class: 'hand-meta' }, total, res);
      const root = h('div', { class: 'hand' }, cards, meta, spot);
      n = { root, cards, total, res, chip, amt };
      handNodes.set(hv.id, n);
    }
    syncCards(n.cards, hv.cards);
    n.root.classList.toggle('active', !!hv.active);
    n.total.hidden = hv.cards.length === 0;
    n.total.textContent = hv.natural ? 'BJ' : hv.cards.length ? totalText(hv.cards) : '';
    if (hv.result) {
      const r = hv.result;
      n.res.hidden = false;
      n.res.className = 'pill res-' + r.result;
      n.res.textContent = seat.pid && r.net ? `${RESULT_TEXT[r.result]} ${signedMoney(r.net)}` : RESULT_TEXT[r.result];
    } else n.res.hidden = true;
    n.chip.hidden = !hv.bet;
    n.chip.dataset.v = chipValue(hv.bet);
    n.chip.textContent = hv.doubled ? '×2' : '';
    n.amt.textContent = hv.bet ? money(hv.bet) : '';
    return n.root;
  }

  function seatNode(seat) {
    let n = seatNodes.get(seat.id);
    if (!n) {
      const hands = h('div', { class: 'hands' });
      const name = h('div', { class: 'seat-name' });
      const root = h('div', { class: 'seat' }, hands, name);
      n = { root, hands, name };
      seatNodes.set(seat.id, n);
    }
    const mine = seat.pid && seat.pid === myId();
    n.root.className = 'seat' + (mine ? ' you' : seat.pid ? ' mate' : '');
    n.name.textContent = mine ? 'Tú' : seat.name;
    syncChildren(
      n.hands,
      seat.hands.map((hv) => handNode(hv, seat)),
    );
    return n.root;
  }

  function buildTrayTicks(decks) {
    const tray = $('tray');
    tray.querySelectorAll('.tray-tick').forEach((t) => t.remove());
    for (let k = 1; k < decks; k++) {
      const t = h('span', { class: 'tray-tick' });
      t.style.bottom = (k / decks) * 100 + '%';
      tray.appendChild(t);
    }
    T.tickDecks = decks;
  }

  function renderShoe(m) {
    const s = m && m.shoe;
    if (!s) return;
    if (T.tickDecks !== s.decks) buildTrayTicks(s.decks);
    $('shoe-fill').style.height = (s.remaining / s.size) * 100 + '%';
    $('shoe-cut').style.bottom = ((s.size - s.cutIndex) / s.size) * 100 + '%';
    $('tray-stack').style.height = `calc(${(m.discards / s.size) * 100}% - ${m.discards ? 3 : 0}px)`;
    const show = settings.training.showDecks;
    $('shoe-note').textContent = show ? `${(s.remaining / 52).toFixed(1)} mazos` : '';
    $('tray-note').textContent = show ? `${(m.discards / 52).toFixed(1)} fuera` : '';
  }

  function renderHud() {
    const c = liveCount();
    const veiled = !settings.training.showHud || T.veilHud;
    const tc = BJ.trueCount(c.rc, c.remaining);
    $('hud').classList.toggle('veiled', veiled);
    $('hud-toggle').textContent = settings.training.showHud ? 'Ocultar' : 'Mostrar';
    $('hud-rc').textContent = signed(c.rc);
    $('hud-tc').textContent = signed(tc, 1);
    $('hud-decks').textContent = (c.remaining / 52).toFixed(1);
    const edge = 0.5 * tc - BJ.houseEdge(activeRules());
    const units = BJ.rampUnits(tc, tableSpread());
    $('hud-extra').textContent = veiled
      ? 'Cuenta tú; ábrelo para comprobar.'
      : `Ventaja ≈ ${edge >= 0 ? '+' : '−'}${Math.abs(edge).toFixed(2)}% · rampa ${units} u (${money(units * tableUnit())})`;
  }

  function renderBank(m) {
    const coop = (m ? m.mode : NET.mode) === 'coop';
    const b = $('bankroll');
    const val = coop ? (m ? m.team : team.bank) : state.bankroll;
    $('bank-label').textContent = coop ? 'Banca del equipo' : 'Banca';
    b.textContent = money(val);
    b.classList.toggle('neg', val < 0);
  }

  function renderScore(m) {
    const panel = $('score-panel');
    const online = m && m.mode !== 'solo' && m.players.length > 1;
    panel.hidden = !online;
    if (!online) return;
    const coop = m.mode === 'coop';
    $('score-title').textContent = coop ? 'Equipo (banca común)' : 'Marcador individual';
    const rows = m.players.map((p) =>
      h(
        'tr',
        { class: p.id === myId() ? 'me' : null },
        h('td', null, p.id === myId() ? 'Tú' : p.name, p.gone ? h('span', { class: 'muted small' }, ' · fuera') : null),
        coop ? null : h('td', { class: 'num' }, money(p.bank)),
        h('td', { class: 'num' }, `${pct(p.s.correct, p.s.decisions)}`),
        h('td', { class: 'num' }, signedMoney(p.s.net)),
      ),
    );
    const totals = coop
      ? h(
          'tr',
          { class: 'total' },
          h('td', null, 'Equipo'),
          h(
            'td',
            { class: 'num' },
            pct(
              m.players.reduce((a, p) => a + p.s.correct, 0),
              m.players.reduce((a, p) => a + p.s.decisions, 0),
            ),
          ),
          h('td', { class: 'num' }, signedMoney(m.players.reduce((a, p) => a + p.s.net, 0))),
        )
      : null;
    fill(
      $('score'),
      h(
        'table',
        { class: 'list score' },
        h(
          'thead',
          null,
          h('tr', null, h('th', null, 'Jugador'), coop ? null : h('th', null, 'Banca'), h('th', null, 'Aciertos'), h('th', null, 'Sesión')),
        ),
        h('tbody', null, rows, totals),
      ),
      coop ? h('p', { class: 'small muted' }, `Banca común: ${money(m.team)}. Ganáis y perdéis juntos.`) : null,
    );
  }

  const extraSur = (r) => r.h17 && r.surrender === 'late' && r.h17ExtraSurrender;
  function rulesSummary(r) {
    return [
      `${r.decks} mazos`,
      r.h17 ? 'H17' : 'S17',
      r.das ? 'DAS' : 'sin DAS',
      r.surrender === 'late' ? (extraSur(r) ? 'rendición (+ extras H17)' : 'rendición') : 'sin rendición',
      `separar hasta ${r.maxHands}`,
      r.resplitAces ? 'RSA' : 'sin RSA',
      r.doubleOn === 'any' ? 'doblar 2 cartas' : `doblar ${r.doubleOn}`,
      `BJ ${r.bjPays === 1.5 ? '3:2' : '6:5'}`,
      `corte ${Math.round(r.penetration * 100)}%`,
    ].join(' · ');
  }

  function renderPrint() {
    const r = activeRules();
    $('print-bj').textContent = `BLACKJACK PAGA ${r.bjPays === 1.5 ? '3 A 2' : '6 A 5'}`;
    $('print-dealer').textContent = r.h17 ? 'EL CRUPIER PIDE CON 17 BLANDO' : 'EL CRUPIER SE PLANTA EN TODOS LOS 17';
    $('rules-line').textContent = rulesSummary(r);
    $('felt').classList.toggle('hide-tags', !settings.training.showTags);
  }

  /* ---------- Controles ---------- */
  function actionButtons(avail, onPick) {
    return ACTIONS.map((code) =>
      h(
        'button',
        {
          class: `btn act act-${code}`,
          type: 'button',
          disabled: !avail[AVAIL_KEY[code]],
          onclick: () => onPick(code),
        },
        NAME[code],
        h('kbd', null, code),
      ),
    );
  }

  function renderControls() {
    const box = $('controls');
    const p = T.pending;
    box.replaceChildren();
    if (!p) return;
    if (p.kind === 'bet') {
      const unit = tableUnit();
      const chips = [5, 25, 100, 500].map((v) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-v': v,
            'aria-label': `Añadir ${v}`,
            onclick: () => {
              T.bet += v;
              renderControls();
            },
          },
          v,
        ),
      );
      const units = T.bet / unit;
      const readout = h(
        'div',
        { class: 'bet-readout' },
        h('b', null, money(T.bet)),
        h('span', null, `${Number(units.toFixed(2))} u · unidad ${money(unit)}`),
      );
      const ramp = BJ.rampUnits(tcExact(), tableSpread());
      const online = NET.role !== 'solo';
      fill(
        box,
        ...chips,
        readout,
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: () => {
              T.bet = 0;
              renderControls();
            },
          },
          'Borrar',
        ),
        settings.training.showHud
          ? h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                title: 'Apuesta según la rampa (TC − 1) unidades',
                onclick: () => {
                  T.bet = ramp * unit;
                  renderControls();
                },
              },
              `Rampa: ${ramp} u`,
            )
          : null,
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            disabled: T.bet <= 0,
            onclick: () => {
              T.lastBet = T.bet;
              p.resolve(T.bet);
            },
          },
          online ? 'Apostar' : 'Repartir',
          h('kbd', null, '↵'),
        ),
      );
    } else if (p.kind === 'insurance') {
      const bet = p.data.bet;
      box.append(
        h('span', null, p.data.natural ? '¿Aceptas pago igual (1 a 1)?' : `¿Seguro por ${money(bet / 2)}?`),
        h('button', { class: 'btn', type: 'button', onclick: () => p.resolve('I') }, 'Sí', h('kbd', null, 'S')),
        h('button', { class: 'btn', type: 'button', onclick: () => p.resolve('N') }, 'No', h('kbd', null, 'N')),
      );
    } else if (p.kind === 'action') {
      box.append(
        ...actionButtons(p.data.avail, (code) => p.resolve(code)),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => p.resolve('hint') }, 'Pista', h('kbd', null, '?')),
      );
    } else if (p.kind === 'quiz') {
      const rc = stepper('quiz-rc', 0, 1);
      const tc = p.data.askTC ? stepper('quiz-tc', 0, 1) : null;
      const submit = () => {
        const a = { rc: Math.round(Number(rc.input.value) || 0), tc: tc ? Number(tc.input.value) || 0 : null };
        p.resolve(a);
      };
      box.append(
        h(
          'form',
          {
            class: 'quiz',
            onsubmit: (e) => {
              e.preventDefault();
              submit();
            },
          },
          h('label', { class: 'field' }, 'Running count', rc.root),
          tc ? h('label', { class: 'field' }, 'True count', tc.root) : null,
          h('button', { class: 'btn primary', type: 'submit' }, 'Comprobar', h('kbd', null, '↵')),
        ),
      );
      setTimeout(() => rc.input.focus({ preventScroll: true }), 0);
    } else if (p.kind === 'continue') {
      box.append(h('button', { class: 'btn primary', type: 'button', onclick: () => p.resolve(true) }, p.data.label || 'Seguir', h('kbd', null, '↵')));
    }
  }

  function stepper(id, value, step) {
    const input = h('input', { id, type: 'number', inputmode: 'numeric', step: 'any', value: String(value) });
    const bump = (d) => {
      input.value = String(Math.round(((Number(input.value) || 0) + d) * 10) / 10);
    };
    const root = h(
      'div',
      { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Restar', onclick: () => bump(-step) }, '−'),
      input,
      h('button', { type: 'button', 'aria-label': 'Sumar', onclick: () => bump(step) }, '+'),
    );
    return { root, input };
  }

  /* ---------- Panel lateral ---------- */
  function showFeedback(box, verdict, title, lines) {
    const mark = verdict === 'ok' ? '✓' : verdict === 'bad' ? '✗' : 'i';
    fill(
      box,
      h('div', { class: 'verdict ' + verdict }, h('span', { class: 'mark' }, mark), h('span', null, title)),
      lines && lines.length ? h('ul', { class: 'why' }, lines.map((l) => h('li', { html: l }))) : null,
    );
  }

  function renderStats() {
    const s = stats;
    const rows = [
      ['Manos', s.hands],
      ['Decisiones correctas', `${s.correct}/${s.decisions} · ${pct(s.correct, s.decisions)}`],
      ['Desviaciones', `${s.devCorrect}/${s.devSeen} · ${pct(s.devCorrect, s.devSeen)}`],
      ['Seguro', `${s.insCorrect}/${s.ins}`],
      ['Controles de conteo', `${s.quizCorrect}/${s.quiz} · ${pct(s.quizCorrect, s.quiz)}`],
      ['Apuestas según rampa', `${s.betsOk}/${s.bets}`],
      ['Resultado', signedMoney(s.net)],
    ];
    $('stats').replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    const errs = s.errors;
    $('errors').replaceChildren(
      ...(errs.length
        ? errs.map((e) => h('li', null, h('span', null, e.what), h('span', null, e.tc), h('span', { class: 'muted' }, `${e.you} → ${e.right}`)))
        : [h('li', { class: 'empty' }, 'Sin errores todavía.')]),
    );
    renderBank(T.model);
  }

  function pushError(e) {
    stats.errors.unshift(e);
    if (stats.errors.length > 25) stats.errors.length = 25;
  }

  /* ---------- Explicaciones ---------- */
  function codeNote(code, action) {
    if (code === 'Ds' && action === 'S') return ' (la tabla dice doblar; como no se puede, plantarse)';
    if (code === 'D' && action === 'H') return ' (la tabla dice doblar; como no se puede, pedir)';
    if (code === 'Rh' && action === 'H') return ' (no se puede rendir: pedir)';
    if (code === 'Rs' && action === 'S') return ' (no se puede rendir: plantarse)';
    if (code === 'Rp' && action === 'P') return ' (no se puede rendir: separar)';
    if (code === 'Ds' && action === 'D') return ' (si no se pudiera doblar, plantarse)';
    return '';
  }

  function explainDecision(g, cards, upV, tc) {
    const b = g.basic;
    const lines = [
      `Básica: <b>${handLabel(cards)}</b> contra <b>${BJ.upLabel(upV)}</b> → <b>${NAME[b.action]}</b>${codeNote(b.code, b.action)}`,
    ];
    for (const { dev, applies } of g.devs) {
      const idx = signed(dev.index);
      const then = applies ? NAME[dev.above] : dev.kind === 'sur' ? 'no rendirse' : NAME[dev.below];
      lines.push(
        `Desviación <b>${BJ.deviationName(dev)}</b> (índice ${idx}): TC ${signed(tc, 1)} ${applies ? '≥' : '<'} ${idx} → <b>${then}</b>`,
      );
    }
    if (g.borderline) {
      const other = [...g.accepted].find((a) => a !== g.action);
      lines.push(`Estás justo en el índice: estimando los mazos a medio mazo también vale <b>${NAME[other]}</b>.`);
    }
    return lines;
  }

  /* ---------- Desarrollo de una mano (solo en el anfitrión) ---------- */
  async function userDecision(p, hand, avail) {
    const useDev = settings.training.useDeviations;
    const tcx = tcExact();
    const g = BJ.gradeDecision(hand.cards, T.upV, avail, T.rules, tcx, tcEst(), useDev);
    let first = true;
    let hinted = false;
    for (;;) {
      const a = await askP(p, 'action', { avail });
      if (a == null || !(a === 'hint' || avail[AVAIL_KEY[a]])) return g.basic.action; // jugador desconectado
      if (a === 'hint') {
        hinted = true;
        feedback(p, 'info', `Pista: ${NAME[g.action]}`, explainDecision(g, hand.cards, T.upV, tcx));
        continue;
      }
      const ok = g.accepted.has(a);
      if (first && !hinted) {
        const d = { decisions: 1, correct: ok ? 1 : 0 };
        if (useDev && g.devs.length) {
          d.devSeen = 1;
          d.devCorrect = ok ? 1 : 0;
        }
        const err = ok
          ? null
          : {
              what: `${handLabel(hand.cards)} vs ${BJ.upLabel(T.upV)}`,
              tc: useDev ? `TC ${signed(tcx, 1)}` : '',
              you: NAME[a],
              right: NAME[g.action],
            };
        recordStat(p, d, err);
      }
      first = false;
      const title = ok
        ? `${NAME[a]}: correcto${g.isDeviation ? ' (desviación)' : ''}`
        : `${NAME[a]} no es lo correcto: ${NAME[g.action]}`;
      feedback(p, ok ? 'ok' : 'bad', title, explainDecision(g, hand.cards, T.upV, tcx));
      if (!ok && settings.training.onMistake === 'retry') {
        setMsg(`Corrige la jugada para seguir.`, { [p.id]: 'Corrige la jugada para seguir.' });
        continue;
      }
      return a;
    }
  }

  async function playHand(seat, i) {
    const hand = seat.hands[i];
    if (hand.done || hand.result) return;
    const p = seat.pid ? playerById(seat.pid) : null;
    T.active = hand;
    renderTable();
    if (hand.cards.length === 1) await draw(hand, true);
    for (;;) {
      if (BJ.handValue(hand.cards).total >= 21) break;
      const avail = BJ.availableActions(hand, seat.hands.length, T.rules);
      if (!avail.hit && !avail.split && !avail.double) break; // ases separados: una sola carta
      let a;
      if (p && !p.gone) {
        const sit = `${handLabel(hand.cards)} contra ${BJ.upLabel(T.upV)}`;
        setMsg(`Turno de ${p.name}: ${sit}.`, { [p.id]: `Tu turno: ${sit}.` });
        a = await userDecision(p, hand, avail);
      } else {
        await pause(1.1);
        a = BJ.basicDecision(hand.cards, T.upV, avail, T.rules).action;
      }
      if (a === 'S') break;
      if (a === 'R') {
        hand.surrendered = true;
        break;
      }
      if (a === 'H') {
        await draw(hand, true);
        continue;
      }
      if (a === 'D') {
        hand.bet *= 2;
        hand.doubled = true;
        await draw(hand, true);
        break;
      }
      if (a === 'P') {
        const second = hand.cards.pop();
        const nh = newHand(hand.baseBet);
        nh.cards.push(second);
        nh.fromSplit = true;
        hand.fromSplit = true;
        if (second.v === 1) {
          nh.splitAces = true;
          hand.splitAces = true;
        }
        seat.hands.splice(i + 1, 0, nh);
        renderTable();
        await pause();
        await draw(hand, true);
      }
    }
    hand.done = true;
    if (BJ.handValue(hand.cards).total > 21) settleOne(seat, hand, false);
    renderTable();
  }

  function settleOne(seat, hand, dealerBJ) {
    const res = BJ.settleHand(hand, T.dealer.cards, T.rules, dealerBJ);
    hand.result = res;
    if (seat.pid) credit(playerById(seat.pid), res.net);
  }

  async function gradedInsurance(p, natural, bet) {
    const useDev = settings.training.useDeviations;
    const tcx = tcExact();
    const g = BJ.insuranceDecision(tcx, tcEst(), useDev);
    let first = true;
    for (;;) {
      const a = await askP(p, 'insurance', { natural, bet });
      if (a !== 'I' && a !== 'N') return 'N';
      const ok = g.accepted.has(a);
      if (first) {
        const err = ok ? null : { what: natural ? 'Pago igual' : 'Seguro', tc: `TC ${signed(tcx, 1)}`, you: NAME[a], right: NAME[g.action] };
        recordStat(p, { ins: 1, insCorrect: ok ? 1 : 0 }, err);
      }
      first = false;
      const lines = [
        useDev
          ? `El seguro solo conviene con TC ≥ +3 (Hi-Lo). TC actual ${signed(tcx, 1)} → <b>${g.action === 'I' ? 'tomarlo' : 'no tomarlo'}</b>.`
          : 'Con estrategia básica el seguro (y el pago igual) nunca conviene.',
      ];
      if (g.borderline) lines.push('Estás justo en el índice: se acepta cualquiera de las dos.');
      feedback(p, ok ? 'ok' : 'bad', ok ? `${NAME[a]}: correcto` : `Lo correcto: ${NAME[g.action]}`, lines);
      if (!ok && settings.training.onMistake === 'retry') continue;
      return a;
    }
  }

  function gradeBet(p, bet) {
    const t = settings.training;
    if (!t.gradeBets) return;
    const units = bet / t.unit;
    const tcx = tcExact();
    const targets = [BJ.rampUnits(tcx, t.maxSpread), BJ.rampUnits(tcEst(), t.maxSpread)];
    const ok = targets.some((s) => (s === 1 ? units <= 1.5 : Math.abs(units - s) <= Math.max(0.5, s * 0.25)));
    const s = targets[0];
    const err = ok ? null : { what: `Apuesta ${money(bet)}`, tc: `TC ${signed(tcx, 1)}`, you: `${Number(units.toFixed(2))} u`, right: `${s} u` };
    recordStat(p, { bets: 1, betsOk: ok ? 1 : 0 }, err);
    feedback(p, ok ? 'ok' : 'bad', ok ? `Apuesta de ${money(bet)}: acorde a la rampa` : `Apuesta de ${money(bet)}: fuera de la rampa`, [
      `Rampa (TC − 1) unidades: con TC ${signed(tcx, 1)} tocan <b>${s} u</b> (${money(s * t.unit)}). Apostaste ${Number(units.toFixed(2))} u.`,
    ]);
  }

  async function countQuiz(p) {
    const askTC = settings.training.quizTC;
    const rc = T.rc;
    const tcx = tcExact();
    const decks = T.shoe.remaining / 52;
    if (p.local) {
      T.veilHud = true;
      renderHud();
    }
    const ans = await askP(p, 'quiz', { askTC });
    if (p.local) T.veilHud = false;
    if (!ans || typeof ans.rc !== 'number') return;
    const okRC = ans.rc === rc;
    const okTC = !askTC || Math.abs(ans.tc - tcx) <= 0.5 || ans.tc === Math.trunc(tcx);
    const ok = okRC && okTC;
    const lines = [
      `Running count: <b>${signed(rc)}</b>${okRC ? '' : ` (dijiste ${signed(ans.rc)})`}.`,
      `True count: ${signed(rc)} ÷ ${decks.toFixed(1)} mazos = <b>${signed(tcx, 1)}</b>${askTC && !okTC ? ` (dijiste ${signed(ans.tc, 1)})` : ''}.`,
    ];
    recordStat(p, { quiz: 1, quizCorrect: ok ? 1 : 0 }, ok ? null : { what: 'Control de conteo', tc: `RC ${signed(rc)}`, you: signed(ans.rc), right: signed(rc) });
    feedback(p, ok ? 'ok' : 'bad', ok ? 'Conteo correcto' : 'Conteo incorrecto', lines);
    if (p.local) renderHud();
    await askP(p, 'continue', { label: 'Seguir' });
  }

  // Espera la apuesta de todos los jugadores; quien entra a la mesa durante la espera también apuesta.
  function collectBets() {
    return new Promise((resolve) => {
      const bets = new Map();
      const asked = new Set();
      const check = () => {
        const hs = humans();
        const waiting = hs.filter((p) => !bets.has(p.id));
        if (!waiting.length) {
          T.betCollector = null;
          resolve(bets);
          return;
        }
        const per = {};
        const names = waiting.map((p) => p.name).join(' y ');
        for (const p of hs) per[p.id] = bets.has(p.id) ? `Esperando la apuesta de ${names}…` : 'Haz tu apuesta.';
        setMsg(T.betMsg || 'Haz tu apuesta.', Object.assign(per, T.betMsgFor || {}));
      };
      const request = (p) => {
        if (asked.has(p.id)) return;
        asked.add(p.id);
        askP(p, 'bet', {}).then((v) => {
          bets.set(p.id, typeof v === 'number' && v > 0 ? v : 0);
          check();
        });
      };
      T.betCollector = { request, check };
      humans().forEach(request);
      check();
    });
  }

  async function playRound(gen) {
    if (NET.role === 'solo') players = [ME];
    T.betMsg = '';
    if (T.quizDue) {
      T.quizDue = false;
      setMsg('Control de conteo: ¿cuánto llevas?');
      await Promise.all(humans().map(countQuiz));
    }
    if (!T.shoe || T.needShuffle || T.shoe.cutReached) {
      const wasCut = T.shoe && T.shoe.cutReached;
      clearTable();
      shuffleShoe();
      T.betMsg = wasCut
        ? 'Salió la carta de corte: zapato nuevo barajado, el conteo vuelve a 0. Haz tu apuesta.'
        : `Zapato de ${T.shoe.decks} mazos barajado: el conteo empieza en 0. Haz tu apuesta.`;
    }
    if (!tableCardCount()) setupSeats(null);
    renderBotsPicker();
    if (T.bet <= 0) T.bet = T.lastBet;

    const bets = await collectBets();
    if (gen !== T.loopGen) return;
    T.betMsg = '';
    if (T.needShuffle) shuffleShoe();
    T.rules = clone(settings.rules);
    for (const p of players) p.session.roundNet = 0;
    for (const [pid, bet] of bets) if (bet > 0) gradeBet(playerById(pid), bet);
    clearTable();
    setupSeats(bets);
    T.round++;
    renderBotsPicker();
    for (const seat of T.seats) if (seat.pid) recordStat(playerById(seat.pid), { hands: 1 });
    setMsg('Repartiendo…');

    for (let pass = 0; pass < 2; pass++) {
      for (const seat of T.seats) await draw(seat.hands[0], true);
      await draw(T.dealer, pass === 0);
    }
    const hole = T.dealer.cards[1];
    T.upV = BJ.upValue(T.dealer.cards[0]);
    const humanSeats = T.seats.filter((s) => s.pid);

    if (T.upV === 11) {
      setMsg('El crupier muestra un As: ¿seguro?');
      await Promise.all(
        humanSeats.map(async (seat) => {
          const hd = seat.hands[0];
          const natural = BJ.isNatural(hd);
          const choice = await gradedInsurance(playerById(seat.pid), natural, hd.bet);
          if (choice === 'I') {
            if (natural) hd.evenMoney = true;
            else seat.insurance = hd.bet / 2;
          }
        }),
      );
    }

    if (T.upV === 11 || T.upV === 10) {
      const dealerBJ = BJ.handValue(T.dealer.cards).total === 21;
      const insured = humanSeats.filter((s) => s.insurance);
      if (dealerBJ) {
        T.hidden.delete(hole.id);
        T.rc += BJ.hiLo(hole);
        for (const s of insured) credit(playerById(s.pid), s.insurance * 2);
        for (const seat of T.seats) for (const hd of seat.hands) settleOne(seat, hd, true);
        finishRound(insured.length ? 'El crupier tiene blackjack; el seguro paga 2 a 1.' : 'El crupier tiene blackjack.');
        return;
      }
      for (const s of insured) credit(playerById(s.pid), -s.insurance);
      setMsg(insured.length ? 'El crupier no tiene blackjack: el seguro se pierde.' : 'El crupier revisa: no tiene blackjack.');
      await pause(1.4);
    }

    for (const seat of T.seats) {
      const hd = seat.hands[0];
      if (hd.evenMoney || BJ.isNatural(hd)) {
        hd.done = true;
        settleOne(seat, hd, false);
      }
    }
    renderTable();

    for (const seat of T.seats) for (let i = 0; i < seat.hands.length; i++) await playHand(seat, i);
    T.active = null;

    setMsg('Juega el crupier.');
    T.hidden.delete(hole.id);
    T.rc += BJ.hiLo(hole);
    renderTable();
    await pause();
    const live = T.seats.some((s) => s.hands.some((hd) => !hd.result && !hd.surrendered));
    if (live) while (BJ.dealerShouldHit(T.dealer.cards, T.rules)) await draw(T.dealer, true);
    for (const seat of T.seats) for (const hd of seat.hands) if (!hd.result) settleOne(seat, hd, false);
    finishRound();
  }

  function finishRound(dealerMsg) {
    const dv = BJ.handValue(T.dealer.cards).total;
    const head = dealerMsg ? dealerMsg + ' ' : dv > 21 ? `El crupier se pasa (${dv}). ` : `El crupier tiene ${dv}. `;
    const tail = T.shoe.cutReached ? ' Salió la carta de corte: se baraja después de esta mano.' : '';
    const outcome = (net) => (net > 0 ? `ganas ${money(net)}` : net < 0 ? `pierdes ${money(-net)}` : 'quedas igual');
    const seated = new Set(T.seats.filter((s) => s.pid).map((s) => s.pid));
    const per = {};
    if (NET.mode === 'coop') {
      const teamNet = players.reduce((a, p) => a + p.session.roundNet, 0);
      const tn = teamNet > 0 ? `El equipo gana ${money(teamNet)}` : teamNet < 0 ? `El equipo pierde ${money(-teamNet)}` : 'El equipo queda igual';
      for (const p of humans()) per[p.id] = head + `${tn}${seated.has(p.id) ? ` (tú: ${signedMoney(p.session.roundNet)})` : ''}.` + tail;
    } else
      for (const p of humans()) {
        const o = outcome(p.session.roundNet);
        per[p.id] = head + (seated.has(p.id) ? o.charAt(0).toUpperCase() + o.slice(1) + '.' : 'No jugaste esta mano.') + tail;
      }
    const q = settings.training.quiz;
    T.quizDue =
      q === 'round' || (q === 'every5' && T.round % 5 === 0) || (q === 'random' && rng() < 0.25) || (q === 'shoe' && T.shoe.cutReached);
    T.active = null;
    setMsg(head + tail, per);
    renderStats();
    save();
  }

  async function tableLoop() {
    const gen = ++T.loopGen;
    for (;;) {
      if (gen !== T.loopGen) return;
      try {
        await playRound(gen);
      } catch (err) {
        if (gen !== T.loopGen) return;
        console.error(err);
        setMsg('Algo falló en la mano; se reparte de nuevo.');
        T.pending = null;
        T.needShuffle = true;
        await sleep(600);
      }
    }
  }

  /* ======================================================================
   * EN LÍNEA (PeerJS): un teléfono crea la mesa, el otro se une con un código.
   * ==================================================================== */
  const PROTO = 1;
  const PEER_PREFIX = 'seismazos-v1-';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MAX_GUESTS = 3;
  const NET = {
    role: 'solo', // 'solo' | 'host' | 'joining' | 'guest'
    mode: 'solo', // 'solo' | 'coop' | 'indiv'
    pickMode: 'coop',
    peer: null,
    code: '',
    hostConn: null,
    myId: 'p1',
    view: null,
    viewRules: '',
    reqs: new Map(),
    reqSeq: 0,
    guestSeq: 1,
    status: '',
    lastHeard: 0,
    timer: null,
    joinTimer: null,
    wakeLock: null,

    available() {
      return typeof window.Peer === 'function';
    },
    options() {
      try {
        const o = JSON.parse(localStorage.getItem('seis-mazos-peer') || 'null');
        if (o && typeof o === 'object') return o;
      } catch (e) {
        /* sin configuración propia */
      }
      return { debug: 0 };
    },
    send(p, msg) {
      const c = p.conn;
      if (!c || p.gone) return;
      try {
        c.send(msg);
      } catch (e) {
        /* conexión cerrada */
      }
    },
    sendHost(msg) {
      try {
        if (this.hostConn) this.hostConn.send(msg);
      } catch (e) {
        /* conexión cerrada */
      }
    },
    ask(p, kind, data) {
      return new Promise((resolve) => {
        if (!p.conn || p.gone) return resolve(null);
        const rid = ++this.reqSeq;
        this.reqs.set(rid, { resolve, pid: p.id });
        this.send(p, { t: 'ask', rid, kind, data });
      });
    },
    dropRequests(pid) {
      for (const [rid, r] of this.reqs)
        if (!pid || r.pid === pid) {
          this.reqs.delete(rid);
          r.resolve(null);
        }
    },
    broadcastView(m) {
      for (const p of players) if (!p.local && !p.gone) this.send(p, { t: 'view', m });
    },
  };

  function randomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    return s;
  }
  function myToken() {
    if (!state.token) {
      state.token = Math.floor(rng() * 1e12).toString(36) + Math.floor(rng() * 1e12).toString(36);
      save();
    }
    return state.token;
  }

  function peerErrorText(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return 'No hay ninguna mesa abierta con ese código. Revisa las letras.';
    if (type === 'network' || type === 'socket-error' || type === 'socket-closed' || type === 'server-error')
      return 'No hay conexión con el servidor de mesas. Revisa tu internet e inténtalo de nuevo.';
    if (type === 'browser-incompatible') return 'Este navegador no permite jugar en línea.';
    return 'No se pudo conectar' + (type ? ` (${type})` : '') + '. Inténtalo de nuevo.';
  }

  async function keepAwake() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') NET.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      /* el bloqueo de pantalla es opcional */
    }
  }

  function startHeartbeat() {
    clearInterval(NET.timer);
    NET.lastHeard = Date.now();
    NET.timer = setInterval(() => {
      const now = Date.now();
      if (NET.role === 'host') {
        for (const p of players)
          if (!p.local && !p.gone) {
            NET.send(p, { t: 'ping' });
            if (now - (p.lastHeard || now) > 45000) guestGone(p, `${p.name} dejó de responder.`);
          }
      } else if (NET.role === 'guest') {
        NET.sendHost({ t: 'ping' });
        if (now - NET.lastHeard > 45000) leaveOnline('Se perdió la conexión con la mesa.');
      }
    }, 4000);
  }

  function hostTable(mode) {
    if (!NET.available()) return;
    NET.mode = mode;
    NET.role = 'host';
    NET.status = 'Abriendo la mesa…';
    ME.session = emptySession();
    players = [ME];
    team.bank = 2 * START_BANK;
    renderOnline();
    const open = (attempt) => {
      const code = randomCode();
      const peer = new window.Peer(PEER_PREFIX + code, NET.options());
      NET.peer = peer;
      peer.on('open', () => {
        NET.code = code;
        NET.status = 'Mesa abierta. Dale el código a tu compañero.';
        renderOnline();
        renderControls();
        renderTable();
        keepAwake();
        startHeartbeat();
      });
      peer.on('connection', (conn) => onGuestConnection(conn));
      peer.on('disconnected', () => {
        if (NET.peer === peer && NET.role === 'host') {
          try {
            peer.reconnect();
          } catch (e) {
            /* se reintenta en el siguiente aviso */
          }
        }
      });
      peer.on('error', (err) => {
        if (NET.peer !== peer) return;
        if (err.type === 'unavailable-id' && attempt < 5) {
          peer.destroy();
          open(attempt + 1);
        } else if (err.type !== 'peer-unavailable' && !NET.code) leaveOnline(peerErrorText(err));
      });
    };
    open(0);
  }

  function onGuestConnection(conn) {
    conn.on('data', (msg) => onHostData(conn, msg));
    conn.on('close', () => {
      const p = players.find((x) => x.conn === conn);
      if (p) guestGone(p, `${p.name} salió de la mesa.`);
    });
    conn.on('error', () => {
      const p = players.find((x) => x.conn === conn);
      if (p) guestGone(p, `${p.name} perdió la conexión.`);
    });
  }

  function onHostData(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    let p = players.find((x) => x.conn === conn);
    if (p) p.lastHeard = Date.now();
    if (msg.t === 'hello') {
      if (msg.v !== PROTO) {
        conn.send({ t: 'reject', reason: 'Tu app y la del anfitrión tienen versiones distintas. Actualizad las dos.' });
        return setTimeout(() => conn.close(), 300);
      }
      p = players.find((x) => x.token && x.token === msg.token);
      if (!p) {
        if (humans().filter((x) => !x.local).length >= MAX_GUESTS) {
          conn.send({ t: 'reject', reason: 'La mesa está llena.' });
          return setTimeout(() => conn.close(), 300);
        }
        p = { id: 'p' + ++NET.guestSeq, local: false, token: msg.token, session: emptySession(), bank: START_BANK };
        players.push(p);
      }
      p.conn = conn;
      p.gone = false;
      p.lastHeard = Date.now();
      p.name = 'Jugador ' + p.id.slice(1);
      if (typeof msg.bank === 'number' && NET.mode === 'indiv' && !p.session.decisions) p.bank = msg.bank;
      NET.send(p, { t: 'welcome', id: p.id, mode: NET.mode, code: NET.code });
      if (T.betCollector) T.betCollector.request(p);
      else T.msgFor[p.id] = 'Entrarás en la próxima mano.';
      NET.status = `${p.name} se unió a la mesa.`;
      renderOnline();
      renderTable();
    } else if (msg.t === 'answer') {
      const r = NET.reqs.get(msg.rid);
      if (r && p && r.pid === p.id) {
        NET.reqs.delete(msg.rid);
        r.resolve(msg.value);
      }
    } else if (msg.t === 'ping') {
      if (p) NET.send(p, { t: 'pong' });
    } else if (msg.t === 'bye') {
      if (p) guestGone(p, `${p.name} salió de la mesa.`);
    }
  }

  function guestGone(p, text) {
    if (p.gone) return;
    p.gone = true;
    try {
      if (p.conn) p.conn.close();
    } catch (e) {
      /* ya cerrada */
    }
    p.conn = null;
    NET.dropRequests(p.id);
    NET.status = text;
    if (T.betCollector) T.betCollector.check();
    renderOnline();
    renderTable();
  }

  function joinTable(rawCode) {
    if (!NET.available()) return;
    const code = String(rawCode || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    if (code.length !== 4) {
      NET.status = 'El código tiene 4 letras.';
      return renderOnline();
    }
    if (!(T.pending && T.pending.kind === 'bet')) {
      NET.status = 'Termina la mano que estás jugando y vuelve a intentarlo.';
      return renderOnline();
    }
    NET.role = 'joining';
    NET.code = code;
    NET.status = `Conectando con la mesa ${code}…`;
    renderOnline();
    const peer = new window.Peer(NET.options());
    NET.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      NET.hostConn = conn;
      conn.on('open', () => conn.send({ t: 'hello', v: PROTO, bank: state.bankroll, token: myToken() }));
      conn.on('data', onGuestData);
      conn.on('close', () => {
        if (NET.hostConn === conn) leaveOnline(NET.role === 'guest' ? 'La mesa se cerró.' : 'No se pudo entrar en la mesa.');
      });
      conn.on('error', () => {
        if (NET.hostConn === conn) leaveOnline('Se perdió la conexión con la mesa.');
      });
    });
    peer.on('error', (err) => {
      if (NET.peer === peer) leaveOnline(peerErrorText(err));
    });
    clearTimeout(NET.joinTimer);
    NET.joinTimer = setTimeout(() => {
      if (NET.role === 'joining') leaveOnline('No respondió ninguna mesa con ese código. Comprueba que sigue abierta en el otro teléfono.');
    }, 20000);
  }

  function onGuestData(msg) {
    if (!msg || typeof msg !== 'object') return;
    NET.lastHeard = Date.now();
    if (msg.t === 'welcome') {
      clearTimeout(NET.joinTimer);
      NET.role = 'guest';
      NET.myId = msg.id;
      NET.mode = msg.mode;
      NET.status = '';
      T.loopGen++; // la partida local se detiene: ahora manda el anfitrión
      T.pending = null;
      T.veilHud = false;
      renderControls();
      showTab('mesa');
      renderOnline();
      keepAwake();
      startHeartbeat();
    } else if (msg.t === 'view') {
      NET.view = msg.m;
      const rules = JSON.stringify(msg.m.rules);
      if (rules !== NET.viewRules) {
        NET.viewRules = rules;
        renderAllRuleViews();
      }
      renderTable();
    } else if (msg.t === 'ask') {
      const rid = msg.rid;
      if (msg.kind === 'bet' && T.bet <= 0) T.bet = T.lastBet;
      if (msg.kind === 'quiz') T.veilHud = true;
      T.pending = {
        kind: msg.kind,
        data: msg.data || {},
        resolve: (v) => {
          T.pending = null;
          if (msg.kind === 'quiz') T.veilHud = false;
          renderControls();
          renderHud();
          NET.sendHost({ t: 'answer', rid, value: v });
        },
      };
      renderControls();
      renderHud();
    } else if (msg.t === 'fb') {
      showFeedback($('feedback'), msg.verdict, msg.title, msg.lines);
    } else if (msg.t === 'stat') {
      if (msg.d && msg.d.net && NET.mode === 'indiv') state.bankroll += msg.d.net;
      applyStat(msg.d || {}, msg.err);
      save();
    } else if (msg.t === 'reject') {
      leaveOnline(msg.reason || 'No se pudo entrar en la mesa.');
    } else if (msg.t === 'bye') {
      leaveOnline('Quien creó la mesa la cerró.');
    }
  }

  // Sale del modo en línea y vuelve a la mesa individual.
  function leaveOnline(reason) {
    const wasGuest = NET.role === 'guest' || NET.role === 'joining';
    clearInterval(NET.timer);
    clearTimeout(NET.joinTimer);
    if (NET.role === 'host') for (const p of players) if (!p.local && !p.gone) NET.send(p, { t: 'bye' });
    if (wasGuest) NET.sendHost({ t: 'bye' });
    const peer = NET.peer;
    NET.peer = null;
    NET.hostConn = null;
    setTimeout(() => {
      try {
        if (peer) peer.destroy();
      } catch (e) {
        /* ya cerrada */
      }
    }, 200);
    for (const p of players) if (!p.local) p.gone = true;
    NET.dropRequests();
    NET.role = 'solo';
    NET.mode = 'solo';
    NET.code = '';
    NET.view = null;
    NET.viewRules = '';
    NET.status = reason || '';
    try {
      if (NET.wakeLock) NET.wakeLock.release();
    } catch (e) {
      /* opcional */
    }
    NET.wakeLock = null;
    if (wasGuest) {
      T.pending = null;
      T.seats = [];
      T.dealer.cards = [];
      T.hidden.clear();
      T.needShuffle = true;
      T.paintedRound = -1;
      renderAllRuleViews();
      tableLoop();
    } else if (T.betCollector) T.betCollector.check();
    renderOnline();
    renderControls();
    renderTable();
    renderStats();
  }

  function renderOnline() {
    renderBotsPicker();
    const box = $('online');
    const locked = NET.role === 'guest';
    document.querySelectorAll('#rules-form input, #train-form input').forEach((i) => {
      const display = /^f-(showTags|showDecks|speed)-/.test(i.id);
      i.disabled = locked && !display;
    });
    $('rules-lock').hidden = !locked;
    if (locked) $('rules-lock').textContent = 'Estás en una mesa en línea: las reglas las elige quien la creó.';
    if (!NET.available()) {
      fill(
        box,
        h('p', { class: 'small muted' }, 'Para jugar con otra persona, cada uno en su teléfono, abre Seis Mazos desde la app instalada. Aquí dentro de Claude solo funciona el modo individual.'),
      );
      return;
    }
    const status = NET.status ? h('p', { class: 'net-status small' }, NET.status) : null;
    if (NET.role === 'solo') {
      const modeBox = h('div', { class: 'seg', id: 'net-mode', role: 'radiogroup', 'aria-label': 'Modo' });
      const code = h('input', {
        id: 'net-code',
        type: 'text',
        maxlength: '4',
        placeholder: 'ABCD',
        autocapitalize: 'characters',
        autocomplete: 'off',
        spellcheck: 'false',
        class: 'code-input',
      });
      const join = () => joinTable(code.value);
      code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') join();
      });
      fill(
        box,
        h('div', { class: 'field' }, 'Modo', modeBox),
        h('p', { class: 'small muted' }, NET.pickMode === 'coop' ? 'Coop: una banca común; ganáis y perdéis juntos.' : 'Individual: cada uno con su banca y su marcador.'),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => hostTable(NET.pickMode),
          },
          'Crear mesa',
        ),
        h('div', { class: 'or small muted' }, 'o únete a la de otra persona'),
        h('div', { class: 'join-row' }, code, h('button', { class: 'btn', type: 'button', onclick: join }, 'Unirme')),
        status,
      );
      seg('net-mode', 'net-mode', [['coop', 'Coop'], ['indiv', 'Individual']], NET.pickMode, (v) => {
        NET.pickMode = v;
        renderOnline();
      });
    } else if (NET.role === 'host') {
      const others = players.filter((p) => !p.local);
      fill(
        box,
        NET.code
          ? h(
              'div',
              { class: 'code-box' },
              h('span', { class: 'small muted' }, 'Código de la mesa'),
              h('b', { class: 'code' }, NET.code),
              h(
                'button',
                {
                  class: 'btn small ghost',
                  type: 'button',
                  onclick: (e) => {
                    const btn = e.currentTarget;
                    const done = () => (btn.textContent = 'Copiado');
                    if (navigator.clipboard) navigator.clipboard.writeText(NET.code).then(done, () => {});
                  },
                },
                'Copiar',
              ),
            )
          : null,
        h('p', { class: 'small' }, `Modo ${NET.mode === 'coop' ? 'coop (banca común)' : 'individual'}.`),
        h(
          'ul',
          { class: 'net-players' },
          h('li', null, 'Tú (creaste la mesa)'),
          others.length
            ? others.map((p) => h('li', { class: p.gone ? 'muted' : null }, `${p.name}${p.gone ? ' · desconectado' : ' · conectado'}`))
            : h('li', { class: 'muted' }, 'Esperando a que alguien se una…'),
        ),
        status,
        h('button', { class: 'btn small', type: 'button', onclick: () => leaveOnline('Cerraste la mesa.') }, 'Cerrar mesa'),
      );
    } else if (NET.role === 'joining') {
      fill(box, status, h('button', { class: 'btn small', type: 'button', onclick: () => leaveOnline('') }, 'Cancelar'));
    } else {
      fill(
        box,
        h('p', null, 'Conectado a la mesa ', h('b', { class: 'num' }, NET.code)),
        h('p', { class: 'small muted' }, NET.mode === 'coop' ? 'Modo coop: banca común.' : 'Modo individual: cada uno con su banca.'),
        status,
        h('button', { class: 'btn small', type: 'button', onclick: () => leaveOnline('Saliste de la mesa.') }, 'Salir de la mesa'),
      );
    }
  }

  /* ======================================================================
   * EJERCICIO: ESTRATEGIA BÁSICA
   * ==================================================================== */
  const SD = { filter: 'all', cur: null, answered: false, timer: null };

  function chartTable(rows, opts) {
    const hl = opts && opts.hl;
    const thead = h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col' }, opts && opts.corner ? opts.corner : ''),
        BJ.UPCARDS.map((u) => h('th', { scope: 'col', class: hl && hl.up === u ? 'hl-col' : null }, BJ.upLabel(u))),
      ),
    );
    const tbody = h(
      'tbody',
      null,
      rows.map((row) =>
        h(
          'tr',
          { class: hl && hl.key === row.key ? 'hl-row' : null },
          h('th', { scope: 'row' }, row.label),
          row.cells.map((c) =>
            h(
              'td',
              {
                class: `c-${c.code}${hl && hl.key === row.key && hl.up === c.up ? ' hl' : ''}${
                  opts && opts.marks && opts.marks.has(`${opts.kind}:${row.key}:${c.up}`) ? ' h17diff' : ''
                }`,
                title: CODE_TITLE[c.code],
              },
              CODE_LABEL[c.code],
              c.devs && c.devs.length
                ? h('span', { class: 'ix' }, c.devs.map((d) => (d.kind === 'sur' ? 'R' : '') + signed(d.index)).join(' '))
                : null,
            ),
          ),
        ),
      ),
    );
    return h('table', { class: 'chart' + (opts && opts.noIx ? ' no-ix' : '') }, thead, tbody);
  }

  const CODE_TITLE = {
    R: 'Rendirse',
    '': '',
    H: 'Pedir',
    S: 'Plantarse',
    D: 'Doblar (si no se puede, pedir)',
    Ds: 'Doblar (si no se puede, plantarse)',
    P: 'Separar',
    Rh: 'Rendirse (si no se puede, pedir)',
    Rs: 'Rendirse (si no se puede, plantarse)',
    Rp: 'Rendirse (si no se puede, separar)',
  };

  const CHART_TITLE = { pairs: 'Parejas', soft: 'Manos blandas', hard: 'Manos duras', surrender: 'Rendición tardía' };
  function chartFor(kind, r) {
    return { title: CHART_TITLE[kind], rows: BJ.strategyCharts(r)[kind] };
  }
  function chartKey(kind, row) {
    if (kind === 'hard') return row <= 8 ? 8 : row >= 17 ? 17 : row;
    return row;
  }

  function seg(boxId, name, options, value, onChange) {
    const box = $(boxId);
    box.replaceChildren(
      ...options.flatMap(([v, label], i) => {
        const id = `${name}-${i}`;
        const input = h('input', { type: 'radio', name, id, value: String(i), checked: v === value });
        input.addEventListener('change', () => onChange(v));
        return [input, h('label', { for: id }, label)];
      }),
    );
  }

  function sdErrorWeights() {
    const cells = drills.sd.cells;
    const out = {};
    let any = false;
    for (const k in cells)
      if (cells[k].wrong > 0) {
        out[k] = cells[k].wrong * 6;
        any = true;
      }
    return any ? out : null;
  }

  function sdNext() {
    clearTimeout(SD.timer);
    const focus = $('sd-focus').checked ? sdErrorWeights() : null;
    const sc = BJ.genStrategyScenario(SD.filter, rng, focus);
    const r = activeRules();
    const avail = {
      hit: true,
      stand: true,
      double: BJ.canDoubleTotal(sc.cards, r),
      split: BJ.isPair(sc.cards),
      surrender: r.surrender === 'late',
    };
    SD.cur = Object.assign({}, sc, { avail, upV: BJ.upValue(sc.upCard) });
    SD.answered = false;
    $('sd-up').replaceChildren(makeCardEl(sc.upCard));
    const handEls = sc.cards.map((c) => makeCardEl(c));
    $('sd-hand').replaceChildren(...handEls);
    handEls.forEach((el) => animateFrom(el, null));
    $('sd-total').textContent = totalText(sc.cards);
    $('sd-prompt').textContent = `${handLabel(sc.cards)} contra ${BJ.upLabel(SD.cur.upV)}. Primera decisión: ¿qué haces?`;
    $('sd-actions').replaceChildren(...actionButtons(avail, sdAnswer));
    showFeedback($('sd-fb'), 'info', 'Elige una jugada', [
      'Atajos: <b>H</b> pedir, <b>S</b> plantarse, <b>D</b> doblar, <b>P</b> separar, <b>R</b> rendirse. <b>Enter</b> pasa a la siguiente.',
    ]);
    $('sd-chart-title').textContent = 'Tabla';
    $('sd-chart').replaceChildren(h('p', { class: 'empty' }, 'La casilla de la tabla aparece al responder.'));
  }

  function sdAnswer(a) {
    if (SD.answered || !SD.cur) return;
    const c = SD.cur;
    const r = activeRules();
    const d = BJ.basicDecision(c.cards, c.upV, c.avail, r);
    const ok = a === d.action;
    SD.answered = true;
    const st = drills.sd;
    st.n++;
    if (ok) {
      st.ok++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
    } else st.streak = 0;
    const key = BJ.cellKey(c.cell);
    const cell = st.cells[key] || (st.cells[key] = { n: 0, wrong: 0 });
    cell.n++;
    if (!ok) cell.wrong++;
    else if (cell.wrong > 0) cell.wrong--;
    showFeedback(
      $('sd-fb'),
      ok ? 'ok' : 'bad',
      ok ? `${NAME[a]}: correcto` : `${NAME[a]} no: lo correcto es ${NAME[d.action]}`,
      [
        `<b>${handLabel(c.cards)}</b> contra <b>${BJ.upLabel(c.upV)}</b> → <b>${NAME[d.action]}</b>${codeNote(d.code, d.action)}`,
        ok && $('sd-auto').checked ? 'Siguiente en un momento…' : 'Pulsa <b>Enter</b> o el botón para la siguiente.',
      ],
    );
    // La casilla a resaltar: la rendición tiene su propio cuadro, como en Blackjack Apprenticeship.
    const pair = BJ.isPair(c.cards);
    const kind = d.action === 'R' ? 'surrender' : pair ? 'pairs' : d.kind;
    const ch = chartFor(kind, r);
    const total = BJ.handValue(c.cards).total;
    const row =
      kind === 'surrender' ? (d.code === 'Rp' ? 'p8' : total) : kind === 'pairs' ? (c.cards[0].v === 1 ? 11 : c.cards[0].v) : chartKey(kind, total);
    $('sd-chart-title').textContent = ch.title;
    $('sd-chart').replaceChildren(chartTable(ch.rows, { hl: { key: row, up: c.upV }, noIx: true }));
    const next = h('button', { class: 'btn primary', type: 'button', onclick: sdNext }, 'Siguiente', h('kbd', null, '↵'));
    $('sd-actions').append(next);
    next.focus({ preventScroll: true });
    renderSdStats();
    save();
    if (ok && $('sd-auto').checked) SD.timer = setTimeout(sdNext, 1100);
  }

  function renderSdStats() {
    const st = drills.sd;
    const weak = Object.entries(st.cells)
      .filter(([, v]) => v.wrong > 0)
      .sort((a, b) => b[1].wrong - a[1].wrong)
      .slice(0, 5)
      .map(([k]) => {
        const [kind, row, up] = k.split(':');
        const lbl =
          kind === 'pair'
            ? `${row === '11' ? 'A' : row},${row === '11' ? 'A' : row}`
            : `${kind === 'soft' ? 'blando' : 'duro'} ${row}`;
        return `${lbl} vs ${BJ.upLabel(Number(up))}`;
      });
    $('sd-stats').replaceChildren(
      h('dt', null, 'Aciertos'),
      h('dd', null, `${st.ok}/${st.n} · ${pct(st.ok, st.n)}`),
      h('dt', null, 'Racha'),
      h('dd', null, String(st.streak)),
      h('dt', null, 'Mejor racha'),
      h('dd', null, String(st.best)),
      h('dt', null, 'Para repasar'),
      h('dd', null, weak.length ? weak.join(' · ') : '—'),
    );
  }

  /* ======================================================================
   * EJERCICIO: DESVIACIONES
   * ==================================================================== */
  const DV = { mode: 'play', show: 'tc', set: 'all', cur: null, answered: false };

  function dvList() {
    const list = BJ.deviationList(activeRules());
    return DV.set === 'all' ? list : list.filter((d) => d.group === DV.set);
  }

  function devQuestion(d) {
    const up = BJ.upLabel(d.up);
    if (d.kind === 'ins') return '¿Desde qué true count tomas seguro?';
    if (d.kind === 'pair') return `¿Desde qué true count separas 10,10 contra ${up}?`;
    if (d.kind === 'sur') return `¿Desde qué true count te rindes con ${d.total} contra ${up}?`;
    if (d.above === 'D') return `¿Desde qué true count doblas ${d.total} contra ${up}?`;
    return `¿Desde qué true count te plantas con ${d.total} contra ${up}?`;
  }

  function dvNext() {
    const list = dvList();
    if (!list.length) {
      showFeedback($('dv-fb'), 'info', 'No hay desviaciones en este grupo con tus reglas', [
        'Las Fab 4 son rendiciones: activa la rendición en Reglas.',
      ]);
      $('dv-actions').replaceChildren();
      return;
    }
    const r = activeRules();
    const sc = BJ.genDeviationScenario(r, rng, { dev: list[Math.floor(rng() * list.length)] });
    let tc = sc.tc;
    let tcText = `TC ${signed(tc)}`;
    if (DV.show === 'rc') {
      const opts = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5].filter((x) => x < r.decks);
      const decks = opts[Math.floor(rng() * opts.length)];
      const rc = Math.round(sc.tc * decks);
      tc = rc / decks;
      tcText = `RC ${signed(rc)} · quedan ${String(decks).replace('.', ',')} mazos`;
    }
    const cards = sc.cards;
    const avail = {
      hit: true,
      stand: true,
      double: cards.length === 2 && BJ.canDoubleTotal(cards, r),
      split: BJ.isPair(cards),
      surrender: r.surrender === 'late' && cards.length === 2,
    };
    DV.cur = { dev: sc.dev, cards, upCard: sc.upCard, upV: BJ.upValue(sc.upCard), tc, avail };
    DV.answered = false;
    $('dv-up').replaceChildren(makeCardEl(sc.upCard));
    $('dv-hand').replaceChildren(...cards.map((c) => makeCardEl(c)));
    $('dv-total').textContent = totalText(cards);
    const box = $('dv-actions');
    if (DV.mode === 'index') {
      $('dv-tc').textContent = BJ.deviationName(sc.dev);
      $('dv-prompt').textContent = devQuestion(sc.dev);
      const st = stepper('dv-index', 0, 1);
      box.replaceChildren(
        h(
          'form',
          {
            class: 'quiz',
            onsubmit: (e) => {
              e.preventDefault();
              dvAnswer(Math.round(Number(st.input.value) || 0));
            },
          },
          h('label', { class: 'field' }, 'Índice', st.root),
          h('button', { class: 'btn primary', type: 'submit' }, 'Comprobar', h('kbd', null, '↵')),
        ),
      );
      setTimeout(() => st.input.focus(), 0);
    } else {
      $('dv-tc').textContent = tcText;
      if (sc.dev.kind === 'ins') {
        $('dv-prompt').textContent = 'El crupier muestra un As. ¿Tomas seguro?';
        box.replaceChildren(
          h('button', { class: 'btn', type: 'button', onclick: () => dvAnswer('I') }, 'Tomar seguro', h('kbd', null, 'S')),
          h('button', { class: 'btn', type: 'button', onclick: () => dvAnswer('N') }, 'No', h('kbd', null, 'N')),
        );
      } else {
        $('dv-prompt').textContent =
          cards.length > 2 ? 'Mano de tres cartas (ya no puedes rendirte ni doblar). ¿Qué haces?' : '¿Qué haces?';
        box.replaceChildren(...actionButtons(avail, dvAnswer));
      }
    }
    showFeedback($('dv-fb'), 'info', DV.mode === 'index' ? 'Escribe el índice' : 'Decide con el true count', [
      DV.show === 'rc' && DV.mode === 'play' ? 'Primero convierte: TC = RC ÷ mazos restantes.' : 'Las desviaciones se aplican con TC igual o mayor que el índice.',
    ]);
  }

  function dvAnswer(a) {
    if (DV.answered || !DV.cur) return;
    const c = DV.cur;
    const d = c.dev;
    const r = activeRules();
    let ok;
    let title;
    let lines;
    if (DV.mode === 'index') {
      ok = a === d.index;
      title = ok ? `Índice ${signed(d.index)}: correcto` : `El índice es ${signed(d.index)} (dijiste ${signed(a)})`;
      lines = [devRuleText(d)];
    } else {
      let right;
      let g = null;
      if (d.kind === 'ins') right = c.tc >= 3 ? 'I' : 'N';
      else {
        g = BJ.decide(c.cards, c.upV, c.avail, r, c.tc, true);
        right = g.action;
      }
      ok = a === right;
      title = ok ? `${NAME[a]}: correcto` : `${NAME[a]} no: lo correcto es ${NAME[right]}`;
      lines = g
        ? explainDecision(Object.assign(g, { borderline: false }), c.cards, c.upV, c.tc)
        : [`Seguro con TC ≥ +3. TC ${signed(c.tc, 1)} → <b>${right === 'I' ? 'tomarlo' : 'no tomarlo'}</b>.`];
      if (DV.show === 'rc') lines.unshift(`TC = ${$('dv-tc').textContent.replace(' · quedan ', ' ÷ ')} = <b>${signed(c.tc, 2)}</b>`);
    }
    DV.answered = true;
    const st = drills.dv;
    st.n++;
    if (ok) {
      st.ok++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
    } else st.streak = 0;
    const per = st.per[d.id] || (st.per[d.id] = { n: 0, ok: 0 });
    per.n++;
    if (ok) per.ok++;
    showFeedback($('dv-fb'), ok ? 'ok' : 'bad', title, lines);
    const next = h('button', { class: 'btn primary', type: 'button', onclick: dvNext }, 'Siguiente', h('kbd', null, '↵'));
    $('dv-actions').append(next);
    next.focus({ preventScroll: true });
    renderDvSide();
    save();
  }

  function devRuleText(d) {
    const idx = signed(d.index);
    if (d.kind === 'ins') return `Tomar seguro con TC ≥ ${idx}.`;
    if (d.kind === 'sur') return `Rendirse con ${d.total} contra ${BJ.upLabel(d.up)} si TC ≥ ${idx}.`;
    return `${BJ.deviationName(d)}: <b>${NAME[d.above]}</b> con TC ≥ ${idx}; por debajo, ${NAME[d.below].toLowerCase()}.`;
  }

  function devTable(list, withStats) {
    const r = activeRules();
    return h(
      'table',
      { class: 'list' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'Situación'),
          h('th', null, 'Índice'),
          h('th', null, 'Desde el índice'),
          h('th', null, 'Por debajo'),
          withStats ? h('th', null, 'Tus aciertos') : h('th', null, 'Grupo'),
        ),
      ),
      h(
        'tbody',
        null,
        list.map((d) => {
          const per = drills.dv.per[d.id];
          const basic = BJ.deviationBasicAction(d, r);
          const below = d.kind === 'sur' ? (basic === 'R' ? 'Pedir' : NAME[basic]) : d.kind === 'ins' ? 'No' : NAME[d.below];
          const above = d.kind === 'ins' ? 'Seguro' : NAME[d.above];
          return h(
            'tr',
            null,
            h('td', null, BJ.deviationName(d)),
            h('td', { class: 'num' }, signed(d.index)),
            h('td', null, above),
            h('td', null, below),
            withStats ? h('td', { class: 'num' }, per ? `${per.ok}/${per.n}` : '—') : h('td', null, d.group === 'Fab4' ? 'Fab 4' : 'I18'),
          );
        }),
      ),
    );
  }

  function renderDvSide() {
    const st = drills.dv;
    $('dv-stats').replaceChildren(
      h('dt', null, 'Aciertos'),
      h('dd', null, `${st.ok}/${st.n} · ${pct(st.ok, st.n)}`),
      h('dt', null, 'Racha'),
      h('dd', null, String(st.streak)),
      h('dt', null, 'Mejor racha'),
      h('dd', null, String(st.best)),
    );
    $('dv-list').replaceChildren(devTable(BJ.deviationList(activeRules()), true));
  }

  /* ======================================================================
   * EJERCICIO: CONTEO
   * ==================================================================== */
  const CD = { mode: 'run', n: 52, group: 1, speed: 0.8, seq: null, i: 0, timer: null, start: 0, phase: 'idle', tc: null };

  function cdSetup() {
    clearTimeout(CD.timer);
    CD.phase = 'idle';
    $('cd-flash').replaceChildren();
    $('cd-progress').style.width = '0';
    $('cd-opts').hidden = CD.mode === 'tc';
    $('cd-n').hidden = CD.mode !== 'run';
    const box = $('cd-actions');
    if (CD.mode === 'tc') return cdTcNext();
    $('cd-prompt').textContent =
      CD.mode === 'run'
        ? `Cuenta ${CD.n === 104 ? 'dos mazos' : CD.n === 52 ? 'un mazo' : `${CD.n} cartas`} y escribe el running count al final.`
        : 'Se reparte un mazo al que le falta una carta. Al final, deduce si la que falta es baja, neutra o alta.';
    box.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: cdStart }, 'Empezar', h('kbd', null, 'Espacio')));
    showFeedback($('cd-fb'), 'info', 'Listo cuando quieras', [
      `Ritmo: ${CD.speed.toFixed(2)} s por ${CD.group === 1 ? 'carta' : `grupo de ${CD.group}`}. Con varias cartas a la vez, aprende a cancelar parejas (+1 y −1).`,
    ]);
  }

  function cdStart() {
    let cards = BJ.shuffleInPlace(BJ.freshDecks(CD.mode === 'run' && CD.n === 104 ? 2 : 1), rng);
    if (CD.mode === 'run') cards = cards.slice(0, CD.n);
    else CD.missing = cards.pop();
    CD.seq = cards;
    CD.i = 0;
    CD.phase = 'running';
    CD.start = performance.now();
    $('cd-prompt').textContent = 'Cuenta…';
    $('cd-actions').replaceChildren(h('button', { class: 'btn', type: 'button', onclick: cdStop }, 'Parar', h('kbd', null, 'Espacio')));
    showFeedback($('cd-fb'), 'info', 'Contando', []);
    cdTick();
  }

  function cdTick() {
    if (CD.phase !== 'running') return;
    if (CD.i >= CD.seq.length) return cdAsk();
    const group = CD.seq.slice(CD.i, CD.i + CD.group);
    CD.i += group.length;
    const els = group.map((c) => makeCardEl(c));
    $('cd-flash').replaceChildren(...els);
    if (CD.speed >= 0.35) els.forEach((el) => animateFrom(el, null));
    $('cd-progress').style.width = (CD.i / CD.seq.length) * 100 + '%';
    CD.timer = setTimeout(cdTick, CD.speed * 1000);
  }

  function cdStop() {
    clearTimeout(CD.timer);
    cdSetup();
  }

  function cdAsk() {
    CD.phase = 'answer';
    CD.elapsed = (performance.now() - CD.start) / 1000;
    $('cd-flash').replaceChildren();
    const box = $('cd-actions');
    if (CD.mode === 'run') {
      $('cd-prompt').textContent = '¿Cuál es el running count?';
      const st = stepper('cd-rc', 0, 1);
      box.replaceChildren(
        h(
          'form',
          {
            class: 'quiz',
            onsubmit: (e) => {
              e.preventDefault();
              cdCheck(Math.round(Number(st.input.value) || 0));
            },
          },
          h('label', { class: 'field' }, 'Running count', st.root),
          h('button', { class: 'btn primary', type: 'submit' }, 'Comprobar', h('kbd', null, '↵')),
        ),
      );
      setTimeout(() => st.input.focus(), 0);
    } else {
      $('cd-prompt').textContent = 'Un mazo completo suma 0. ¿Cómo es la carta que falta?';
      box.replaceChildren(
        h('button', { class: 'btn', type: 'button', onclick: () => cdCheck(1) }, 'Baja (2–6)'),
        h('button', { class: 'btn', type: 'button', onclick: () => cdCheck(0) }, 'Neutra (7–9)'),
        h('button', { class: 'btn', type: 'button', onclick: () => cdCheck(-1) }, 'Alta (10–A)'),
      );
    }
  }

  function cdCheck(ans) {
    if (CD.phase !== 'answer') return;
    CD.phase = 'done';
    let ok;
    let lines;
    let label;
    if (CD.mode === 'run') {
      const rc = CD.seq.reduce((a, c) => a + BJ.hiLo(c), 0);
      ok = ans === rc;
      label = `${CD.seq.length} cartas`;
      lines = [`Running count correcto: <b>${signed(rc)}</b>${ok ? '' : ` (dijiste ${signed(ans)})`}.`];
    } else {
      const t = BJ.hiLo(CD.missing);
      ok = ans === t;
      label = 'Carta que falta';
      lines = [`Faltaba ${cardName(CD.missing)} (valor ${signed(t)}): el mazo terminaba en ${signed(-t)}.`];
    }
    lines.push(`Tiempo: ${CD.elapsed.toFixed(1)} s (${(CD.elapsed / (CD.seq.length / 52)).toFixed(1)} s por mazo).`);
    showFeedback($('cd-fb'), ok ? 'ok' : 'bad', ok ? 'Correcto' : 'Incorrecto', lines);
    drills.cd.history.unshift({ label, ok, t: Number(CD.elapsed.toFixed(1)), speed: CD.speed, group: CD.group });
    drills.cd.history.length = Math.min(drills.cd.history.length, 20);
    renderCdHistory();
    save();
    $('cd-prompt').textContent = ok ? 'Bien.' : 'Repite a este ritmo hasta acertar tres veces seguidas.';
    $('cd-actions').replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: cdStart }, 'Otra vez', h('kbd', null, 'Espacio')));
  }

  function cdTcNext() {
    const decks = activeRules().decks;
    const steps = [];
    for (let x = 0.5; x <= decks - 0.5; x += 0.5) steps.push(x);
    const remaining = steps[Math.floor(rng() * steps.length)];
    let rc = 0;
    while (rc === 0) rc = Math.round((rng() * 2 - 0.8) * 14);
    CD.tc = { rc, remaining, decks };
    CD.phase = 'tc';
    const box = h('div', { class: 'tray-box' });
    const stack = h('div', { class: 'tray-stack' });
    stack.style.height = `calc(${((decks - remaining) / decks) * 100}% - 3px)`;
    box.appendChild(stack);
    for (let k = 1; k <= decks; k++) {
      const t = h('span', { class: 'tray-tick' });
      t.style.bottom = (k / decks) * 100 + '%';
      const lab = h('span', { class: 'tick-label' }, String(k));
      lab.style.bottom = (k / decks) * 100 + '%';
      lab.style.transform = 'translateY(50%)';
      box.append(t, lab);
    }
    $('cd-flash').replaceChildren(
      h(
        'div',
        { class: 'big-tray' },
        h('div', { class: 'tray' }, box, h('span', null, 'Descartes')),
        h('div', { class: 'tc-badge num' }, `RC ${signed(rc)}`),
      ),
    );
    $('cd-prompt').textContent = `Zapato de ${decks} mazos. Mira la bandeja, estima los mazos que quedan y calcula el true count.`;
    const st = stepper('cd-tc', 0, 0.5);
    $('cd-actions').replaceChildren(
      h(
        'form',
        {
          class: 'quiz',
          onsubmit: (e) => {
            e.preventDefault();
            cdTcCheck(Number(st.input.value) || 0);
          },
        },
        h('label', { class: 'field' }, 'True count', st.root),
        h('button', { class: 'btn primary', type: 'submit' }, 'Comprobar', h('kbd', null, '↵')),
      ),
    );
    showFeedback($('cd-fb'), 'info', 'TC = RC ÷ mazos restantes', [
      'Mazos restantes = mazos del zapato − mazos en la bandeja. Basta con aproximar al medio mazo.',
    ]);
    setTimeout(() => st.input.focus(), 0);
  }

  function cdTcCheck(ans) {
    if (CD.phase !== 'tc') return;
    CD.phase = 'done';
    const { rc, remaining } = CD.tc;
    const tc = rc / remaining;
    const ok = Math.abs(ans - tc) <= 0.5;
    showFeedback($('cd-fb'), ok ? 'ok' : 'bad', ok ? 'Correcto' : 'Incorrecto', [
      `Quedaban <b>${String(remaining).replace('.', ',')}</b> mazos: ${signed(rc)} ÷ ${String(remaining).replace('.', ',')} = <b>${signed(tc, 2)}</b>${ok ? '' : ` (dijiste ${signed(ans, 1)})`}.`,
      'Se acepta un margen de ±0,5.',
    ]);
    drills.cd.history.unshift({ label: 'True count', ok, t: null });
    drills.cd.history.length = Math.min(drills.cd.history.length, 20);
    renderCdHistory();
    save();
    const next = h('button', { class: 'btn primary', type: 'button', onclick: cdTcNext }, 'Otro', h('kbd', null, '↵'));
    $('cd-actions').replaceChildren(next);
    next.focus({ preventScroll: true });
  }

  function renderCdHistory() {
    const hs = drills.cd.history;
    $('cd-history').replaceChildren(
      ...(hs.length
        ? hs.map((x) =>
            h(
              'li',
              null,
              h('span', null, `${x.ok ? '✓' : '✗'} ${x.label}`),
              h('span', null, x.t != null ? `${x.t} s` : ''),
              x.speed ? h('span', { class: 'muted' }, `${x.speed.toFixed(2)} s · ${x.group} a la vez`) : null,
            ),
          )
        : [h('li', { class: 'empty' }, 'Aún no hay intentos.')]),
    );
  }

  /* ======================================================================
   * TABLAS
   * ==================================================================== */
  function renderTablas() {
    const r = activeRules();
    $('tb-rules').textContent = rulesSummary(r);
    const charts = BJ.strategyCharts(r);
    const noIx = !$('tb-ix').checked;
    const legendItems = [
      ['H', 'Pedir'],
      ['S', 'Plantarse'],
      ['D', 'Doblar; si no se puede, pedir'],
      ['Ds', 'Doblar; si no se puede, plantarse'],
      ['P', 'Separar'],
    ];
    if (r.surrender === 'late') legendItems.push(['R', 'Rendirse (cuadro de rendición)']);
    fill(
      $('tb-legend'),
      ...legendItems.map(([c, t]) => h('span', null, h('i', { class: 'c-' + c, style: `background:var(--a-${actionVar(c)})` }, CODE_LABEL[c]), t)),
      noIx ? null : h('span', null, h('i', { style: 'background:var(--panel-2);color:var(--ink)' }, '+4'), 'índice de desviación (R = rendirse)'),
    );
    // Casillas que cambian según el crupier pida o se plante con 17 blando.
    const other = BJ.strategyCharts(Object.assign({}, r, { h17: !r.h17 }));
    const marks = new Set();
    const changes = [];
    const KINDS = ['pairs', 'soft', 'hard', 'surrender'];
    const word = (code) => (code ? CODE_TITLE[code].split(' (')[0] : 'no rendirse');
    for (const kind of KINDS) {
      const keys = new Set([...charts[kind], ...other[kind]].map((row) => row.key));
      for (const key of keys) {
        const mine = charts[kind].find((row) => row.key === key);
        const alt = other[kind].find((row) => row.key === key);
        for (const up of BJ.UPCARDS) {
          const a = mine ? mine.cells.find((c) => c.up === up).code : '';
          const b = alt ? alt.cells.find((c) => c.up === up).code : '';
          if (a === b) continue;
          if (mine) marks.add(`${kind}:${key}:${up}`);
          const label = (mine || alt).label;
          const s17 = r.h17 ? b : a;
          const h17 = r.h17 ? a : b;
          changes.push(`${kind === 'surrender' ? 'Rendición ' : ''}${label} vs ${BJ.upLabel(up)}: ${word(s17)} → ${word(h17)}`);
        }
      }
    }
    $('tb-h17').textContent = r.h17
      ? `El crupier pide con 17 blando (H17). Las casillas marcadas cambian respecto a S17: ${changes.join(' · ')}.`
      : `El crupier se planta con 17 blando (S17). Las casillas marcadas cambiarían con H17: ${changes.join(' · ')}.`;
    const block = (kind, corner) =>
      h(
        'div',
        { class: 'panel' },
        h('h3', null, CHART_TITLE[kind]),
        h('div', { class: 'chart-wrap' }, chartTable(charts[kind], { noIx, corner, marks, kind })),
      );
    fill(
      $('tb-charts'),
      block('pairs', 'Pareja'),
      block('soft', 'Mano'),
      block('hard', 'Total'),
      charts.surrender.length
        ? h(
            'div',
            { class: 'panel' },
            h('h3', null, CHART_TITLE.surrender),
            h('div', { class: 'chart-wrap' }, chartTable(charts.surrender, { noIx, corner: 'Total', marks, kind: 'surrender' })),
            h('p', { class: 'small muted' }, 'Solo con las dos primeras cartas. Si no se puede rendir, se juega lo que dicen las otras tablas.'),
          )
        : null,
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Seguro y pago igual'),
        h('p', null, h('b', null, 'No tomarlos.'), settings.training.useDeviations ? ' Si cuentas cartas: tómalos solo con true count +3 o más.' : ''),
      ),
    );
    $('tb-devs').replaceChildren(devTable(BJ.deviationList(r), false));
    renderGuide();
  }
  function actionVar(code) {
    if (code === 'H') return 'h';
    if (code === 'S') return 's';
    if (code === 'D' || code === 'Ds') return 'd';
    if (code === 'P') return 'p';
    return 'r';
  }

  function renderGuide() {
    const r = activeRules();
    const edge = BJ.houseEdge(r);
    const breakEven = edge / 0.5;
    const unit = settings.training.unit;
    const sections = [
      [
        'Conteo Hi-Lo',
        [
          'Cartas bajas (2 a 6) suman +1, las neutras (7, 8, 9) no cuentan y las altas (10, figuras y As) restan 1. Empiezas en 0 cada vez que se baraja y sumas todas las cartas que ves: las tuyas, las de los demás y las del crupier, incluida la oculta cuando la descubre.',
          'Un running count positivo significa que quedan más cartas altas de lo normal: más blackjacks, más dobles ganados y un crupier que se pasa más.',
        ],
      ],
      [
        'Del running al true count',
        [
          'True count = running count ÷ mazos que quedan. Los mazos restantes se estiman mirando la bandeja de descartes: mazos del zapato menos mazos descartados, al medio mazo.',
          'Ejemplo: RC +9 con 3 mazos por jugar da TC +3. El mismo +9 con 6 mazos por jugar es solo +1,5.',
        ],
      ],
      [
        'Cuándo desviarse',
        [
          'Cada desviación tiene un índice. Con TC igual o mayor que el índice haces la jugada alternativa; por debajo, la básica. Con índices negativos funciona igual: 13 contra 2 tiene índice −1, así que te plantas con TC −1 o más y pides con −2 o menos.',
          'Las más valiosas son el seguro (+3), 16 contra 10 (0) y 15 contra 10 (+4). Apréndelas en ese orden.',
        ],
      ],
      [
        'Cuánto apostar',
        [
          `Cada punto de true count vale aproximadamente un 0,5 % de ventaja. Con tus reglas la casa parte de ≈${edge.toFixed(2).replace('.', ',')} %, así que la ventaja pasa al jugador hacia TC ${signed(breakEven, 1).replace('.', ',')}.`,
          `Rampa usada aquí: (TC − 1) unidades, con un mínimo de 1 y un máximo de ${settings.training.maxSpread}. Con unidad de ${money(unit)}: TC +3 → ${money(2 * unit)}, TC +5 → ${money(4 * unit)}.`,
        ],
      ],
      [
        'Cómo practicar',
        [
          '1. Estrategia: repite hasta superar el 98 % sin pensar. 2. Conteo: un mazo en menos de 25 segundos sin fallar, luego en grupos de dos. 3. Convierte a true count mirando la bandeja. 4. Desviaciones: primero el índice, luego la jugada. 5. Mesa: todo junto, con el conteo oculto y controles cada 5 manos.',
        ],
      ],
    ];
    $('tb-guide').replaceChildren(
      ...sections.map(([title, ps]) => h('div', { class: 'panel' }, h('h3', null, title), ps.map((p) => h('p', null, p)))),
    );
  }

  /* ======================================================================
   * REGLAS
   * ==================================================================== */
  const RULE_FIELDS = [
    { key: 'decks', label: 'Mazos en el zapato', hint: 'La estrategia de la app es la de 4 a 8 mazos.', options: [[4, '4'], [6, '6'], [8, '8']] },
    { key: 'h17', label: 'Soft 17 (17 blando)', hint: 'Qué hace el crupier con A,6.', options: [[false, 'Se planta (S17)'], [true, 'Pide (H17)']] },
    { key: 'das', label: 'Doblar después de separar', hint: 'DAS', options: [[true, 'Sí'], [false, 'No']] },
    { key: 'maxHands', label: 'Separar hasta', hint: 'Manos máximas al volver a separar.', options: [[2, '2 manos'], [3, '3'], [4, '4']] },
    { key: 'resplitAces', label: 'Volver a separar ases', hint: 'RSA', options: [[false, 'No'], [true, 'Sí']] },
    { key: 'hitSplitAces', label: 'Pedir con ases separados', hint: 'Lo normal es una sola carta por as.', options: [[false, 'No'], [true, 'Sí']] },
    { key: 'doubleOn', label: 'Doblar con', options: [['any', 'Dos cartas cualesquiera'], ['9-11', '9, 10, 11'], ['10-11', '10 y 11']] },
    { key: 'surrender', label: 'Rendición', hint: 'Tardía: después de que el crupier revisa si tiene blackjack.', options: [['late', 'Tardía'], ['none', 'No']] },
    {
      key: 'h17ExtraSurrender',
      label: 'Con H17, rendirse también con 15 y 17 vs A y 8,8 vs A',
      hint: 'La tabla de Blackjack Apprenticeship no las incluye. Según Wizard of Odds son un poco mejores.',
      options: [[false, 'No'], [true, 'Sí']],
    },
    { key: 'bjPays', label: 'Blackjack paga', options: [[1.5, '3 a 2'], [1.2, '6 a 5']] },
    {
      key: 'penetration',
      label: 'Carta de corte',
      hint: 'Porcentaje del zapato que se reparte antes de barajar.',
      options: [[0.6, '60%'], [0.67, '67%'], [0.75, '75%'], [0.8, '80%'], [0.85, '85%']],
    },
  ];
  const TRAIN_FIELDS = [
    {
      key: 'useDeviations',
      label: 'Corregir con',
      hint: 'Con desviaciones, la jugada correcta depende del true count.',
      options: [[true, 'Básica + desviaciones'], [false, 'Solo básica']],
    },
    { key: 'onMistake', label: 'Si te equivocas', options: [['retry', 'Corriges antes de seguir'], ['continue', 'Se juega igual']] },
    {
      key: 'quiz',
      label: 'Preguntar el conteo',
      options: [['never', 'Nunca'], ['round', 'Cada mano'], ['every5', 'Cada 5 manos'], ['random', 'Al azar'], ['shoe', 'Al final del zapato']],
    },
    { key: 'quizTC', label: 'Preguntar también el true count', options: [[true, 'Sí'], [false, 'No']] },
    { key: 'showTags', label: 'Valor Hi-Lo bajo cada carta', hint: 'Ayuda para empezar.', options: [[false, 'Oculto'], [true, 'Visible']] },
    {
      key: 'showDecks',
      label: 'Mazos restantes en números',
      hint: 'Si está oculto, estímalos con la bandeja de descartes.',
      options: [[false, 'No'], [true, 'Sí']],
    },
    { key: 'gradeBets', label: 'Evaluar la apuesta', hint: 'Según la rampa (TC − 1) unidades.', options: [[true, 'Sí'], [false, 'No']] },
    { key: 'unit', label: 'Unidad de apuesta', options: [[10, '$10'], [25, '$25'], [50, '$50'], [100, '$100']] },
    { key: 'maxSpread', label: 'Apuesta máxima', options: [[8, '8 u'], [12, '12 u'], [16, '16 u']] },
    { key: 'bots', label: 'Otros jugadores', hint: 'Juegan estrategia básica; sus cartas también se cuentan.', options: [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']] },
    {
      key: 'seat',
      label: 'Tu asiento',
      hint: 'En tercera base ves más cartas antes de decidir.',
      options: [['first', 'Primera base'], ['middle', 'Centro'], ['third', 'Tercera base']],
    },
    { key: 'speed', label: 'Velocidad de reparto', options: [['slow', 'Lenta'], ['normal', 'Normal'], ['fast', 'Rápida'], ['instant', 'Sin animación']] },
  ];

  // Selector rápido de robots bajo la mesa (el mismo ajuste que "Otros jugadores" en Reglas).
  function renderBotsPicker() {
    const guest = NET.role === 'guest';
    $('table-opts').hidden = guest;
    if (guest) return;
    seg('bots-seg', 'bots-seg', [[0, 'Ninguno'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], settings.training.bots, (v) => {
      settings.training.bots = v;
      seg(`f-bots`, `f-bots`, TRAIN_FIELDS.find((f) => f.key === 'bots').options, v, (x) => {
        settings.training.bots = x;
        onTrainChange('bots');
      });
      onTrainChange('bots');
    });
    const applied = T.seats.filter((st) => !st.pid).length === Math.max(0, Math.min(settings.training.bots, 7 - T.seats.filter((st) => st.pid).length));
    $('bots-note').textContent = applied ? 'Juegan estrategia básica; sus cartas también cuentan.' : 'Se aplica en la próxima mano.';
  }

  function buildForm(boxId, fields, target, onChange) {
    const box = $(boxId);
    box.replaceChildren(
      ...fields.map((f) => {
        const segBox = h('div', { class: 'seg', id: `f-${f.key}`, role: 'radiogroup', 'aria-label': f.label });
        const row = h(
          'div',
          { class: 'setting' },
          h('div', null, h('span', null, f.label), f.hint ? h('span', { class: 'hint' }, f.hint) : null),
          segBox,
        );
        return row;
      }),
    );
    for (const f of fields)
      seg(`f-${f.key}`, `f-${f.key}`, f.options, target[f.key], (v) => {
        target[f.key] = v;
        onChange(f.key, v);
      });
  }

  function renderEdge() {
    const r = activeRules();
    const e = BJ.houseEdge(r);
    $('edge-val').textContent = e.toFixed(2).replace('.', ',') + ' %';
    $('edge-note').textContent = 'aproximada, con estrategia básica perfecta';
    $('edge-text').textContent = `El jugador pasa a tener ventaja hacia TC ${signed(e / 0.5, 1).replace('.', ',')}. ${
      r.bjPays === 1.2 ? 'Con blackjack 6 a 5 contar casi no compensa: busca mesas 3 a 2.' : 'Cada punto de true count suma ≈0,5 %.'
    }`;
  }

  function onRuleChange(key) {
    if (key === 'decks' || key === 'penetration') {
      T.needShuffle = true;
      if (T.betCollector) {
        clearTable();
        shuffleShoe();
        setupSeats(null);
        T.betMsg = `Zapato nuevo de ${T.shoe.decks} mazos barajado: el conteo empieza en 0. Haz tu apuesta.`;
        T.betCollector.check();
      } else setMsg('Se barajará un zapato nuevo antes de la próxima mano.');
    }
    renderAllRuleViews();
    save();
  }

  function onTrainChange(key) {
    if (key === 'speed') applySpeed();
    if (key === 'bots') setTimeout(renderBotsPicker, 0);
    if ((key === 'bots' || key === 'seat') && T.betCollector && tableCardCount() === 0) {
      setupSeats(null);
      renderTable();
    }
    renderPrint();
    renderTable();
    renderControls();
    if (key === 'unit' || key === 'maxSpread') renderGuide();
    save();
  }

  function renderAllRuleViews() {
    renderPrint();
    renderEdge();
    renderTablas();
    renderDvSide();
    renderHud();
  }

  function twoStep(btn, label, action) {
    let armed = false;
    let timer = null;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = '¿Seguro? Pulsa otra vez';
        timer = setTimeout(() => {
          armed = false;
          btn.textContent = label;
        }, 3000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      btn.textContent = label;
      action();
    });
  }

  /* ======================================================================
   * NAVEGACIÓN, TECLADO E INICIO
   * ==================================================================== */
  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== 'view-' + tab));
    if (tab === 'estrategia' && !SD.cur) sdNext();
    if (tab === 'desviaciones' && !DV.cur) dvNext();
    if (tab === 'conteo' && CD.phase === 'idle') cdSetup();
    if (tab !== 'conteo' && CD.phase === 'running') cdStop();
    save();
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (inInput && k !== 'Enter') return;
    if (e.target && e.target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
    const tab = state.tab;
    if (tab === 'mesa') {
      const p = T.pending;
      if (!p) return;
      if (p.kind === 'action') {
        if (k === '?') return p.resolve('hint');
        if (AVAIL_KEY[k] && p.data.avail[AVAIL_KEY[k]]) {
          e.preventDefault();
          p.resolve(k);
        }
      } else if (p.kind === 'bet' && (k === 'Enter' || k === ' ') && T.bet > 0) {
        e.preventDefault();
        T.lastBet = T.bet;
        p.resolve(T.bet);
      } else if (p.kind === 'insurance') {
        if (k === 'S' || k === 'Y') p.resolve('I');
        else if (k === 'N') p.resolve('N');
      } else if (p.kind === 'continue' && (k === 'Enter' || k === ' ')) {
        e.preventDefault();
        p.resolve(true);
      }
    } else if (tab === 'estrategia') {
      if (SD.answered && (k === 'Enter' || k === ' ')) {
        e.preventDefault();
        sdNext();
      } else if (!SD.answered && SD.cur && AVAIL_KEY[k] && SD.cur.avail[AVAIL_KEY[k]]) sdAnswer(k);
    } else if (tab === 'desviaciones') {
      if (DV.answered && (k === 'Enter' || k === ' ')) {
        e.preventDefault();
        dvNext();
      } else if (!DV.answered && DV.cur && DV.mode === 'play') {
        if (DV.cur.dev.kind === 'ins') {
          if (k === 'S' || k === 'Y') dvAnswer('I');
          else if (k === 'N') dvAnswer('N');
        } else if (AVAIL_KEY[k] && DV.cur.avail[AVAIL_KEY[k]]) dvAnswer(k);
      }
    } else if (tab === 'conteo') {
      if (k === ' ') {
        e.preventDefault();
        if (CD.phase === 'running') cdStop();
        else if (CD.mode !== 'tc' && (CD.phase === 'idle' || CD.phase === 'done')) cdStart();
      } else if (k === 'Enter' && CD.mode === 'tc' && CD.phase === 'done') cdTcNext();
    }
  }

  const isStandalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // Cómo instalar según el teléfono y el navegador en que se abrió el enlace.
  function installHint() {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const android = /Android/.test(ua);
    if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)|GSA\//.test(ua))
      return 'Lo abriste dentro de otra app. Ábrelo en el navegador: toca ⋮ o ··· y elige «Abrir en el navegador» (Chrome o Safari).';
    if (ios) return 'Toca el botón Compartir (el cuadrado con la flecha ↑) y baja hasta «Añadir a pantalla de inicio».';
    if (android) return 'Toca «Instalar» o, en Chrome, el menú ⋮ → «Instalar app» o «Añadir a pantalla de inicio».';
    return '';
  }
  const INSTALL_DISMISSED = 'seis-mazos-install-dismissed';

  // Solo en la versión instalable (la que sirve sw.js y el manifiesto).
  function setupInstall() {
    if (!window.SEIS_MAZOS_PWA) return;
    const standalone = isStandalone();
    $('install-panel').hidden = standalone;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INSTALL_DISMISSED) === '1';
    } catch (e) {
      /* sin almacenamiento */
    }
    const how = installHint();
    if (!standalone && !dismissed && how) {
      $('install-how').textContent = how;
      $('install-banner').hidden = false;
    }
    $('install-banner-close').addEventListener('click', () => {
      $('install-banner').hidden = true;
      try {
        localStorage.setItem(INSTALL_DISMISSED, '1');
      } catch (e) {
        /* sin almacenamiento */
      }
    });
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      $('install-btn').hidden = false;
      $('install-banner-btn').hidden = false;
    });
    $('install-banner-btn').addEventListener('click', () => $('install-btn').click());
    // iPhone no avisa para instalar: el botón lleva a las instrucciones.
    if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) $('install-btn').hidden = false;
    $('install-btn').addEventListener('click', async () => {
      if (!deferred) {
        showTab('reglas');
        $('install-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch (e) {
        /* el usuario cerró el diálogo */
      }
      deferred = null;
      $('install-btn').hidden = true;
      $('install-banner-btn').hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      $('install-btn').hidden = true;
      $('install-panel').hidden = true;
      $('install-banner').hidden = true;
    });
  }

  function init(saved) {
    restore(saved);
    applySpeed();

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    document.addEventListener('keydown', onKey);
    $('hud-toggle').addEventListener('click', () => {
      settings.training.showHud = !settings.training.showHud;
      renderHud();
      renderControls();
      save();
    });

    // Estrategia
    seg('sd-filter', 'sd-filter', [['all', 'Todas'], ['hard', 'Duras'], ['soft', 'Blandas'], ['pairs', 'Parejas']], SD.filter, (v) => {
      SD.filter = v;
      sdNext();
    });
    $('sd-focus').addEventListener('change', sdNext);
    renderSdStats();

    // Desviaciones
    seg('dv-mode', 'dv-mode', [['play', 'Decidir la jugada'], ['index', 'Recordar el índice']], DV.mode, (v) => {
      DV.mode = v;
      dvNext();
    });
    seg('dv-show', 'dv-show', [['tc', 'Ver true count'], ['rc', 'Ver RC y mazos']], DV.show, (v) => {
      DV.show = v;
      dvNext();
    });
    seg('dv-set', 'dv-set', [['all', 'Todas'], ['I18', 'Illustrious 18'], ['Fab4', 'Fab 4']], DV.set, (v) => {
      DV.set = v;
      dvNext();
    });

    // Conteo
    seg('cd-mode', 'cd-mode', [['run', 'Contar cartas'], ['missing', 'Carta que falta'], ['tc', 'Convertir a true count']], CD.mode, (v) => {
      CD.mode = v;
      cdSetup();
    });
    seg('cd-n', 'cd-n', [[26, '26 cartas'], [52, '1 mazo'], [104, '2 mazos']], CD.n, (v) => {
      CD.n = v;
      cdSetup();
    });
    seg('cd-group', 'cd-group', [[1, '1 a la vez'], [2, '2 a la vez'], [3, '3 a la vez']], CD.group, (v) => {
      CD.group = v;
      cdSetup();
    });
    const sp = $('cd-speed');
    sp.value = String(CD.speed);
    $('cd-speed-out').textContent = `${CD.speed.toFixed(2)} s`;
    sp.addEventListener('input', () => {
      CD.speed = Number(sp.value);
      $('cd-speed-out').textContent = `${CD.speed.toFixed(2)} s`;
    });
    sp.addEventListener('change', () => {
      if (CD.phase !== 'running') cdSetup();
    });
    renderCdHistory();

    // Tablas
    $('tb-ix').addEventListener('change', renderTablas);

    // Reglas
    buildForm('rules-form', RULE_FIELDS, settings.rules, onRuleChange);
    buildForm('train-form', TRAIN_FIELDS, settings.training, onTrainChange);
    $('btn-shuffle').addEventListener('click', () => {
      if (NET.role === 'guest') return;
      T.needShuffle = true;
      if (T.betCollector) onRuleChange('decks');
      else setMsg('Se barajará un zapato nuevo antes de la próxima mano.');
      showTab('mesa');
    });
    twoStep($('btn-bank'), 'Reiniciar banca', () => {
      state.bankroll = START_BANK;
      if (NET.role === 'host' && NET.mode === 'indiv') renderTable();
      renderStats();
      save();
    });
    twoStep($('btn-stats'), 'Borrar estadísticas', () => {
      stats = emptyStats();
      drills = emptyDrills();
      renderStats();
      renderSdStats();
      renderDvSide();
      renderCdHistory();
      save();
    });
    twoStep($('btn-defaults'), 'Reglas por defecto', () => {
      if (NET.role === 'guest') return;
      Object.assign(settings.rules, clone(BJ.DEFAULT_RULES));
      buildForm('rules-form', RULE_FIELDS, settings.rules, onRuleChange);
      renderOnline();
      onRuleChange('decks');
    });

    // En línea e instalación
    renderOnline();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && NET.role !== 'solo') keepAwake();
    });
    setupInstall();

    renderAllRuleViews();
    renderStats();
    showFeedback($('feedback'), 'info', 'Aquí verás si cada decisión fue correcta', [
      'Se corrige con la estrategia básica de tus reglas y, si lo activas, con las desviaciones Hi-Lo según el true count.',
    ]);
    showTab(state.tab || 'mesa');
    tableLoop();
  }

  if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') window.claude.hot.snapshot(snapshot);
  const boot = (data) => init(data && Object.keys(data).length ? data : readStore());
  if (window.claude && window.claude.hot && typeof window.claude.hot.ready === 'function') window.claude.hot.ready(boot);
  else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
