/*
 * Seis Mazos — el porqué de cada jugada, en palabras.
 * Usa BJ (engine.js). Funciona en el navegador (window.BJX) y en Node (require).
 * Los porcentajes son de mazo infinito (6 mazos da casi lo mismo) y, con 10 o As,
 * suponen que el crupier ya revisó y no tiene blackjack.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BJX = factory(root.BJ);
})(typeof self !== 'undefined' ? self : this, function (BJ) {
  'use strict';

  // Qué tan seguido se pasa el crupier según su carta visible.
  const DEALER_BUST = {
    s17: { 2: 35, 3: 37, 4: 39, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 23, 11: 17 },
    h17: { 2: 36, 3: 38, 4: 40, 5: 42, 6: 44, 7: 26, 8: 24, 9: 23, 10: 23, 11: 20 },
  };
  function dealerBust(up, r) {
    return DEALER_BUST[r && r.h17 ? 'h17' : 's17'][up];
  }
  // Probabilidad de pasarte si pides una carta con un total duro (12 → 31 %, 16 → 62 %).
  function playerBust(total) {
    if (total <= 11) return 0;
    if (total >= 21) return 100;
    return Math.round(((total - 8) / 13) * 100);
  }
  const up = (u) => (u === 11 ? 'el As' : `el ${u}`);
  const Up = (u) => (u === 11 ? 'El As' : `El ${u}`);
  const weak = (u) => u <= 6;

  function hardWhy(t, u, code, r) {
    const B = dealerBust(u, r);
    if (code === 'Rh' || code === 'Rs' || code === 'R') {
      const start =
        t === 17
          ? `Con H17 ${up(u)} llega a 18–21 muy seguido y tu 17 casi nunca gana.`
          : `Si pides con ${t} te pasas ${playerBust(t)}%, y si te plantas ${up(u)} casi siempre te gana (solo se pasa ${B}%).`;
      return `${start} En promedio esta mano pierde más de media apuesta; rendirte cuesta justo la mitad, así que pierdes menos.`;
    }
    if (t >= 18) return `${t} es buena mano y pedir te pasaría ${playerBust(t)}% de las veces: plántate.`;
    if (t === 17) return `17 no es gran mano, pero si pides te pasas ${playerBust(17)}% de las veces: plántate.`;
    if (t >= 12 && weak(u) && !(t === 12 && u <= 3))
      return `${Up(u)} es carta débil: el crupier se pasa ${B}% de las veces. Si pides con ${t} te pasas ${playerBust(t)}%, así que plántate y deja que él se arriesgue.`;
    if (t === 12 && u <= 3)
      return `Con 12 solo te pasas si te llega un 10 (${playerBust(12)}%), y ${up(u)} no se pasa tanto (${B}%): pedir sale un poco mejor que plantarse.`;
    if (t >= 12)
      return `${Up(u)} es carta fuerte: el crupier termina entre 17 y 21 el ${100 - B}% de las veces, así que plantarte con ${t} casi siempre pierde. Pidiendo te pasas ${playerBust(t)}%, pero si no te pasas todavía puedes ganar.`;
    if (t === 11) {
      if (code === 'D')
        return u === 11
          ? `Con H17 el As se pasa un poco más (${B}%), y eso basta para que doblar 11 convenga: cualquier 10 te da 21.`
          : `Con 11, cualquier 10 (casi 1 de cada 3 cartas) te da 21 y ninguna carta te pasa. Contra ${up(u)} vas con ventaja: dobla para apostar más cuando vas ganando.`;
      return `Contra el As (solo se pasa ${B}%) la ventaja con 11 no alcanza para doblar con S17: pide.`;
    }
    if (t === 10)
      return code === 'D'
        ? `Con 10, un 10 o un As te deja en 20 o 21. Contra ${up(u)} vas con ventaja: dobla para apostar más.`
        : `${Up(u)} del crupier ${u === 11 ? 'es más fuerte que' : 'empata con'} tu 10: no tienes ventaja para meter más dinero. Pide.`;
    if (t === 9) {
      if (code === 'D') return `Contra ${up(u)}, que se pasa ${B}%, tu 9 ya va con ventaja: dobla para aprovecharla.`;
      return u === 2
        ? `Contra el 2 la ventaja con 9 es mínima y no alcanza para doblar: pide.`
        : `Contra ${up(u)}, 9 no tiene suficiente ventaja para doblar: pide.`;
    }
    return `Con ${t} ninguna carta te pasa y plantarte casi siempre pierde: siempre pide.`;
  }

  function softWhy(t, u, code, r) {
    const B = dealerBust(u, r);
    const safe = 'con una carta no te puedes pasar (el As vuelve a valer 1)';
    if (t >= 20) return `Blando ${t} es mano fuerte: plántate.`;
    if (t === 19)
      return code === 'Ds'
        ? `Con H17 el 6 se pasa ${B}%: doblar blando 19 gana más, y ${safe}.`
        : 'Blando 19 es mano fuerte: plántate.';
    if (t === 18) {
      if (code === 'Ds') return `Contra ${up(u)}, que se pasa ${B}%, blando 18 rinde más doblando: ${safe}.`;
      if (code === 'S')
        return u === 2
          ? `Contra el 2 con S17, blando 18 ya gana bastante y doblar no alcanza a convenir: plántate.`
          : `Blando 18 le gana o empata a lo que suele sacar ${up(u)} (17 o 18): plántate.`;
      return `Contra ${up(u)} el crupier suele llegar a 19 o 20 y tu 18 pierde seguido. Al pedir no te puedes pasar, así que pide para mejorar.`;
    }
    if (t === 12) return 'Blando 12: al pedir no te puedes pasar. Pide.';
    if (code === 'D')
      return `Blando ${t} es mano floja, pero ${safe}. Contra ${up(u)}, que se pasa ${B}%, doblar aprovecha su debilidad.`;
    return `Blando ${t} es mano floja (plantado casi nunca gana) y al pedir no te puedes pasar: pide.`;
  }

  function pairWhy(v, u, code, r, action) {
    const B = dealerBust(u, r);
    if (code === 'Rp' && action === 'P') code = 'P'; // no se puede rendir: separar
    const split = code === 'P' || (code === 'Ph' && r.das);
    if (v === 11) return 'Juntos, dos Ases son solo 12. Separados, cada As llega a 21 con cualquier 10 (casi 1 de cada 3 cartas): siempre separa.';
    if (v === 10)
      return `20 gana casi siempre. Separar cambiaría una mano casi ganada por dos manos que empiezan en 10: plántate.`;
    if (v === 8) {
      if (code === 'Rp')
        return 'Con H17, 8,8 contra el As pierde tanto que aun separando pierdes más de media apuesta: rendirte cuesta menos.';
      return '16 es la peor mano del juego. Separando, cada 8 empieza una mano nueva desde 8, que es mucho mejor que tener 16.';
    }
    if (v === 9) {
      if (split) {
        if (weak(u)) return `Contra ${up(u)}, que se pasa ${B}%, conviene tener dos manos (y el doble de dinero) en la mesa.`;
        if (u === 8) return 'Contra el 8 el crupier suele hacer 18 y tu 18 solo empata: dos manos desde 9 ganan más.';
        return 'Contra el 9 el crupier suele hacer 19 y tu 18 pierde: dos manos desde 9 ganan más.';
      }
      if (u === 7) return 'El 7 suele terminar en 17 y tu 18 le gana: plántate.';
      return `Contra ${up(u)} tu 18 a veces pierde, pero dos manos desde 9 serían peores: plántate.`;
    }
    if (v === 5) return 'Un par de 5 es un 10 duro: juégalo como 10 y no lo separes (dos manos desde 5 son malas).';
    const das = code === 'Ph' ? ' (sobre todo porque con DAS puedes doblar después de separar)' : '';
    if (split) {
      if (v === 4) return `Contra ${up(u)} el crupier se pasa ${B}%, y con DAS puedes doblar cada mano después de separar: vale meter más dinero.`;
      return `${v + v} es mala mano. Contra ${up(u)}${weak(u) ? `, que se pasa ${B}%,` : ''} dos manos que empiezan en ${v} ganan más${das}.`;
    }
    if (code === 'Ph') return `Sin DAS no puedes doblar después de separar, y así separar ${v},${v} contra ${up(u)} ya no conviene: juega el ${v + v}.`;
    if (v === 4) return 'Un 8 es mejor que dos manos que empiezan en 4: pide.';
    return `Contra ${up(u)}, separar pondría dos manos flojas contra una carta fuerte: mejor juega el ${v + v}.`;
  }

  /*
   * Porqué de la estrategia básica.
   * basic: lo que devuelve BJ.basicDecision. canSplit: si separar era posible.
   */
  function basicWhy(cards, u, r, basic, canSplit) {
    if (canSplit && BJ.isPair(cards)) {
      const v = cards[0].v === 1 ? 11 : cards[0].v;
      return pairWhy(v, u, BJ.pairCode(v, u, r), r, basic && basic.action);
    }
    const hv = BJ.handValue(cards);
    if (hv.soft) return softWhy(hv.total, u, BJ.softCode(hv.total, u, r), r);
    // Con 3 cartas o más ya no se puede rendir ni doblar: se explica la jugada que queda.
    let code = BJ.hardCode(hv.total, u, r);
    if (basic && /^R/.test(code) && basic.action !== 'R') code = basic.action;
    return hardWhy(hv.total, u, code, r);
  }

  // Porqué de una desviación: qué cambia cuando el true count pasa (o no) el índice.
  function deviationWhy(dev, applies, cardsTotal) {
    const t = dev.total || cardsTotal;
    const u = dev.up;
    const cond = applies ? `Con TC ${idxText(dev.index)} o más` : `Con TC menor a ${idxText(dev.index)}`;
    switch (dev.kind) {
      case 'ins':
        return applies
          ? `${cond}, más de 1 de cada 3 cartas que quedan es 10, y el seguro (que paga 2 a 1) ya gana dinero.`
          : `El seguro paga 2 a 1, así que solo gana si más de 1 de cada 3 cartas que quedan es 10. Normalmente son 4 de cada 13 (31%): pierde dinero. Hace falta TC +3 o más.`;
      case 'sur':
        return applies
          ? `${cond} quedan suficientes cartas altas: al pedir te pasas más y el crupier hace mano más seguido, así que rendirte pierde menos.`
          : `${cond} quedan suficientes cartas bajas para que pedir con ${t} contra ${up(u)} pierda menos que regalar media apuesta.`;
      case 'pair':
        return applies
          ? `${cond}, ${up(u)} se pasa tanto que conviene separar los 10 y tener el doble de dinero en la mesa.`
          : `${cond}, tu 20 ya es mano casi ganada: no la rompas.`;
      default:
        if (dev.above === 'D')
          return applies
            ? `${cond} quedan suficientes cartas altas para que tu ${t} saque buena carta: ya vale doblar contra ${up(u)}.`
            : `${cond} no hay suficientes cartas altas para que doblar ${t} contra ${up(u)} convenga: solo pide.`;
        return applies
          ? `${cond}, las cartas altas que quedan hacen que pedir con ${t} te pase demasiado (y ${up(u)} se pasa más): plántate.`
          : `${cond} quedan suficientes cartas bajas para que pedir con ${t} contra ${up(u)} convenga.`;
    }
  }

  function idxText(n) {
    return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  }

  const GROUP_NAME = { I18: 'Ilustres 18', Fab4: 'Fab 4' };

  return { dealerBust, playerBust, basicWhy, deviationWhy, idxText, GROUP_NAME };
});
