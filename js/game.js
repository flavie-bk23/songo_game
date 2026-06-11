// game.js — Logique du SONGO (règles Ekang/Ewondo/Bulu)
// Référence : Serge MBARGA OWONA, "Le jeu de Songo"
//
// Plateau interne board[0..13] :
//   board[0..6]  = rangée SUD  (Joueur 1) : board[6]=case1J1(droite), board[0]=case7J1(gauche)
//   board[7..13] = rangée NORD (Joueur 2) : board[7]=case1J2(gauche J2), board[13]=case7J2(droite J2)
//
// Sens de semis :
//   J1 : gauche→droite dans son camp (board[0]→board[6]), puis droite→gauche chez J2 (board[13]→board[7])
//   J2 : droite→gauche dans son camp (board[13]→board[7]), puis gauche→droite chez J1 (board[6]→board[0])
//
// Tableau de l'article : NORD 1-2-3-4-5-6-7 / SUD 7-6-5-4-3-2-1
// → case 1 de J1 est à droite, case 7 à gauche
//
// RÈGLE DU TOUR COMPLET :
//   Si le nombre de graines est suffisant pour revenir sur la case de départ,
//   le joueur doit SAUTER cette case ET toutes les cases qui la suivent dans
//   son propre camp, puis continuer uniquement dans le camp adverse.
//   Cette règle s'applique autant de fois que nécessaire (2ème tour, 3ème tour…)

