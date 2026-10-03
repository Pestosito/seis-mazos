'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BJ = require('../src/engine.js');

const R = (over) => Object.assign({}, BJ.DEFAULT_RULES, over);
const c = (rank, suit = 's') => BJ.makeCard(rank, suit);
const hand = (...ranks) => ranks.map((r) => c(r));
const FULL = { hit: true, stand: true, double: true, split: true, surrender: true };
const NO_SUR = { hit: true, stand: true, double: true, split: true, surrender: false };

test('valor de manos', () => {
  assert.deepEqual(BJ.handValue(hand('A', '6')), { total: 17, soft: true, hard: 7 });
  assert.deepEqual(BJ.handValue(hand('A', '6', '10')), { total: 17, soft: false, hard: 17 });
  assert.deepEqual(BJ.handValue(hand('A', 'A')), { total: 12, soft: true, hard: 2 });
  assert.equal(BJ.handValue(hand('K', 'Q', '5')).total, 25);
});

test('zapato de 6 mazos: 312 cartas, conteo Hi-Lo equilibrado', () => {
  const shoe = new BJ.Shoe(6, 0.75, BJ.seededRng(1));
  assert.equal(shoe.size, 312);
  assert.equal(shoe.cutIndex, 234);
  let rc = 0;
  for (let i = 0; i < 312; i++) rc += BJ.hiLo(shoe.draw());
  assert.equal(rc, 0);
  assert.equal(shoe.cutReached, true);
});

test('crupier S17 vs H17', () => {
  assert.equal(BJ.dealerShouldHit(hand('A', '6'), R({ h17: false })), false);
  assert.equal(BJ.dealerShouldHit(hand('A', '6'), R({ h17: true })), true);
  assert.equal(BJ.dealerShouldHit(hand('10', '7'), R({ h17: true })), false);
  assert.equal(BJ.dealerShouldHit(hand('10', '6'), R()), true);
});

test('acciones disponibles: DAS, resplit de ases, rendición', () => {
  const r = R({ das: false, resplitAces: false, maxHands: 4 });
  const split8 = { cards: hand('8', '3'), fromSplit: true };
  assert.equal(BJ.availableActions(split8, 2, r).double, false);
  assert.equal(BJ.availableActions(split8, 2, R()).double, true);
  const aces = { cards: hand('A', 'A'), fromSplit: true, splitAces: true };
  assert.equal(BJ.availableActions(aces, 2, r).split, false);
  assert.equal(BJ.availableActions(aces, 2, R({ resplitAces: true })).split, true);
  assert.equal(BJ.availableActions(aces, 4, R({ resplitAces: true })).split, false);
  const first = { cards: hand('10', '6') };
  assert.equal(BJ.availableActions(first, 1, R()).surrender, true);
  assert.equal(BJ.availableActions(first, 1, R({ surrender: 'none' })).surrender, false);
  const d911 = R({ doubleOn: '9-11' });
  assert.equal(BJ.availableActions({ cards: hand('A', '7') }, 1, d911).double, false);
  assert.equal(BJ.availableActions({ cards: hand('5', '4') }, 1, d911).double, true);
  assert.equal(BJ.availableActions({ cards: hand('5', '4') }, 1, R({ doubleOn: '10-11' })).double, false);
});

