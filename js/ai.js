// ai.js — Moteurs IA pour Songo (5 niveaux de difficulté)
// Niveaux : très facile | facile | moyen | difficile | expert
//
// Chaque niveau retourne l'index du coup choisi par la machine.
// Tous les modules reçoivent : (validMoves, board, stores, getSowOrder, simulateMove)

const SongoAI = (function () {

  // ─── Utilitaires ─────────────────────────────────────────────────────────

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Simule un coup pour J2 (machine) : retourne { board, stores, captureGained, lastIdx, order }
  function simulateMove(idx, boardIn, storesIn, getSowOrder) {
    const b = [...boardIn];
    const sc = [...storesIn];
    const order = getSowOrder(idx, 2);
    b[idx] = 0;
    for (const pos of order) b[pos]++;

    const lastIdx = order[order.length - 1];
    const isOppSide = lastIdx < 7;

    let captureGained = 0;
    if (isOppSide) {
      const oppCase1 = 6;
      if (lastIdx !== oppCase1) {
        let ringJ2 = [13,12,11,10,9,8,7,0,1,2,3,4,5,6];
        let rpos = ringJ2.indexOf(lastIdx);
        while (rpos >= 0) {
          const ci = ringJ2[rpos];
          if (ci >= 7) break;
          const cnt = b[ci];
          if (cnt < 2 || cnt > 3) break;
          captureGained += cnt;
          b[ci] = 0;
          rpos--;
        }
        sc[1] += captureGained;
      }
      if (order.length >= 13 && lastIdx === oppCase1 && b[oppCase1] > 0) {
        captureGained += 1;
        sc[1] += 1;
        b[oppCase1] = Math.max(0, b[oppCase1] - 1);
      }
    }

    return { board: b, stores: sc, captureGained, lastIdx, order };
  }

  // Simule un coup pour J1 (humain) : retourne { board, stores, captureGained, lastIdx }
  function simulateMoveJ1(idx, boardIn, storesIn) {
    const b = [...boardIn];
    const sc = [...storesIn];
    // RING J1 : 0→1→2→3→4→5→6→13→12→11→10→9→8→7
    const RING1 = [0,1,2,3,4,5,6,13,12,11,10,9,8,7];
    const startPos = RING1.indexOf(idx);
    if (startPos === -1) return { board: b, stores: sc, captureGained: 0, lastIdx: idx };
    const count = b[idx];
    b[idx] = 0;
    const order = [];
    let pos = startPos;
    for (let k = 0; k < count; k++) {
      pos = (pos + 1) % 14;
      const cell = RING1[pos];
      // Skip la case de départ si tour complet
      if (cell === idx && count >= 13) { k--; continue; }
      order.push(cell);
      b[cell]++;
    }
    if (order.length === 0) return { board: b, stores: sc, captureGained: 0, lastIdx: idx };
    const lastIdx = order[order.length - 1];
    const isOppSide = lastIdx >= 7 && lastIdx <= 13;

    let captureGained = 0;
    if (isOppSide) {
      const ringCapture = [0,1,2,3,4,5,6,13,12,11,10,9,8,7];
      let rpos = ringCapture.indexOf(lastIdx);
      while (rpos >= 0) {
        const ci = ringCapture[rpos];
        if (ci < 7) break;
        const cnt = b[ci];
        if (cnt < 2 || cnt > 3) break;
        captureGained += cnt;
        b[ci] = 0;
        rpos--;
      }
      sc[0] += captureGained;
    }
    return { board: b, stores: sc, captureGained, lastIdx };
  }

  // ─── Heuristique expert ──────────────────────────────────────────────────
  // Évalue l'état du plateau du point de vue de J2 (machine)

  function evaluate(b, sc) {
    let score = 0;

    // 1. Différence de score (priorité absolue)
    score += (sc[1] - sc[0]) * 18;

    // 2. Graines dans le camp adverse prêtes à capturer (2 ou 3)
    for (let i = 0; i < 7; i++) {
      if (b[i] === 2 || b[i] === 3) score += 5;
      else if (b[i] === 1)          score -= 2;  // pas capturable, mauvais
      else if (b[i] >= 4)           score += 1;  // neutre, peut être bon
    }

    // 3. Mobilité : nombre de coups disponibles pour J2
    let j2Moves = 0;
    for (let i = 7; i <= 13; i++) if (b[i] > 0) j2Moves++;
    let j1Moves = 0;
    for (let i = 0; i < 7; i++) if (b[i] > 0) j1Moves++;
    score += (j2Moves - j1Moves) * 1.5;

    // 4. Contrôle de la densité dans son camp (évite de se vider)
    const ownTotal = b.slice(7, 14).reduce((a, v) => a + v, 0);
    const oppTotal = b.slice(0, 7).reduce((a, v) => a + v, 0);
    score += (ownTotal - oppTotal) * 0.5;

    // 5. Bonus cases avec beaucoup de graines (potentiel futur)
    for (let i = 7; i <= 13; i++) {
      if (b[i] >= 7) score += 2; // case riche = menace future
    }

    // 6. Pénalité si J1 est proche de gagner
    if (sc[0] >= 35) score -= (sc[0] - 34) * 12;
    if (sc[1] >= 35) score += (sc[1] - 34) * 12;

    return score;
  }

  // ─── Alpha-Beta Minimax profondeur 3 ────────────────────────────────────
  // maximizing=true => c'est le tour de J2 (machine)

  function alphaBeta(board, stores, depth, alpha, beta, maximizing, getSowOrder) {
    // Condition terminale
    if (depth === 0) return evaluate(board, stores);

    const totalSeeds = board.reduce((a, v) => a + v, 0);
    if (totalSeeds < 8) return evaluate(board, stores);

    if (maximizing) {
      // J2 joue (machine)
      const moves = [];
      for (let i = 7; i <= 13; i++) if (board[i] > 0) moves.push(i);
      if (moves.length === 0) return evaluate(board, stores);

      // Ordre des coups : capturer en premier (meilleure élagage)
      moves.sort((a, b_) => {
        const ra = simulateMove(a, board, stores, getSowOrder);
        const rb = simulateMove(b_, board, stores, getSowOrder);
        return rb.captureGained - ra.captureGained;
      });

      let maxVal = -Infinity;
      for (const m of moves) {
        const { board: nb, stores: ns } = simulateMove(m, board, stores, getSowOrder);
        const val = alphaBeta(nb, ns, depth - 1, alpha, beta, false, getSowOrder);
        if (val > maxVal) maxVal = val;
        if (val > alpha) alpha = val;
        if (beta <= alpha) break; // élagage beta
      }
      return maxVal;
    } else {
      // J1 joue (humain) — minimise notre score
      const moves = [];
      for (let i = 0; i < 7; i++) if (board[i] > 0) moves.push(i);
      if (moves.length === 0) return evaluate(board, stores);

      // Ordre : J1 capture en premier (pire pour nous)
      moves.sort((a, b_) => {
        const ra = simulateMoveJ1(a, board, stores);
        const rb = simulateMoveJ1(b_, board, stores);
        return rb.captureGained - ra.captureGained;
      });

      let minVal = Infinity;
      for (const m of moves) {
        const { board: nb, stores: ns } = simulateMoveJ1(m, board, stores);
        const val = alphaBeta(nb, ns, depth - 1, alpha, beta, true, getSowOrder);
        if (val < minVal) minVal = val;
        if (val < beta) beta = val;
        if (beta <= alpha) break; // élagage alpha
      }
      return minVal;
    }
  }

  // ─── Niveau 1 : Très facile ───────────────────────────────────────────────
  function tresFacile(validMoves) {
    return rand(validMoves);
  }

  // ─── Niveau 2 : Facile ────────────────────────────────────────────────────
  function facile(validMoves, board) {
    if (Math.random() < 0.70) return rand(validMoves);
    let best = validMoves[0];
    for (const m of validMoves) {
      if (board[m] > board[best]) best = m;
    }
    return best;
  }

  // ─── Niveau 3 : Moyen ─────────────────────────────────────────────────────
  function moyen(validMoves, board, stores, getSowOrder) {
    if (Math.random() < 0.15) return rand(validMoves);
    let bestIdx = validMoves[0];
    let bestScore = -Infinity;
    for (const m of validMoves) {
      const { captureGained, order, lastIdx, board: b, stores: sc } =
        simulateMove(m, board, stores, getSowOrder);
      let score = captureGained * 8;
      score += order.filter(i => i < 7).length * 1.5;
      if (b[lastIdx] === 2 || b[lastIdx] === 3) score += 4;
      if (score > bestScore) { bestScore = score; bestIdx = m; }
    }
    return bestIdx;
  }

  // ─── Niveau 4 : Difficile ─────────────────────────────────────────────────
  // Alpha-Beta profondeur 2
  function difficile(validMoves, board, stores, getSowOrder) {
    let bestIdx = validMoves[0];
    let bestScore = -Infinity;

    // Ordre : captures d'abord
    const sorted = [...validMoves].sort((a, b_) => {
      const ra = simulateMove(a, board, stores, getSowOrder);
      const rb = simulateMove(b_, board, stores, getSowOrder);
      return rb.captureGained - ra.captureGained;
    });

    for (const m of sorted) {
      const { board: nb, stores: ns } = simulateMove(m, board, stores, getSowOrder);
      const score = alphaBeta(nb, ns, 2, -Infinity, Infinity, false, getSowOrder);
      if (score > bestScore) { bestScore = score; bestIdx = m; }
    }
    return bestIdx;
  }

  // ─── Niveau 5 : Expert ────────────────────────────────────────────────────
  // Alpha-Beta profondeur 4 + aucune imperfection intentionnelle
  // Stratégie : capture immédiate forcée si score > seuil, sinon AB complet
  function expert(validMoves, board, stores, getSowOrder) {
    // Vérification capture immédiate critique (>= 4 graines capturées) — jouer sans hésiter
    for (const m of validMoves) {
      const { captureGained } = simulateMove(m, board, stores, getSowOrder);
      if (captureGained >= 4) {
        // Vérifie qu'il n'y a pas un meilleur coup encore (double capture)
        let maxCapture = captureGained;
        let bestCaptureMove = m;
        for (const m2 of validMoves) {
          const { captureGained: c2 } = simulateMove(m2, board, stores, getSowOrder);
          if (c2 > maxCapture) { maxCapture = c2; bestCaptureMove = m2; }
        }
        // Si la capture dépasse 5 graines, on joue immédiatement sans calcul AB
        if (maxCapture >= 6) return bestCaptureMove;
      }
    }

    // Alpha-Beta profondeur 4
    let bestIdx = validMoves[0];
    let bestScore = -Infinity;

    // Ordre des coups : captures puis graines riches
    const sorted = [...validMoves].sort((a, b_) => {
      const ra = simulateMove(a, board, stores, getSowOrder);
      const rb = simulateMove(b_, board, stores, getSowOrder);
      if (rb.captureGained !== ra.captureGained) return rb.captureGained - ra.captureGained;
      return board[b_] - board[a];
    });

    for (const m of sorted) {
      const { board: nb, stores: ns } = simulateMove(m, board, stores, getSowOrder);
      const score = alphaBeta(nb, ns, 4, -Infinity, Infinity, false, getSowOrder);
      if (score > bestScore) { bestScore = score; bestIdx = m; }
    }

    return bestIdx;
  }

  // ─── Interface publique ──────────────────────────────────────────────────

  const THINK_DELAY = {
    'tres-facile': 400,
    'facile':      550,
    'moyen':       750,
    'difficile':   1200,
    'expert':      1800
  };

  const THINK_MSG = {
    'tres-facile': 'La machine réfléchit...',
    'facile':      'La machine réfléchit...',
    'moyen':       'La machine analyse...',
    'difficile':   'La machine calcule...',
    'expert':      'La machine étudie chaque possibilité...'
  };

  function chooseMove(level, validMoves, board, stores, getSowOrder) {
    switch (level) {
      case 'tres-facile': return tresFacile(validMoves);
      case 'facile':      return facile(validMoves, board);
      case 'moyen':       return moyen(validMoves, board, stores, getSowOrder);
      case 'difficile':   return difficile(validMoves, board, stores, getSowOrder);
      case 'expert':      return expert(validMoves, board, stores, getSowOrder);
      default:            return rand(validMoves);
    }
  }

  return { chooseMove, THINK_DELAY, THINK_MSG };

})();