const Game = (function() {

  const CELLS = 14;
  const SEEDS_START = 5;

  let board = [];
  let scores = [0, 0];
  let currentPlayer = 1;
  let gameOver = false;
  let gameOverReason = '';
  let animating = false;

  // Anneaux de semis (index dans board[])
  // J1 : depuis son camp (gauche→droite), puis chez J2 (droite→gauche)
  // J2 : depuis son camp (droite→gauche), puis chez J1 (gauche→droite)
  const RING = {
    1: [0, 1, 2, 3, 4, 5, 6, 13, 12, 11, 10, 9, 8, 7],
    2: [13, 12, 11, 10, 9, 8, 7, 0, 1, 2, 3, 4, 5, 6]
  };

  // Indices du camp propre de chaque joueur dans l'ordre de leur anneau
  // J1 : positions 0..6 dans RING[1] = board[0..6]
  // J2 : positions 0..6 dans RING[2] = board[13..7]
  function isOwnCamp(idx, player) {
    return player === 1 ? idx < 7 : idx >= 7;
  }

  function isOppCamp(idx, player) {
    return !isOwnCamp(idx, player);
  }

  function init() {
    board = Array(CELLS).fill(SEEDS_START);
    scores = [0, 0];
    currentPlayer = 1;
    gameOver = false;
    gameOverReason = '';
    animating = false;
  }

  // Retourne la liste ordonnée des indices board où déposer les graines depuis fromIdx.
  //
  // RÈGLE DU TOUR COMPLET :
  // Quand on distribue et qu'on revient sur la case de départ (fromIdx),
  // on la saute AINSI QUE toutes les cases qui la suivent dans son propre camp.
  // On continue ensuite dans le camp adverse uniquement.
  // Cette règle se répète si on fait plusieurs tours complets.
  //
  // Concrètement :
  // - On parcourt l'anneau case après case en distribuant une graine par case
  // - À chaque fois qu'on tombe sur fromIdx ou sur une case qui suit fromIdx
  //   dans son propre camp (lors d'un 2ème passage), on saute cette case
  // - "Cases suivantes de fromIdx dans son propre camp" = les cases du propre
  //   camp dont la position dans l'anneau est >= position de fromIdx
  function getSowOrder(fromIdx, player) {
    const ring = RING[player];
    const startPos = ring.indexOf(fromIdx);
    if (startPos === -1) return [];

    const count = board[fromIdx];
    const ringLen = ring.length; // 14
    const order = [];

    // On calcule quelles positions de l'anneau doivent être sautées lors d'un retour.
    // "fromIdx et les cases suivantes dans son camp" = positions dans l'anneau
    // qui sont >= startPos ET dans le propre camp du joueur.
    // (startPos est dans son propre camp, et les suivantes jusqu'à la fin du camp)
    const skipPositions = new Set();
    for (let p = startPos; p < ringLen; p++) {
      const idx = ring[p];
      if (isOwnCamp(idx, player)) {
        skipPositions.add(p);
      } else {
        // On arrête dès qu'on arrive dans le camp adverse
        break;
      }
    }
    // skipPositions contient les positions (dans ring) à sauter lors d'un retour complet

    let i = 1; // compteur de graines distribuées
    let pos = startPos; // position actuelle dans l'anneau (avant distribution)
    let grainCount = count;
    let hasCompletedLoop = false;

    while (i <= grainCount) {
      pos = (pos + 1) % ringLen;
      const ringPos = pos; // position dans l'anneau

      if (ringPos === startPos) {
        hasCompletedLoop = true;
      }

      // Les cases du propre camp ne sont sautées qu'après un premier tour complet.
      if (hasCompletedLoop && skipPositions.has(ringPos)) {
        // On saute cette case, on n'y dépose pas de graine
        // MAIS on ne consomme pas de graine non plus
        continue;
      }

      order.push(ring[ringPos]);
      i++;
    }

    return order;
  }

  function isOpponentEmpty(player) {
    if (player === 1) return board.slice(7, 14).every(v => v === 0);
    return board.slice(0, 7).every(v => v === 0);
  }

  function countSeedsInOpponentCamp(fromIdx, player) {
    const order = getSowOrder(fromIdx, player);
    return order.filter(idx => isOppCamp(idx, player)).length;
  }

  function getSolidarityMove(player) {
    const myCases = player === 1 ? [0,1,2,3,4,5,6] : [7,8,9,10,11,12,13];
    let bestIdx = -1, bestCount = -1;
    for (const idx of myCases) {
      if (board[idx] === 0) continue;
      const cnt = countSeedsInOpponentCamp(idx, player);
      if (cnt > bestCount) { bestCount = cnt; bestIdx = idx; }
    }
    return { idx: bestIdx, count: bestCount };
  }

  // Case 7 de chaque joueur : interdit de semer 1 ou 2 graines chez l'adverse
  function wouldSow1or2FromCase7(fromIdx, player) {
    const case7 = player === 1 ? 0 : 13;
    if (fromIdx !== case7) return false;
    const cnt = countSeedsInOpponentCamp(fromIdx, player);
    return cnt === 1 || cnt === 2;
  }

  // Applique les captures en chaîne depuis lastIdx vers l'arrière dans l'anneau
  function applyCaptures(b, lastIdx, player, sc) {
    const ring = RING[player];
    const isOppSide = isOppCamp(lastIdx, player);
    if (!isOppSide) return;

    const oppCase1 = player === 1 ? 7 : 6;
    let pos = ring.indexOf(lastIdx);

    // La dernière case : pas de capture directe si c'est la case n°1 adverse
    if (lastIdx === oppCase1) return;

    while (pos >= 0) {
      const idx = ring[pos];
      const isOpp = isOppCamp(idx, player);
      if (!isOpp) break;
      const cnt = b[idx];
      if (cnt < 2 || cnt > 3) break;
      sc[player - 1] += cnt;
      b[idx] = 0;
      pos--;
    }
  }

  // Vérifie si le coup viderait complètement le camp adverse (interdit)
  function wouldEmptyOpponent(fromIdx, player) {
    const order = getSowOrder(fromIdx, player);
    const tmpB = [...board];
    tmpB[fromIdx] = 0;
    for (const idx of order) tmpB[idx]++;

    const lastIdx = order[order.length - 1];
    const isOppSide = isOppCamp(lastIdx, player);
    if (!isOppSide) return false;

    const tmpSc = [...scores];
    applyCaptures(tmpB, lastIdx, player, tmpSc);

    if (player === 1) return tmpB.slice(7, 14).every(v => v === 0);
    return tmpB.slice(0, 7).every(v => v === 0);
  }

  function sow(fromIdx, onStep, onDone) {
    if (animating || gameOver) return false;
    if (board[fromIdx] === 0) return false;
    if (currentPlayer === 1 && fromIdx >= 7) return false;
    if (currentPlayer === 2 && fromIdx < 7) return false;

    const oppEmpty = isOpponentEmpty(currentPlayer);

    if (oppEmpty) {
      const solidMove = getSolidarityMove(currentPlayer);
      if (solidMove.count <= 0) {
        endGame('solidarity_impossible');
        if (onDone) onDone({ replay: false, gameOver: true, winner: getWinner() });
        return true;
      }
      const target = Math.min(solidMove.count, 7);
      if (countSeedsInOpponentCamp(fromIdx, currentPlayer) < target) return false;
    }

    if (wouldSow1or2FromCase7(fromIdx, currentPlayer)) return false;
    const willEmpty = wouldEmptyOpponent(fromIdx, currentPlayer);

    animating = true;
    const order = getSowOrder(fromIdx, currentPlayer);
    const player = currentPlayer;
    board[fromIdx] = 0;

    let step = 0;
    function doStep() {
      if (step >= order.length) {
        const lastIdx = order[order.length - 1];
        const isOppSide = isOppCamp(lastIdx, player);

        if (isOppSide && !willEmpty) {
          const cnt = board[lastIdx];
          const oppCase1 = player === 1 ? 7 : 6;

          if (cnt >= 2 && cnt <= 4 && lastIdx !== oppCase1) {
            applyCaptures(board, lastIdx, player, scores);
          }

          // Tour complet + fin sur case n°1 adverse → capture 1 graine seulement
          if (order.length >= 13 && lastIdx === oppCase1 && cnt > 0) {
            scores[player - 1] += 1;
            board[lastIdx] = Math.max(0, board[lastIdx] - 1);
          }
        }

        currentPlayer = currentPlayer === 1 ? 2 : 1;
        checkGameOver();
        animating = false;
        if (onDone) onDone({ replay: false, gameOver, winner: getWinner() });
        return;
      }

      const pos = order[step];
      board[pos]++;
      if (onStep) onStep({ type: 'seed', pos, step, total: order.length });
      step++;
      setTimeout(doStep, 160);
    }

    doStep();
    return true;
  }

  function endGame(reason) {
    gameOverReason = reason;
    for (let i = 0; i < 7; i++)  { scores[0] += board[i]; board[i] = 0; }
    for (let i = 7; i < 14; i++) { scores[1] += board[i]; board[i] = 0; }
    gameOver = true;
  }

  function checkGameOver() {
    if (scores[0] >= 40 || scores[1] >= 40) { endGame('score_40'); return; }
    const totalOnBoard = board.reduce((a, b) => a + b, 0);
    if (totalOnBoard < 10) { endGame('less_than_10'); return; }
    if (getValidMoves(currentPlayer).length === 0) { endGame('no_valid_moves'); return; }
    if (isOpponentEmpty(currentPlayer)) {
      const solid = getSolidarityMove(currentPlayer);
      if (solid.count <= 0) { endGame('solidarity_impossible'); }
    }
  }

  function getWinner() {
    if (!gameOver) return null;
    if (scores[0] >= 40) return 1;
    if (scores[1] >= 40) return 2;
    if (scores[0] > scores[1]) return 1;
    if (scores[1] > scores[0]) return 2;
    return 0;
  }

  function getValidMoves(player) {
    const myCases = player === 1 ? [0,1,2,3,4,5,6] : [7,8,9,10,11,12,13];
    const oppEmpty = isOpponentEmpty(player);

    if (oppEmpty) {
      const solidMove = getSolidarityMove(player);
      if (solidMove.count <= 0) return [];
      const target = Math.min(solidMove.count, 7);
      return myCases.filter(idx => board[idx] > 0 && countSeedsInOpponentCamp(idx, player) >= target);
    }

    return myCases.filter(idx => {
      if (board[idx] === 0) return false;
      if (wouldSow1or2FromCase7(idx, player)) return false;
      return true;
    });
  }

  function loadState(state) {
    if (!state) return;
    board = Array.isArray(state.board) ? [...state.board] : [];
    scores = Array.isArray(state.scores || state.stores) ? [...(state.scores || state.stores)] : [0, 0];
    currentPlayer = Number(state.currentPlayer) || 1;
    gameOver = Boolean(state.gameOver);
    gameOverReason = state.gameOverReason || '';
    animating = false;
  }

  function getState() {
    return {
      board: [...board],
      scores: [...scores],
      stores: [...scores], // alias pour compatibilité three_board.js
      currentPlayer,
      gameOver,
      gameOverReason,
      winner: getWinner(),
      validMoves: getValidMoves(currentPlayer)
    };
  }

  return { init, sow, getState, loadState, getValidMoves, getSowOrder };
})();