test('estrategia básica: casos de referencia 6 mazos S17 DAS LS', () => {
  const r = R();
  const a = (cards, up, avail = FULL) => BJ.basicDecision(hand(...cards), up, avail, r).action;
  assert.equal(a(['10', '6'], 10), 'R');
  assert.equal(a(['10', '6'], 10, NO_SUR), 'H');
  assert.equal(a(['10', '5'], 10), 'R');
  assert.equal(a(['10', '5'], 11), 'H');
  assert.equal(a(['10', '7'], 11), 'S');
  assert.equal(a(['8', '3'], 11), 'H');
  assert.equal(a(['8', '3'], 10), 'D');
  assert.equal(a(['A', '7'], 2), 'S');
  assert.equal(a(['A', '7'], 3), 'D');
  assert.equal(a(['A', '7'], 9), 'H');
  assert.equal(a(['A', '8'], 6), 'S');
  assert.equal(a(['9', '9'], 7), 'S');
  assert.equal(a(['9', '9'], 8), 'P');
  assert.equal(a(['8', '8'], 11), 'P');
  assert.equal(a(['5', '5'], 9), 'D');
  assert.equal(a(['4', '4'], 5), 'P');
  assert.equal(a(['2', '2'], 2), 'P');
  assert.equal(a(['6', '6'], 2), 'P');
  assert.equal(a(['10', '2'], 3), 'H');
  assert.equal(a(['10', '2'], 4), 'S');
});

test('estrategia básica: cambios con H17', () => {
  const r = R({ h17: true });
  const a = (cards, up, avail = FULL) => BJ.basicDecision(hand(...cards), up, avail, r).action;
  assert.equal(a(['8', '3'], 11), 'D');
  assert.equal(a(['A', '8'], 6), 'D');
  assert.equal(a(['A', '7'], 2), 'D');
  assert.equal(a(['10', '5'], 11), 'R');
  assert.equal(a(['10', '7'], 11), 'R');
  assert.equal(a(['8', '8'], 11), 'R');
  assert.equal(a(['8', '8'], 11, NO_SUR), 'P');
});

test('estrategia básica: sin DAS', () => {
  const r = R({ das: false });
  const a = (cards, up) => BJ.basicDecision(hand(...cards), up, FULL, r).action;
  assert.equal(a(['2', '2'], 2), 'H');
  assert.equal(a(['2', '2'], 4), 'P');
  assert.equal(a(['4', '4'], 5), 'H');
  assert.equal(a(['6', '6'], 2), 'H');
  assert.equal(a(['6', '6'], 3), 'P');
});

test('sin poder doblar: D → pedir, Ds → plantarse', () => {
  const r = R();
  const noDbl = { hit: true, stand: true, double: false, split: false, surrender: false };
  assert.equal(BJ.basicDecision(hand('A', '7'), 4, noDbl, r).action, 'S');
  assert.equal(BJ.basicDecision(hand('A', '6'), 4, noDbl, r).action, 'H');
  assert.equal(BJ.basicDecision(hand('4', '3', '4'), 6, noDbl, r).action, 'H');
});

test('desviaciones Hi-Lo', () => {
  const r = R();
  const d = (cards, up, tc, avail = FULL) => BJ.decide(hand(...cards), up, avail, r, tc, true).action;
  // 16 vs 10: con dos cartas y rendición, se rinde siempre
  assert.equal(d(['10', '6'], 10, 3), 'R');
  assert.equal(d(['10', '6'], 10, 1, NO_SUR), 'S');
  assert.equal(d(['10', '6'], 10, -1, NO_SUR), 'H');
  assert.equal(d(['7', '5', '4'], 10, 0.5, NO_SUR), 'S');
  // 15 vs 10: rendirse con TC >= 0, si no pedir; sin rendición, plantarse con +4
  assert.equal(d(['10', '5'], 10, 0), 'R');
  assert.equal(d(['10', '5'], 10, -0.5), 'H');
  assert.equal(d(['10', '5'], 10, 4, NO_SUR), 'S');
  assert.equal(d(['10', '5'], 10, 3.9, NO_SUR), 'H');
  // Fab 4
  assert.equal(d(['10', '4'], 10, 3), 'R');
  assert.equal(d(['10', '4'], 10, 2.9), 'H');
  assert.equal(d(['10', '5'], 9, 2), 'R');
  assert.equal(d(['10', '5'], 11, 1), 'R');
  assert.equal(d(['10', '5'], 11, 0.5), 'H');
  // Pareja de dieces
  assert.equal(d(['10', 'K'], 5, 5), 'P');
  assert.equal(d(['10', 'K'], 6, 3.9), 'S');
  // Doblar
  assert.equal(d(['6', '4'], 10, 4), 'D');
  assert.equal(d(['6', '4'], 11, 4), 'D');
  assert.equal(d(['6', '4'], 11, 3), 'H');
  assert.equal(d(['8', '3'], 11, 1), 'D');
  assert.equal(d(['6', '3'], 2, 1), 'D');
  assert.equal(d(['6', '3'], 7, 3), 'D');
  // Plantarse/pedir con 12 y 13
  assert.equal(d(['10', '2'], 3, 2), 'S');
  assert.equal(d(['10', '2'], 2, 2.9), 'H');
  assert.equal(d(['10', '2'], 4, -0.1), 'H');
  assert.equal(d(['10', '2'], 6, -1), 'S');
  assert.equal(d(['10', '3'], 2, -1.5), 'H');
  assert.equal(d(['10', '3'], 3, -2), 'S');
  // 6,6 vs 4 se separa: la desviación de 12 vs 4 no aplica
  assert.equal(d(['6', '6'], 4, -3), 'P');
  // 16 vs 9 sin rendición
  assert.equal(d(['9', '7'], 9, 5, NO_SUR), 'S');
  // Mano blanda: sin desviaciones
  assert.equal(d(['A', '7'], 2, 5), 'S');
});

