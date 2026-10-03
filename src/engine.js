/*
 * Seis Mazos — motor de blackjack.
 * Zapato, valor de manos, estrategia básica (4–8 mazos) según reglas,
 * conteo Hi-Lo, desviaciones (Illustrious 18 + Fab 4) y generadores de ejercicios.
 * Sin dependencias: funciona en el navegador (window.BJ) y en Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BJ = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const ACTION_NAMES = { H: 'Pedir', S: 'Plantarse', D: 'Doblar', P: 'Separar', R: 'Rendirse' };

  const DEFAULT_RULES = {
    decks: 6,
    h17: false, // el crupier pide con 17 blando
    das: true, // doblar después de separar
    maxHands: 4, // manos máximas tras separar (4 = resplit hasta 4)
    resplitAces: false,
    hitSplitAces: false,
    doubleOn: 'any', // 'any' | '9-11' | '10-11'
    surrender: 'late', // 'none' | 'late'
    bjPays: 1.5, // 1.5 = 3:2, 1.2 = 6:5
    penetration: 0.75,
  };

  /* ---------- Cartas y zapato ---------- */

  function rankValue(r) {
    if (r === 'A') return 1;
    if (r === '10' || r === 'J' || r === 'Q' || r === 'K') return 10;
    return Number(r);
  }

  let nextId = 1;
  function makeCard(rank, suit) {
    return { id: nextId++, rank, suit, v: rankValue(rank) };
  }

  function hiLo(c) {
    const v = typeof c === 'number' ? c : c.v;
    if (v >= 2 && v <= 6) return 1;
    if (v >= 7 && v <= 9) return 0;
    return -1;
  }

  function defaultRng() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      return () => {
        crypto.getRandomValues(buf);
        return buf[0] / 4294967296;
      };
    }
    return Math.random;
  }

  // RNG determinista para tests.
  function seededRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function freshDecks(n) {
    const cards = [];
    for (let d = 0; d < n; d++) for (const s of SUITS) for (const r of RANKS) cards.push(makeCard(r, s));
    return cards;
  }

  class Shoe {
    constructor(decks, penetration, rng) {
      this.rng = rng || defaultRng();
      this.decks = decks;
      this.penetration = penetration;
      this.shuffle();
    }
    shuffle() {
      this.cards = shuffleInPlace(freshDecks(this.decks), this.rng);
      this.pos = 0;
      this.cutIndex = Math.round(this.cards.length * this.penetration);
      this.cutReached = false;
      this.emergency = false;
    }
    get size() {
      return this.cards.length;
    }
    get remaining() {
      return this.cards.length - this.pos;
    }
    draw() {
      if (this.pos >= this.cards.length) {
        // Solo pasa con penetraciones extremas y muchas manos separadas.
        this.shuffle();
        this.emergency = true;
      }
      const c = this.cards[this.pos++];
      if (this.pos >= this.cutIndex) this.cutReached = true;
      return c;
    }
  }

  /* ---------- Manos ---------- */

  function handValue(cards) {
    let t = 0;
    let aces = 0;
    for (const c of cards) {
      t += c.v;
      if (c.v === 1) aces++;
    }
    const soft = aces > 0 && t + 10 <= 21;
    return { total: soft ? t + 10 : t, soft, hard: t };
  }

  function isPair(cards) {
    return cards.length === 2 && cards[0].v === cards[1].v;
  }

  function upValue(card) {
    return card.v === 1 ? 11 : card.v;
  }

  function isNatural(hand) {
    return hand.cards.length === 2 && !hand.fromSplit && handValue(hand.cards).total === 21;
  }

  function dealerShouldHit(cards, r) {
    const { total, soft } = handValue(cards);
    if (total < 17) return true;
    return total === 17 && soft && r.h17;
  }

  function canDoubleTotal(cards, r) {
    if (r.doubleOn === 'any') return true;
    const { total, soft } = handValue(cards);
    if (soft) return false;
    if (r.doubleOn === '9-11') return total >= 9 && total <= 11;
    return total === 10 || total === 11;
  }

  function canDoubleHardTotal(total, r) {
    if (r.doubleOn === 'any') return true;
    if (r.doubleOn === '9-11') return total >= 9 && total <= 11;
    return total === 10 || total === 11;
  }

  /*
   * Acciones disponibles para una mano.
   * hand: { cards, fromSplit, splitAces, done }
   * handsCount: manos que tiene ahora el jugador en este asiento.
   */
  function availableActions(hand, handsCount, r) {
    const cards = hand.cards;
    const res = { hit: false, stand: false, double: false, split: false, surrender: false };
    const { total } = handValue(cards);
    if (hand.done || total >= 21) return res;
    const two = cards.length === 2;
    const aceLocked = hand.splitAces && !r.hitSplitAces;
    res.stand = true;
    res.hit = !aceLocked;
    res.double = two && !aceLocked && (!hand.fromSplit || r.das) && canDoubleTotal(cards, r);
    if (two && isPair(cards) && handsCount < r.maxHands) {
      res.split = cards[0].v === 1 ? !hand.splitAces || r.resplitAces : true;
    }
    res.surrender = r.surrender === 'late' && two && !hand.fromSplit && handsCount === 1;
    return res;
  }

  function settleHand(hand, dealerCards, r, dealerBJ) {
    const bet = hand.bet;
    if (hand.evenMoney) return { result: 'even', net: hand.baseBet };
    if (hand.surrendered) return { result: 'surrender', net: -bet / 2 };
    const natural = isNatural(hand);
    const pv = handValue(hand.cards).total;
    if (dealerBJ) return natural ? { result: 'push', net: 0 } : { result: 'lose', net: -bet };
    if (natural) return { result: 'bj', net: bet * r.bjPays };
    if (pv > 21) return { result: 'bust', net: -bet };
    const dv = handValue(dealerCards).total;
    if (dv > 21 || pv > dv) return { result: 'win', net: bet };
    if (pv < dv) return { result: 'lose', net: -bet };
    return { result: 'push', net: 0 };
  }

  /* ---------- Estrategia básica (4–8 mazos, el crupier revisa si tiene blackjack) ---------- */

  // Códigos: H pedir, S plantarse, D doblar (si no, pedir), Ds doblar (si no, plantarse),
  // Rh rendirse (si no, pedir), Rs rendirse (si no, plantarse).
  // Con H17 la rendición tardía también incluye 17 vs A, 15 vs A y 8,8 vs A
  // (tabla H17 de Blackjack Apprenticeship 2024 y Wizard of Odds).
  function extraH17Surrender(r) {
    return r.surrender === 'late' && r.h17;
  }

  function hardCode(total, up, r) {
    const sur = r.surrender === 'late';
    const extra = extraH17Surrender(r);
    if (total >= 18) return 'S';
    if (total === 17) return extra && up === 11 ? 'Rs' : 'S';
    if (total === 16) {
      if (sur && up >= 9) return 'Rh';
      return up <= 6 ? 'S' : 'H';
    }
    if (total === 15) {
      if (sur && (up === 10 || (extra && up === 11))) return 'Rh';
      return up <= 6 ? 'S' : 'H';
    }
    if (total === 13 || total === 14) return up <= 6 ? 'S' : 'H';
    if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
    if (total === 11) return up === 11 ? (r.h17 ? 'D' : 'H') : 'D';
    if (total === 10) return up <= 9 ? 'D' : 'H';
    if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
    return 'H';
  }

  function softCode(total, up, r) {
    if (total >= 20) return 'S';
    if (total === 19) return r.h17 && up === 6 ? 'Ds' : 'S';
    if (total === 18) {
      if (up === 2) return r.h17 ? 'Ds' : 'S';
      if (up <= 6) return 'Ds';
      if (up <= 8) return 'S';
      return 'H';
    }
    if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
    if (total === 15 || total === 16) return up >= 4 && up <= 6 ? 'D' : 'H';
    if (total === 13 || total === 14) return up >= 5 && up <= 6 ? 'D' : 'H';
    return 'H'; // 12 blando (A,A que ya no se puede separar)
  }

  // Devuelve 'P' (separar), 'Ph' (separar solo con DAS), 'Rp' (rendirse; si no, separar) o null.
  function pairCode(pv, up, r) {
    switch (pv) {
      case 11:
        return 'P';
      case 10:
        return null;
      case 9:
        return up <= 9 && up !== 7 ? 'P' : null;
      case 8:
        return extraH17Surrender(r) && up === 11 ? 'Rp' : 'P';
      case 7:
        return up <= 7 ? 'P' : null;
      case 6:
        if (up === 2) return 'Ph';
        return up <= 6 ? 'P' : null;
      case 5:
        return null;
      case 4:
        return up === 5 || up === 6 ? 'Ph' : null;
      case 3:
      case 2:
        if (up <= 3) return 'Ph';
        return up <= 7 ? 'P' : null;
      default:
        return null;
    }
  }

  function resolveCode(code, avail) {
    switch (code) {
      case 'D':
        return avail.double ? 'D' : 'H';
      case 'Ds':
        return avail.double ? 'D' : 'S';
      case 'Rh':
        return avail.surrender ? 'R' : 'H';
      case 'Rs':
        return avail.surrender ? 'R' : 'S';
      case 'Rp':
        return avail.surrender ? 'R' : 'P';
      default:
        return code;
    }
  }

  function pairRow(cards) {
    return cards[0].v === 1 ? 11 : cards[0].v;
  }

  function basicDecision(cards, up, avail, r) {
    const hv = handValue(cards);
    if (avail.split && isPair(cards)) {
      const pv = pairRow(cards);
      const pc = pairCode(pv, up, r);
      if (pc === 'P' || (pc === 'Ph' && r.das)) return { action: 'P', code: pc, kind: 'pair', row: pv, up };
      if (pc === 'Rp') return { action: resolveCode('Rp', avail), code: 'Rp', kind: 'pair', row: pv, up };
    }
    const kind = hv.soft ? 'soft' : 'hard';
    const code = hv.soft ? softCode(hv.total, up, r) : hardCode(hv.total, up, r);
    return { action: resolveCode(code, avail), code, kind, row: hv.total, up };
  }

  /* ---------- Conteo Hi-Lo y desviaciones ---------- */

  function trueCount(rc, cardsRemaining) {
    const decks = Math.max(cardsRemaining, 1) / 52;
    return rc / decks;
  }

  // Mazos restantes tal como se estiman mirando la bandeja de descartes (al medio mazo).
  function estimatedDecks(cardsRemaining) {
    return Math.max(0.5, Math.round((cardsRemaining / 52) * 2) / 2);
  }

  function deviationList(r) {
    const list = [
      { id: 'ins', kind: 'ins', up: 11, index: 3, above: 'I', below: 'N', group: 'I18' },
      { id: '16v10', kind: 'hard', total: 16, up: 10, index: 0, above: 'S', below: 'H', group: 'I18' },
      { id: '15v10', kind: 'hard', total: 15, up: 10, index: 4, above: 'S', below: 'H', group: 'I18' },
      { id: 'TTv5', kind: 'pair', pair: 10, up: 5, index: 5, above: 'P', below: 'S', group: 'I18' },
      { id: 'TTv6', kind: 'pair', pair: 10, up: 6, index: 4, above: 'P', below: 'S', group: 'I18' },
      { id: '10v10', kind: 'hard', total: 10, up: 10, index: 4, above: 'D', below: 'H', group: 'I18' },
      { id: '12v3', kind: 'hard', total: 12, up: 3, index: 2, above: 'S', below: 'H', group: 'I18' },
      { id: '12v2', kind: 'hard', total: 12, up: 2, index: 3, above: 'S', below: 'H', group: 'I18' },
      { id: '11vA', kind: 'hard', total: 11, up: 11, index: 1, above: 'D', below: 'H', group: 'I18', s17only: true },
      { id: '9v2', kind: 'hard', total: 9, up: 2, index: 1, above: 'D', below: 'H', group: 'I18' },
      { id: '10vA', kind: 'hard', total: 10, up: 11, index: r.h17 ? 3 : 4, above: 'D', below: 'H', group: 'I18' },
      { id: '9v7', kind: 'hard', total: 9, up: 7, index: 3, above: 'D', below: 'H', group: 'I18' },
      { id: '16v9', kind: 'hard', total: 16, up: 9, index: 5, above: 'S', below: 'H', group: 'I18' },
      { id: '13v2', kind: 'hard', total: 13, up: 2, index: -1, above: 'S', below: 'H', group: 'I18' },
      { id: '12v4', kind: 'hard', total: 12, up: 4, index: 0, above: 'S', below: 'H', group: 'I18' },
      { id: '12v5', kind: 'hard', total: 12, up: 5, index: -2, above: 'S', below: 'H', group: 'I18' },
      { id: '12v6', kind: 'hard', total: 12, up: 6, index: -1, above: 'S', below: 'H', group: 'I18' },
      { id: '13v3', kind: 'hard', total: 13, up: 3, index: -2, above: 'S', below: 'H', group: 'I18' },
      { id: 'R14v10', kind: 'sur', total: 14, up: 10, index: 3, above: 'R', group: 'Fab4' },
      { id: 'R15v10', kind: 'sur', total: 15, up: 10, index: 0, above: 'R', group: 'Fab4' },
      { id: 'R15v9', kind: 'sur', total: 15, up: 9, index: 2, above: 'R', group: 'Fab4' },
      { id: 'R15vA', kind: 'sur', total: 15, up: 11, index: extraH17Surrender(r) ? -1 : 1, above: 'R', group: 'Fab4' },
    ];
    return list.filter((d) => {
      if (d.s17only && r.h17) return false;
      if (d.kind === 'sur' && r.surrender !== 'late') return false;
      if (d.kind === 'hard' && d.above === 'D' && !canDoubleHardTotal(d.total, r)) return false;
      return true;
    });
  }

  function upLabel(up) {
    return up === 11 ? 'A' : String(up);
  }

  function deviationName(d) {
    if (d.kind === 'ins') return 'Seguro';
    if (d.kind === 'pair') return `10,10 vs ${upLabel(d.up)}`;
    if (d.kind === 'sur') return `Rendirse ${d.total} vs ${upLabel(d.up)}`;
    return `${d.total} vs ${upLabel(d.up)}`;
  }

  // Jugada básica de la situación de una desviación (las de rendición, con rendición disponible).
  function deviationBasicAction(d, r) {
    if (d.kind === 'ins') return 'N';
    if (d.kind === 'pair') return 'S';
    const code = hardCode(d.total, d.up, r);
    return resolveCode(code, { double: true, surrender: d.kind === 'sur' });
  }

  /*
   * Jugada recomendada.
   * tc: true count (o null para usar solo la básica). Las desviaciones se aplican si tc >= índice.
   * Devuelve { action, basic, devs:[{dev, applies}], isDeviation }.
   */
  function decide(cards, up, avail, r, tc, useDev) {
    const basic = basicDecision(cards, up, avail, r);
    const out = { action: basic.action, basic, devs: [], isDeviation: false };
    if (!useDev || tc == null || !isFinite(tc)) return out;
    const hv = handValue(cards);
    const list = deviationList(r);
    let av = avail;
    let cur = basic;
    const finish = (action) => {
      out.action = action;
      out.isDeviation = action !== basic.action;
      return out;
    };

    if (avail.surrender && !hv.soft) {
      const sd = list.find((d) => d.kind === 'sur' && d.total === hv.total && d.up === up);
      if (sd) {
        const applies = tc >= sd.index;
        out.devs.push({ dev: sd, applies });
        if (applies) return finish('R');
        av = Object.assign({}, avail, { surrender: false });
        cur = basicDecision(cards, up, av, r);
      }
    }
    if (cur.action === 'R' || cur.action === 'P') return finish(cur.action);

    if (av.split && isPair(cards) && cards[0].v === 10) {
      const pd = list.find((d) => d.kind === 'pair' && d.up === up);
      if (pd) {
        const applies = tc >= pd.index;
        out.devs.push({ dev: pd, applies });
        return finish(applies ? 'P' : 'S');
      }
    }

    if (!hv.soft) {
      const hd = list.find((d) => d.kind === 'hard' && d.total === hv.total && d.up === up);
      if (hd && !(hd.above === 'D' && !av.double)) {
        const applies = tc >= hd.index;
        out.devs.push({ dev: hd, applies });
        return finish(applies ? hd.above : hd.below);
      }
    }
    return finish(cur.action);
  }

  /*
   * Corrección con tolerancia: el jugador estima los mazos restantes al medio mazo,
   * así que si el TC exacto y el estimado llevan a jugadas distintas se aceptan ambas.
   */
  function gradeDecision(cards, up, avail, r, tcExact, tcEst, useDev) {
    const d = decide(cards, up, avail, r, tcExact, useDev);
    const accepted = new Set([d.action]);
    let borderline = false;
    if (useDev && tcEst != null) {
      const d2 = decide(cards, up, avail, r, tcEst, useDev);
      if (d2.action !== d.action) {
        accepted.add(d2.action);
        borderline = true;
      }
    }
    return Object.assign(d, { accepted, borderline });
  }

  function insuranceDecision(tcExact, tcEst, useDev) {
    const take = useDev && tcExact >= 3;
    const accepted = new Set([take ? 'I' : 'N']);
    let borderline = false;
    if (useDev && tcEst != null && tcEst >= 3 !== take) {
      accepted.add(tcEst >= 3 ? 'I' : 'N');
      borderline = true;
    }
    return { action: take ? 'I' : 'N', accepted, borderline };
  }

  // Rampa de apuestas clásica para Hi-Lo: (TC − 1) unidades, mínimo 1.
  function rampUnits(tc, maxSpread) {
    const u = Math.floor(tc) - 1;
    return Math.max(1, Math.min(maxSpread, u));
  }

  /* ---------- Tablas para mostrar ---------- */

  // Código tal como se muestra en la tabla con las reglas actuales.
  function displayCode(code, canDouble, r) {
    const sur = r.surrender === 'late';
    switch (code) {
      case 'D':
        return canDouble ? 'D' : 'H';
      case 'Ds':
        return canDouble ? 'Ds' : 'S';
      case 'Rh':
        return sur ? 'Rh' : 'H';
      case 'Rs':
        return sur ? 'Rs' : 'S';
      case 'Rp':
        return sur ? 'Rp' : 'P';
      case 'Ph':
        return 'P';
      default:
        return code;
    }
  }

  // Tablas para mostrar, con el mismo formato que las de Blackjack Apprenticeship: filas de mayor a
  // menor, y la rendición en un cuadro aparte (en las demás tablas se ve la jugada sin rendirse).
  function strategyCharts(r) {
    const sur = r.surrender === 'late';
    const noSur = (code) => (code === 'Rh' ? 'H' : code === 'Rs' ? 'S' : code === 'Rp' ? 'P' : code);
    const devs = deviationList(r);
    const devAt = (pred) => devs.filter(pred);
    const hardRows = [
      { label: '17+', total: 17 },
      { label: '16', total: 16 },
      { label: '15', total: 15 },
      { label: '14', total: 14 },
      { label: '13', total: 13 },
      { label: '12', total: 12 },
      { label: '11', total: 11 },
      { label: '10', total: 10 },
      { label: '9', total: 9 },
      { label: '5–8', total: 8 },
    ];
    const hard = hardRows.map((row) => ({
      label: row.label,
      key: row.total,
      cells: UPCARDS.map((up) => ({
        up,
        code: displayCode(noSur(hardCode(row.total, up, r)), canDoubleHardTotal(row.total, r), r),
        devs: devAt((d) => d.kind === 'hard' && d.total === row.total && d.up === up),
      })),
    }));
    const soft = [9, 8, 7, 6, 5, 4, 3, 2].map((x) => ({
      label: `A,${x}`,
      key: 11 + x,
      cells: UPCARDS.map((up) => ({
        up,
        code: displayCode(softCode(11 + x, up, r), r.doubleOn === 'any', r),
        devs: [],
      })),
    }));
    const pairs = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((pv) => ({
      label: pv === 11 ? 'A,A' : pv === 10 ? '10,10' : `${pv},${pv}`,
      key: pv,
      cells: UPCARDS.map((up) => {
        const pc = pairCode(pv, up, r);
        let code;
        if (pc === 'P' || pc === 'Rp' || (pc === 'Ph' && r.das)) code = 'P';
        else code = displayCode(noSur(hardCode(pv * 2, up, r)), canDoubleHardTotal(pv * 2, r), r);
        const devs = pv === 10 ? devAt((d) => d.kind === 'pair' && d.up === up) : [];
        return { up, code, devs };
      }),
    }));
    const surrender = [];
    if (sur) {
      const isR = (c) => c === 'Rh' || c === 'Rs';
      for (const total of [17, 16, 15, 14]) {
        const cells = UPCARDS.map((up) => ({
          up,
          code: isR(hardCode(total, up, r)) ? 'R' : '',
          devs: devAt((d) => d.kind === 'sur' && d.total === total && d.up === up),
        }));
        const empty = !cells.some((c) => c.code);
        if (total === 17 && empty) continue;
        // La fila 14 no tiene rendiciones básicas; solo sirve para mostrar el índice de desviación.
        surrender.push({ label: String(total), key: total, cells, optional: empty });
      }
      const p8 = UPCARDS.map((up) => ({ up, code: pairCode(8, up, r) === 'Rp' ? 'R' : '', devs: [] }));
      if (p8.some((c) => c.code)) surrender.push({ label: '8,8', key: 'p8', cells: p8 });
    }
    return { hard, soft, pairs, surrender };
  }

  /* ---------- Ventaja de la casa aproximada ---------- */

  // Efectos aproximados de cada regla sobre una base de 6 mazos, S17, DAS, sin rendición,
  // separar hasta 4 manos, sin resplit de ases, doblar con dos cartas cualesquiera y BJ 3:2.
  function houseEdge(r) {
    let e = 0.42;
    if (r.decks === 4) e -= 0.06;
    if (r.decks === 8) e += 0.02;
    if (r.h17) e += 0.22;
    if (!r.das) e += 0.14;
    if (r.surrender === 'late') e -= r.h17 ? 0.09 : 0.08;
    if (r.resplitAces) e -= 0.08;
    if (r.hitSplitAces) e -= 0.19;
    if (r.maxHands === 2) e += 0.05;
    if (r.maxHands === 3) e += 0.01;
    if (r.doubleOn === '9-11') e += 0.09;
    if (r.doubleOn === '10-11') e += 0.18;
    if (r.bjPays === 1.2) e += 1.39;
    return e;
  }

  /* ---------- Generadores de ejercicios ---------- */

  function cardOfValue(v, rng) {
    const suit = SUITS[Math.floor(rng() * 4)];
    let rank;
    if (v === 1 || v === 11) rank = 'A';
    else if (v === 10) rank = ['10', 'J', 'Q', 'K'][Math.floor(rng() * 4)];
    else rank = String(v);
    return makeCard(rank, suit);
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Dos cartas distintas (sin ases) que suman `total`.
  function twoCardHard(total, rng) {
    const opts = [];
    for (let a = 2; a <= 10; a++) {
      const b = total - a;
      if (b > a && b <= 10) opts.push([a, b]);
    }
    if (!opts.length) return null;
    const [a, b] = pick(opts, rng);
    return rng() < 0.5 ? [cardOfValue(a, rng), cardOfValue(b, rng)] : [cardOfValue(b, rng), cardOfValue(a, rng)];
  }

  // Tres cartas (sin ases) que suman `total`.
  function threeCardHard(total, rng) {
    const opts = [];
    for (let a = 2; a <= 10; a++)
      for (let b = 2; b <= 10; b++) {
        const c = total - a - b;
        if (c >= 2 && c <= 10) opts.push([a, b, c]);
      }
    if (!opts.length) return null;
    return pick(opts, rng).map((v) => cardOfValue(v, rng));
  }

  // Celdas de la tabla de estrategia: kind:row:up
  function strategyCells(filter) {
    const cells = [];
    const add = (kind, rows, weight) => {
      for (const row of rows) for (const up of UPCARDS) cells.push({ kind, row, up, w: weight(row) });
    };
    if (filter === 'all' || filter === 'hard')
      add('hard', [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], (t) => (t >= 8 && t <= 17 ? 3 : 1));
    if (filter === 'all' || filter === 'soft') add('soft', [13, 14, 15, 16, 17, 18, 19, 20], (t) => (t <= 19 ? 3 : 1));
    if (filter === 'all' || filter === 'pairs') add('pair', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], () => 2);
    return cells;
  }

  function cellKey(c) {
    return `${c.kind}:${c.row}:${c.up}`;
  }

  function cardsForCell(cell, rng) {
    if (cell.kind === 'hard') return twoCardHard(cell.row, rng);
    if (cell.kind === 'soft') {
      const x = cell.row - 11;
      return rng() < 0.5 ? [cardOfValue(1, rng), cardOfValue(x, rng)] : [cardOfValue(x, rng), cardOfValue(1, rng)];
    }
    return [cardOfValue(cell.row, rng), cardOfValue(cell.row, rng)];
  }

  // focus: mapa cellKey -> peso extra (p. ej. por errores previos)
  function genStrategyScenario(filter, rng, focus) {
    const cells = strategyCells(filter);
    let total = 0;
    const weights = cells.map((c) => {
      const w = c.w * (1 + ((focus && focus[cellKey(c)]) || 0));
      total += w;
      return w;
    });
    let x = rng() * total;
    let cell = cells[cells.length - 1];
    for (let i = 0; i < cells.length; i++) {
      x -= weights[i];
      if (x < 0) {
        cell = cells[i];
        break;
      }
    }
    return { cell, cards: cardsForCell(cell, rng), upCard: cardOfValue(cell.up === 11 ? 1 : cell.up, rng) };
  }

  function genDeviationScenario(r, rng, opts) {
    const list = deviationList(r);
    const d = (opts && opts.dev) || pick(list, rng);
    const offsets = [-3, -2, -1, 0, 0, 1, 1, 2, 3];
    const tcInt = d.index + pick(offsets, rng);
    const upCard = cardOfValue(d.up === 11 ? 1 : d.up, rng);
    let cards;
    if (d.kind === 'ins') {
      do {
        cards = [cardOfValue(1 + Math.floor(rng() * 10), rng), cardOfValue(1 + Math.floor(rng() * 10), rng)];
      } while (handValue(cards).total === 21);
    } else if (d.kind === 'pair') {
      cards = [cardOfValue(10, rng), cardOfValue(10, rng)];
    } else if (d.kind === 'sur') {
      cards = twoCardHard(d.total, rng);
    } else {
      // Si con dos cartas tocaría rendirse por básica, se usa una mano de tres cartas.
      const twoCode = hardCode(d.total, d.up, r);
      const needsThree = twoCode === 'Rh' || twoCode === 'Rs';
      cards = needsThree ? threeCardHard(d.total, rng) : twoCardHard(d.total, rng);
    }
    return { dev: d, tc: tcInt, cards, upCard };
  }

  return {
    RANKS,
    SUITS,
    SUIT_SYMBOL,
    UPCARDS,
    ACTION_NAMES,
    DEFAULT_RULES,
    makeCard,
    rankValue,
    hiLo,
    defaultRng,
    seededRng,
    shuffleInPlace,
    freshDecks,
    Shoe,
    handValue,
    isPair,
    upValue,
    isNatural,
    dealerShouldHit,
    canDoubleTotal,
    canDoubleHardTotal,
    availableActions,
    settleHand,
    hardCode,
    softCode,
    pairCode,
    resolveCode,
    basicDecision,
    trueCount,
    estimatedDecks,
    deviationList,
    deviationName,
    deviationBasicAction,
    decide,
    gradeDecision,
    insuranceDecision,
    rampUnits,
    displayCode,
    strategyCharts,
    houseEdge,
    upLabel,
    cardOfValue,
    twoCardHard,
    threeCardHard,
    strategyCells,
    cellKey,
    cardsForCell,
    genStrategyScenario,
    genDeviationScenario,
  };
});