test('desviaciones con H17', () => {
  const r = R({ h17: true });
  const ids = BJ.deviationList(r).map((x) => x.id);
  assert.ok(!ids.includes('11vA'));
  assert.equal(BJ.deviationList(r).find((x) => x.id === '10vA').index, 3);
  assert.equal(BJ.decide(hand('10', '5'), 11, FULL, r, -1.5, true).action, 'H');
  assert.equal(BJ.decide(hand('10', '5'), 11, FULL, r, -1, true).action, 'R');
});

test('corrección con tolerancia por estimación de mazos', () => {
  const r = R();
  // TC exacto 1.9, estimado 2.1: 12 vs 3 (índice +2) acepta pedir y plantarse
  const g = BJ.gradeDecision(hand('10', '2'), 3, NO_SUR, r, 1.9, 2.1, true);
  assert.ok(g.accepted.has('H') && g.accepted.has('S'));
  assert.equal(g.borderline, true);
  const g2 = BJ.gradeDecision(hand('10', '2'), 3, NO_SUR, r, 0.5, 0.6, true);
  assert.deepEqual([...g2.accepted], ['H']);
});

test('seguro solo con TC >= +3', () => {
  assert.equal(BJ.insuranceDecision(3.1, 3, true).action, 'I');
  assert.equal(BJ.insuranceDecision(2.5, 2.4, true).action, 'N');
  assert.equal(BJ.insuranceDecision(5, 5, false).action, 'N');
});

test('liquidación', () => {
  const r = R();
  const h = (ranks, extra = {}) => Object.assign({ cards: hand(...ranks), bet: 10, baseBet: 10 }, extra);
  assert.deepEqual(BJ.settleHand(h(['A', 'K']), hand('10', '7'), r, false), { result: 'bj', net: 15 });
  assert.deepEqual(BJ.settleHand(h(['A', 'K']), hand('10', '7'), R({ bjPays: 1.2 }), false), { result: 'bj', net: 12 });
  assert.deepEqual(BJ.settleHand(h(['A', 'K'], { fromSplit: true }), hand('10', '7'), r, false), {
    result: 'win',
    net: 10,
  });
  assert.deepEqual(BJ.settleHand(h(['A', 'K']), hand('A', 'K'), r, true), { result: 'push', net: 0 });
  assert.deepEqual(BJ.settleHand(h(['10', '6'], { surrendered: true }), hand('10', '7'), r, false), {
    result: 'surrender',
    net: -5,
  });
  assert.deepEqual(BJ.settleHand(h(['10', '6', '9']), hand('10', '7'), r, false), { result: 'bust', net: -10 });
  assert.deepEqual(BJ.settleHand(h(['10', '8']), hand('10', '6', '9'), r, false), { result: 'win', net: 10 });
  assert.deepEqual(BJ.settleHand(h(['10', '7']), hand('10', '7'), r, false), { result: 'push', net: 0 });
});

test('rampa de apuestas', () => {
  assert.equal(BJ.rampUnits(-2, 12), 1);
  assert.equal(BJ.rampUnits(1.9, 12), 1);
  assert.equal(BJ.rampUnits(3.2, 12), 2);
  assert.equal(BJ.rampUnits(20, 8), 8);
});

test('generadores de ejercicios producen manos válidas', () => {
  const rng = BJ.seededRng(7);
  for (let i = 0; i < 500; i++) {
    const s = BJ.genStrategyScenario('all', rng);
    const hv = BJ.handValue(s.cards);
    if (s.cell.kind === 'hard') {
      assert.equal(hv.total, s.cell.row);
      assert.equal(hv.soft, false);
      assert.equal(BJ.isPair(s.cards), false);
    } else if (s.cell.kind === 'soft') {
      assert.equal(hv.total, s.cell.row);
      assert.equal(hv.soft, true);
    } else {
      assert.ok(BJ.isPair(s.cards));
    }
    assert.equal(BJ.upValue(s.upCard), s.cell.up);
  }
  for (const rules of [R(), R({ h17: true }), R({ surrender: 'none' }), R({ doubleOn: '10-11' })]) {
    for (let i = 0; i < 300; i++) {
      const s = BJ.genDeviationScenario(rules, rng);
      assert.ok(Array.isArray(s.cards) && s.cards.length >= 2, s.dev.id);
      if (s.dev.kind === 'hard' || s.dev.kind === 'sur') assert.equal(BJ.handValue(s.cards).total, s.dev.total);
    }
  }
});

/*
 * Verificación independiente: estrategia de mazo infinito calculada por expectativa.
 * La estrategia de 6 mazos coincide con la de mazo infinito salvo en jugadas muy cerradas,
 * que se listan aquí explícitamente.
 */
function infiniteDeckChecker(r) {
  const p = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4].map((x) => x / 13);
  function dealerDist(upV) {
    const memo = new Map();
    function rec(hard, ace) {
      const key = hard * 2 + (ace ? 1 : 0);
      if (memo.has(key)) return memo.get(key);
      const soft = ace && hard + 10 <= 21;
      const tot = soft ? hard + 10 : hard;
      const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
      if (tot > 21) out.bust = 1;
      else if (tot >= 17 && !(tot === 17 && soft && r.h17)) out[tot] = 1;
      else
        for (let v = 1; v <= 10; v++) {
          const d = rec(hard + v, ace || v === 1);
          for (const k in out) out[k] += p[v] * d[k];
        }
      memo.set(key, out);
      return out;
    }
    const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
    let norm = 0;
    for (let v = 1; v <= 10; v++) {
      if ((upV === 1 && v === 10) || (upV === 10 && v === 1)) continue;
      norm += p[v];
      const d = rec(upV + v, upV === 1 || v === 1);
      for (const k in out) out[k] += p[v] * d[k];
    }
    for (const k in out) out[k] /= norm;
    return out;
  }
  function makeEval(upV) {
    const D = dealerDist(upV);
    const stand = (t) => {
      if (t > 21) return -1;
      let ev = D.bust;
      for (const d of [17, 18, 19, 20, 21]) ev += d < t ? D[d] : d > t ? -D[d] : 0;
      return ev;
    };
    const tot = (hard, ace) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
    const memo = new Map();
    const best = (hard, ace) => {
      const t = tot(hard, ace);
      if (t > 21) return -1;
      const k = hard * 2 + (ace ? 1 : 0);
      if (memo.has(k)) return memo.get(k);
      const v = Math.max(stand(t), hit(hard, ace));
      memo.set(k, v);
      return v;
    };
    const hit = (hard, ace) => {
      let ev = 0;
      for (let v = 1; v <= 10; v++) ev += p[v] * best(hard + v, ace || v === 1);
      return ev;
    };
    const dbl = (hard, ace) => {
      let ev = 0;
      for (let v = 1; v <= 10; v++) ev += p[v] * stand(tot(hard + v, ace || v === 1));
      return 2 * ev;
    };
    const split = (x) => {
      let ev = 0;
      for (let v = 1; v <= 10; v++) {
        const hard = x + v;
        const ace = x === 1 || v === 1;
        if (x === 1) ev += p[v] * stand(tot(hard, ace));
        else {
          let b = Math.max(stand(tot(hard, ace)), hit(hard, ace));
          if (r.das) b = Math.max(b, dbl(hard, ace));
          ev += p[v] * b;
        }
      }
      return 2 * ev;
    };
    return { stand: (h, a) => stand(tot(h, a)), hit, dbl, split };
  }
  return function bestAction(hard, ace, pairV, upV, canSur) {
    const E = makeEval(upV);
    const evs = { S: E.stand(hard, ace), H: E.hit(hard, ace), D: E.dbl(hard, ace) };
    if (pairV) evs.P = E.split(pairV);
    if (canSur) evs.R = -0.5;
    let bestK = 'S';
    for (const k in evs) if (evs[k] > evs[bestK]) bestK = k;
    return { action: bestK, evs };
  };
}

function compareWithInfiniteDeck(r) {
  const best = infiniteDeckChecker(r);
  const canSur = r.surrender === 'late';
  const avail = { hit: true, stand: true, double: true, split: true, surrender: canSur };
  const diffs = [];
  for (const upV of [2, 3, 4, 5, 6, 7, 8, 9, 10, 1]) {
    const up = upV === 1 ? 11 : upV;
    for (let t = 5; t <= 19; t++) {
      const cards = BJ.twoCardHard(t, BJ.seededRng(t));
      const mine = BJ.basicDecision(cards, up, avail, r).action;
      const calc = best(t, false, null, upV, canSur).action;
      if (mine !== calc) diffs.push(`hard ${t} v ${BJ.upLabel(up)}: tabla ${mine}, EV ${calc}`);
    }
    for (let x = 2; x <= 9; x++) {
      const mine = BJ.basicDecision(hand('A', String(x)), up, avail, r).action;
      const calc = best(1 + x, true, null, upV, canSur).action;
      if (mine !== calc) diffs.push(`soft A,${x} v ${BJ.upLabel(up)}: tabla ${mine}, EV ${calc}`);
    }
    for (let x = 1; x <= 10; x++) {
      const rank = x === 1 ? 'A' : String(x);
      const mine = BJ.basicDecision(hand(rank, rank), up, avail, r).action;
      const calc = best(2 * x, x === 1, x, upV, canSur).action;
      if (mine !== calc) diffs.push(`pair ${rank},${rank} v ${BJ.upLabel(up)}: tabla ${mine}, EV ${calc}`);
    }
  }
  return diffs;
}

// Diferencias conocidas entre la estrategia de 4–8 mazos y la de mazo infinito (sin resplit en el cálculo).
const KNOWN = new Set(['soft A,4 v 4: tabla D, EV H', 'soft A,2 v 5: tabla D, EV H']);

for (const [name, rules] of [
  ['S17 DAS LS', R()],
  ['H17 DAS LS', R({ h17: true })],
  ['S17 noDAS sin rendición', R({ das: false, surrender: 'none' })],
  ['H17 noDAS sin rendición', R({ h17: true, das: false, surrender: 'none' })],
]) {
  test(`tabla coherente con cálculo de mazo infinito (${name})`, () => {
    const diffs = compareWithInfiniteDeck(rules).filter((d) => !KNOWN.has(d));
    assert.deepEqual(diffs, []);
  });
}
