// main.js — Contrôleur principal
(function() {

  Game.init();

  let gameMode       = 'human';     // 'human' | 'machine' | 'shared'
  let aiLevel        = 'moyen';     // niveau IA courant
  let machineMenuOpen = false;
  let multiplayer = {
    active: false,
    roomId: null,
    channel: null,
    localPlayer: 1,
    role: 'host'
  };
  let remoteSession = {
    active: false,
    roomId: null,
    localPlayer: 1,
    role: 'host',
    pollTimer: null,
    lastPushedStateKey: '',
    lastAppliedStateKey: '',
    lastAppliedVersion: 0,
    lastAppliedTimestamp: 0,
    stateVersion: 0,
    channel: null
  };

  const canvas = document.getElementById('three-canvas');
  ThreeBoard.init(canvas, onCellClick);

  updateUI();

  // ─── Navigation menu ──────────────────────────────────────────────────────

  window.showMenuScreen = function() {
    document.getElementById('menu-screen').style.display = 'flex';
    document.getElementById('difficulty-badge').classList.remove('visible');
  };

  function getMultiplayerTabId() {
    let tabId = window.sessionStorage.getItem('songo-multiplayer-tab-id');
    if (!tabId) {
      tabId = 'tab-' + Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem('songo-multiplayer-tab-id', tabId);
    }
    return tabId;
  }

  function clearSharedMultiplayerStorage() {
    window.localStorage.removeItem('songo-multiplayer-room');
    window.sessionStorage.removeItem('songo-multiplayer-role');
  }

  function buildRemoteStatePayload(state) {
    const nextState = state || Game.getState();
    const fingerprint = JSON.stringify({
      board: nextState.board,
      scores: nextState.scores,
      stores: nextState.stores,
      currentPlayer: nextState.currentPlayer,
      gameOver: nextState.gameOver,
      winner: nextState.winner,
      validMoves: nextState.validMoves
    });
    if (remoteSession.lastPushedStateKey === fingerprint) {
      return null;
    }
    remoteSession.lastPushedStateKey = fingerprint;
    remoteSession.stateVersion += 1;
    const version = remoteSession.stateVersion;
    const timestamp = Date.now();
    return {
      version,
      timestamp,
      state: {
        ...nextState,
        _meta: { version, timestamp, source: remoteSession.role }
      }
    };
  }

  function applyRemoteStatePayload(payload) {
    if (!payload || !payload.state) return false;
    const state = payload.state;
    const meta = state && state._meta ? state._meta : {};
    const version = Number(meta.version) || 0;
    const timestamp = Number(meta.timestamp) || 0;
    const fingerprint = JSON.stringify({
      board: state.board,
      scores: state.scores,
      stores: state.stores,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      validMoves: state.validMoves
    });
    const isNewer = !remoteSession.lastAppliedVersion
      || version > remoteSession.lastAppliedVersion
      || (version === remoteSession.lastAppliedVersion && timestamp > remoteSession.lastAppliedTimestamp);
    if (!isNewer && remoteSession.lastAppliedStateKey) {
      return false;
    }
    if (remoteSession.lastAppliedStateKey === fingerprint && remoteSession.lastAppliedVersion === version) {
      return false;
    }
    remoteSession.lastAppliedStateKey = fingerprint;
    remoteSession.lastAppliedVersion = version;
    remoteSession.lastAppliedTimestamp = timestamp;
    remoteSession.stateVersion = Math.max(remoteSession.stateVersion, version);
    Game.loadState(state);
    const s = Game.getState();
    ThreeBoard.refreshSeeds(s.board, s.stores);
    updateUI();
    if (s.gameOver) showWin(s.winner);
    return true;
  }

  function setupRemoteChannel(roomId) {
    if (remoteSession.channel) {
      try { remoteSession.channel.close(); } catch (_) {}
    }
    remoteSession.channel = new BroadcastChannel('songo-remote-room-' + roomId);
    remoteSession.channel.onmessage = function(event) {
      const data = event.data || {};
      if (data.type !== 'remote-state') return;
      applyRemoteStatePayload(data.payload);
    };
  }

  function broadcastRemoteStatePayload(payload) {
    if (!remoteSession.active || !remoteSession.channel || !payload) return;
    remoteSession.channel.postMessage({ type: 'remote-state', payload });
  }

  window.startTwoPlayers = function() {
    const roomKey = 'songo-multiplayer-room';
    const existingRoomRaw = window.localStorage.getItem(roomKey);
    const existingRoom = existingRoomRaw ? JSON.parse(existingRoomRaw) : null;
    const tabId = getMultiplayerTabId();
    const isCurrentHost = existingRoom && existingRoom.hostTabId === tabId;

    if (existingRoom && existingRoom.roomId && !isCurrentHost) {
      multiplayer.active = true;
      multiplayer.roomId = existingRoom.roomId;
      multiplayer.role = 'guest';
      multiplayer.localPlayer = 2;
      startSharedMultiplayerSession(multiplayer.roomId, multiplayer.role);
      return;
    }

    const roomId = existingRoom && existingRoom.roomId ? existingRoom.roomId : (Math.random().toString(36).slice(2, 8).toUpperCase());
    window.localStorage.setItem(roomKey, JSON.stringify({ roomId, hostTabId: tabId }));
    window.sessionStorage.setItem('songo-multiplayer-role', 'host');

    multiplayer.active = true;
    multiplayer.roomId = roomId;
    multiplayer.role = 'host';
    multiplayer.localPlayer = 1;
    startSharedMultiplayerSession(roomId, 'host');
  };

  /* ── Panneau salle en ligne ── */
  window.openRoomPanel = function() {
    const overlay = document.getElementById('room-panel-overlay');
    overlay.classList.add('visible');
    document.getElementById('room-action-choice').style.display = 'flex';
    document.getElementById('room-create-zone').style.display = 'none';
    document.getElementById('room-join-zone').style.display = 'none';
    document.getElementById('room-code-display').textContent = '—';
    document.getElementById('room-code-input').value = '';
    setRoomMsg('');
    document.querySelectorAll('.room-action-btn').forEach(function(b) { b.classList.remove('selected'); });
  };

  window.closeRoomPanel = function(evt) {
    if (evt && evt.target !== document.getElementById('room-panel-overlay')) return;
    document.getElementById('room-panel-overlay').classList.remove('visible');
  };

  window.selectRoomAction = function(action) {
    document.querySelectorAll('.room-action-btn').forEach(function(b) { b.classList.remove('selected'); });
    document.getElementById(action === 'create' ? 'btn-create-room' : 'btn-join-room').classList.add('selected');
    if (action === 'create') {
      const code = 'SONGO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      document.getElementById('room-code-display').textContent = code;
      document.getElementById('room-create-zone').style.display = 'flex';
      document.getElementById('room-join-zone').style.display = 'none';
    } else {
      document.getElementById('room-join-zone').style.display = 'flex';
      document.getElementById('room-create-zone').style.display = 'none';
      setTimeout(function() { document.getElementById('room-code-input').focus(); }, 50);
    }
    setRoomMsg('');
  };

  function setRoomMsg(msg, type) {
    const el = document.getElementById('room-panel-msg');
    el.textContent = msg || '';
    el.className = type || '';
  }

  function launchRemoteSession(roomId, action) {
    gameMode = 'remote';
    aiLevel = null;
    document.getElementById('room-panel-overlay').classList.remove('visible');
    hideMenuScreen();
    resetGame(false);
    document.getElementById('difficulty-badge').classList.remove('visible');
    document.getElementById('score-j2').querySelector('.player-label').textContent = 'Joueur 2';
    if (machineMenuOpen) closeMachineMenu();

    if (remoteSession.pollTimer) {
      window.clearInterval(remoteSession.pollTimer);
    }

    remoteSession.active = true;
    remoteSession.roomId = roomId;
    remoteSession.lastPushedStateKey = '';
    remoteSession.lastAppliedStateKey = '';
    remoteSession.lastAppliedVersion = 0;
    remoteSession.lastAppliedTimestamp = 0;
    remoteSession.stateVersion = 0;
    setupRemoteChannel(roomId);

    ajaxRequest('POST', '/api/rooms', { roomId, action })
      .then(function(response) {
        if (response && response.full) {
          remoteSession.active = false;
          setMsg('Cette salle est déjà pleine. Choisissez une autre salle.');
          return;
        }
        remoteSession.role = response && response.created ? 'host' : 'guest';
        remoteSession.localPlayer = remoteSession.role === 'host' ? 1 : 2;
        if (response && response.state) {
          applyRemoteStatePayload(response.state);
        }
        setMsg(remoteSession.role === 'host'
          ? 'Mode distant — salle créée. Partagez le code ou le lien (boutons ci-dessus). Attendez le second joueur.'
          : 'Mode distant — salle rejointe. Votre tour dépend de la salle.');
        remoteSession.pollTimer = window.setInterval(pollRemoteState, 800);
        if (remoteSession.role === 'host') {
          pushRemoteState();
        } else {
          pollRemoteState();
        }
      })
      .catch(function(err) {
        remoteSession.active = false;
        console.error('[Songo] Erreur création/accès salle:', err);
        setMsg('Impossible de joindre la salle distante.');
      });
  }

  window.doCreateRoom = function() {
    const roomId = document.getElementById('room-code-display').textContent.trim();
    if (!roomId || roomId === '—') {
      setRoomMsg('Générez d\'abord un code.', 'error');
      return;
    }
    setRoomMsg('Création de la salle…');
    launchRemoteSession(roomId, 'create');
  };

  window.doJoinRoom = function() {
    const roomId = (document.getElementById('room-code-input').value || '').trim().toUpperCase();
    if (!roomId) {
      setRoomMsg('Entrez le code de la salle.', 'error');
      return;
    }
    setRoomMsg('Connexion à la salle…');
    launchRemoteSession(roomId, 'join');
  };

  /* ── Copier le code ─────────────────────────────────── */
  window.copyRoomCode = function() {
    const code = document.getElementById('room-code-display').textContent.trim();
    if (!code || code === '—') return;
    navigator.clipboard.writeText(code).then(function() {
      var btn = document.getElementById('btn-copy-code');
      btn.textContent = '✔ Copié !';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = '📋 Copier le code';
        btn.classList.remove('copied');
      }, 1800);
    });
  };

  /* ── Copier le lien d'invitation ────────────────────── */
  window.copyRoomLink = function() {
    const code = document.getElementById('room-code-display').textContent.trim();
    if (!code || code === '—') return;
    const base = window.location.origin + window.location.pathname;
    const link = base + '?room=' + encodeURIComponent(code);
    navigator.clipboard.writeText(link).then(function() {
      var btn = document.getElementById('btn-copy-link');
      btn.textContent = '✔ Lien copié !';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = '🔗 Copier le lien';
        btn.classList.remove('copied');
      }, 1800);
    });
  };

  /* ── Auto-rejoindre si URL contient ?room=CODE ──────── */
  (function checkUrlRoomParam() {
    var params = new URLSearchParams(window.location.search);
    var roomParam = (params.get('room') || '').trim().toUpperCase();
    if (!roomParam) return;
    // Nettoyer l'URL sans recharger
    var cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState(null, '', cleanUrl);
    // Ouvrir le panneau et pré-remplir le code pour rejoindre
    setTimeout(function() {
      openRoomPanel();
      selectRoomAction('join');
      var input = document.getElementById('room-code-input');
      if (input) {
        input.value = roomParam;
        setRoomMsg('Lien d\'invitation détecté — appuyez sur Rejoindre.', 'success');
      }
    }, 600);
  })();

  window.startRemotePlayers = function() {
    openRoomPanel();
  };

  window.startVsMachine = function(level) {
    gameMode = 'machine';
    aiLevel  = level;
    hideMenuScreen();
    resetGame(false);

    // Noms d'affichage
    const names = {
      'tres-facile': 'Très facile',
      'facile':      'Facile',
      'moyen':       'Moyen',
      'difficile':   'Difficile',
      'expert':      'Expert'
    };
    document.getElementById('diff-label-name').textContent = names[level] || level;
    document.getElementById('difficulty-badge').classList.add('visible');
    document.getElementById('score-j2').querySelector('.player-label').textContent = 'Machine';

    setMsg('Mode machine (' + (names[level] || level) + ') — Joueur 1 commence');
    if (machineMenuOpen) closeMachineMenu();
  };

  window.toggleMachineMenu = function() {
    machineMenuOpen ? closeMachineMenu() : openMachineMenu();
  };

  function openMachineMenu() {
    machineMenuOpen = true;
    document.getElementById('machine-submenu').classList.add('open');
    document.getElementById('btn-vs-machine').style.borderColor = 'rgba(230,170,60,0.80)';
    document.getElementById('btn-vs-machine').style.color = '#F5D49A';
  }

  function closeMachineMenu() {
    machineMenuOpen = false;
    document.getElementById('machine-submenu').classList.remove('open');
    document.getElementById('btn-vs-machine').style.borderColor = '';
    document.getElementById('btn-vs-machine').style.color = '';
  }

  function hideMenuScreen() {
    document.getElementById('menu-screen').style.display = 'none';
  }

  window.showHelp = function() {
    document.getElementById('help-screen').classList.add('open');
  };

  window.closeHelp = function() {
    document.getElementById('help-screen').classList.remove('open');
  };

  // ─── Logique de jeu ───────────────────────────────────────────────────────

  function onCellClick(idx) {
    playMove(idx, false);
  }

  function startSharedMultiplayerSession(roomId, role) {
    gameMode = 'shared';
    aiLevel = null;
    hideMenuScreen();
    resetGame(false);
    document.getElementById('difficulty-badge').classList.remove('visible');
    document.getElementById('score-j2').querySelector('.player-label').textContent = 'Joueur 2';
    if (machineMenuOpen) closeMachineMenu();

    if (multiplayer.channel) {
      try { multiplayer.channel.close(); } catch (_) {}
    }

    multiplayer.roomId = roomId;
    multiplayer.role = role;
    multiplayer.localPlayer = role === 'host' ? 1 : 2;
    multiplayer.channel = new BroadcastChannel('songo-room-' + roomId);
    multiplayer.channel.onmessage = function(event) {
      const data = event.data || {};
      if (data.type === 'state') {
        Game.loadState(data.state);
        const s = Game.getState();
        ThreeBoard.refreshSeeds(s.board, s.stores);
        updateUI();
        if (s.gameOver) showWin(s.winner);
        return;
      }
      if (data.type === 'reset') {
        Game.init();
        const s = Game.getState();
        ThreeBoard.refreshSeeds(s.board, s.stores);
        updateUI();
        return;
      }
      if (data.type === 'request-state' && multiplayer.role === 'host') {
        multiplayer.channel.postMessage({ type: 'state', state: Game.getState(), senderTabId: getMultiplayerTabId() });
      }
    };

    if (role === 'host') {
      setMsg('Mode partage de partie — Joueur 1 (vous) commence');
      multiplayer.channel.postMessage({ type: 'request-state', senderTabId: getMultiplayerTabId() });
    } else {
      setMsg('Mode partage de partie — Joueur 2 (vous) commence');
      multiplayer.channel.postMessage({ type: 'request-state', senderTabId: getMultiplayerTabId() });
      setTimeout(function() {
        if (!Game.getState().board || Game.getState().board.length === 0) {
          Game.init();
          const s = Game.getState();
          ThreeBoard.refreshSeeds(s.board, s.stores);
          updateUI();
        }
      }, 250);
    }
  }

  function broadcastSharedState() {
    if (!multiplayer.active || !multiplayer.channel) return;
    multiplayer.channel.postMessage({ type: 'state', state: Game.getState() });
  }

  function ajaxRequest(method, url, body) {
    return new Promise(function(resolve, reject) {
      const req = new XMLHttpRequest();
      req.open(method, url, true);
      req.setRequestHeader('Content-Type', 'application/json');
      req.onreadystatechange = function() {
        if (req.readyState !== 4) return;
        let data = null;
        try { data = req.responseText ? JSON.parse(req.responseText) : null; } catch (_) { data = req.responseText; }
        if (req.status >= 200 && req.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data && data.error ? data.error : 'Erreur réseau'));
        }
      };
      req.send(body ? JSON.stringify(body) : null);
    });
  }

  function pushRemoteState() {
    if (!remoteSession.active || !remoteSession.roomId) return;
    const payload = buildRemoteStatePayload(Game.getState());
    if (!payload) return;
    ajaxRequest('POST', '/api/rooms/' + encodeURIComponent(remoteSession.roomId) + '/state', { state: payload })
      .then(function() {
        broadcastRemoteStatePayload(payload);
      })
      .catch(function(err) {
        console.warn('[Songo] Erreur push distant:', err.message || err);
      });
  }

  function pollRemoteState() {
    if (!remoteSession.active || !remoteSession.roomId) return;
    ajaxRequest('GET', '/api/rooms/' + encodeURIComponent(remoteSession.roomId) + '/state')
      .then(function(response) {
        if (!response || !response.state) return;
        applyRemoteStatePayload(response.state);
      })
      .catch(function(err) {
        console.warn('[Songo] Erreur poll distant:', err.message || err);
      });
  }

  function playMove(idx, isMachineTurn) {
    const state = Game.getState();
    if (state.gameOver || state.animating) return false;

    if (multiplayer.active && state.currentPlayer !== multiplayer.localPlayer) {
      setMsg(multiplayer.localPlayer === 1 ? 'Attendez le joueur 2' : 'Attendez le joueur 1');
      return false;
    }
    if (remoteSession.active && state.currentPlayer !== remoteSession.localPlayer) {
      setMsg(remoteSession.localPlayer === 1 ? 'Attendez le joueur 2' : 'Attendez le joueur 1');
      return false;
    }

    if (!state.validMoves.includes(idx)) {
      setMsg(state.currentPlayer === 1
        ? 'Joueur 1 : choisissez une case de la rangée du bas'
        : (gameMode === 'machine' ? 'Tour de la machine...' : 'Joueur 2 : choisissez une case de la rangée du haut'));
      return false;
    }

    ThreeBoard.showSelectedRing(idx);
    const count = state.board[idx];
    setMsg(isMachineTurn
      ? 'La machine joue ' + count + ' graine' + (count > 1 ? 's' : '') + '...'
      : 'Semis de ' + count + ' graine' + (count > 1 ? 's' : '') + '...');

    const sowOrder = Game.getSowOrder(idx, state.currentPlayer);
    ThreeBoard.showTravelPath(sowOrder);

    Game.sow(idx,
      function onStep(ev) {
        const s = Game.getState();
        ThreeBoard.refreshSeeds(s.board, s.stores);
        updateScores(s);
      },
      function onDone(result) {
        ThreeBoard.removeSelectedRing();
        ThreeBoard.clearTravelPath();
        const s = Game.getState();
        ThreeBoard.refreshSeeds(s.board, s.stores);
        updateUI();

        if (multiplayer.active) {
          broadcastSharedState();
        }
        if (remoteSession.active) {
          pushRemoteState();
        }

        if (result.gameOver || s.gameOver || s.validMoves.length === 0) {
          showWin(s.winner ?? result.winner);
          return;
        }
        if (result.replay) {
          setMsg(isMachineTurn ? 'La machine a joué.' : 'Coup joué !');
        } else {
          const nextLabel = (gameMode === 'machine' && s.currentPlayer === 2)
            ? 'Tour de la machine...'
            : 'Tour : Joueur ' + s.currentPlayer + ' — choisissez une case';
          setMsg(isMachineTurn ? 'La machine a joué.' : nextLabel);
        }

        if (gameMode === 'machine' && s.currentPlayer === 2 && !s.gameOver) {
          queueMachineTurn();
        }
      }
    );
    return true;
  }

  function updateUI() {
    const s = Game.getState();
    updateScores(s);
    setTurn(s.currentPlayer);
    if (!s.gameOver) {
      if (gameMode === 'machine' && s.currentPlayer === 2) {
        setMsg('Tour de la machine...');
      } else {
        setMsg('Tour : Joueur ' + s.currentPlayer + ' — ' +
          (s.currentPlayer === 1 ? 'rangée du bas' : 'rangée du haut'));
      }
    }
  }

  function queueMachineTurn() {
    if (gameMode !== 'machine') return;
    const s = Game.getState();
    if (s.gameOver || s.currentPlayer !== 2) return;
    const moves = s.validMoves;
    if (!moves.length) {
      setMsg("La machine n'a pas de coup possible");
      return;
    }

    const thinkDelay = SongoAI.THINK_DELAY[aiLevel] || 800;
    const thinkMsg   = SongoAI.THINK_MSG[aiLevel]   || 'La machine réfléchit...';
    setMsg(thinkMsg);

    setTimeout(function() {
      const next = Game.getState();
      if (next.gameOver || next.currentPlayer !== 2 || gameMode !== 'machine') return;

      const bestMove = SongoAI.chooseMove(
        aiLevel,
        next.validMoves,
        next.board,
        next.stores,
        Game.getSowOrder
      );

      playMove(bestMove, true);
    }, thinkDelay);
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  function updateScores(s) {
    document.getElementById('val-j1').textContent = s.stores[0];
    document.getElementById('val-j2').textContent = s.stores[1];
  }

  function setTurn(player) {
    const dot = document.getElementById('turn-dot');
    const txt = document.getElementById('turn-text');
    dot.className = player === 2 ? 'p2' : '';
    if (gameMode === 'machine') {
      txt.textContent = player === 1 ? 'Tour : Joueur 1' : 'Tour : Machine';
    } else {
      txt.textContent = 'Tour : Joueur ' + player;
    }
  }

  function setMsg(text) {
    document.getElementById('msg-bar').textContent = text;
  }

  function showWin(winner) {
    let existing = document.getElementById('win-overlay');
    if (existing) existing.remove();

    const ov  = document.createElement('div');
    ov.id     = 'win-overlay';
    const box = document.createElement('div');
    box.id    = 'win-box';
    const s   = Game.getState();

    if (winner === 0) {
      box.innerHTML = '<h2>Égalité !</h2><p>' + s.stores[0] + ' graines chacun</p>';
    } else {
      let winLabel;
      if (winner === 2 && gameMode === 'machine') {
        winLabel = 'La machine gagne !';
      } else if (winner === 1 && gameMode === 'machine') {
        winLabel = 'Vous avez battu la machine !';
      } else {
        winLabel = 'Joueur ' + winner + ' gagne !';
      }
      box.innerHTML = '<h2>' + winLabel + '</h2>' +
        '<p>J1 : ' + s.stores[0] + ' graines &nbsp;|&nbsp; ' +
        (gameMode === 'machine' ? 'Machine' : 'J2') + ' : ' + s.stores[1] + ' graines</p>';
    }

    const btnNv  = document.createElement('button');
    btnNv.textContent = 'Rejouer';
    btnNv.onclick     = resetGame;

    const btnMenu = document.createElement('button');
    btnMenu.textContent = 'Menu principal';
    btnMenu.style.marginLeft = '12px';
    btnMenu.onclick = function() {
      const ov2 = document.getElementById('win-overlay');
      if (ov2) ov2.remove();
      showMenuScreen();
    };

    box.appendChild(btnNv);
    box.appendChild(btnMenu);
    ov.appendChild(box);
    document.body.appendChild(ov);
  }

  window.stopGame = function() {
    if (typeof SongoMusic.stop === 'function') {
      SongoMusic.stop();
    }

    const ov = document.getElementById('win-overlay');
    if (ov) ov.remove();

    Game.init();
    const s = Game.getState();
    ThreeBoard.removeSelectedRing();
    ThreeBoard.clearTravelPath();
    ThreeBoard.refreshSeeds(s.board, s.stores);
    updateScores(s);
    setTurn(s.currentPlayer);
    setMsg('Partie arrêtée');

    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('help-screen').classList.remove('open');
    if (multiplayer.channel) {
      try { multiplayer.channel.close(); } catch (_) {}
      multiplayer.channel = null;
    }
    if (remoteSession.pollTimer) {
      window.clearInterval(remoteSession.pollTimer);
      remoteSession.pollTimer = null;
    }
    multiplayer.active = false;
    multiplayer.roomId = null;
    multiplayer.localPlayer = 1;
    multiplayer.role = 'host';
    remoteSession.active = false;
    remoteSession.roomId = null;
    remoteSession.localPlayer = 1;
    remoteSession.role = 'host';
    remoteSession.lastPushedStateKey = '';
    remoteSession.lastAppliedStateKey = '';
    remoteSession.lastAppliedVersion = 0;
    remoteSession.lastAppliedTimestamp = 0;
    remoteSession.stateVersion = 0;
    if (remoteSession.channel) {
      try { remoteSession.channel.close(); } catch (_) {}
      remoteSession.channel = null;
    }
    clearSharedMultiplayerStorage();
    document.getElementById('difficulty-badge').classList.remove('visible');
    document.getElementById('ui-overlay').style.display = 'none';
    document.getElementById('three-canvas').style.display = 'none';
    document.getElementById('counters-layer').style.display = 'none';
    document.getElementById('welcome-banner').style.display = 'none';
    document.getElementById('music-btn').style.display = 'none';
    document.getElementById('music-volume').style.display = 'none';
    document.getElementById('music-file-btn').style.display = 'none';
    document.getElementById('music-playlist-btn').style.display = 'none';
    document.getElementById('music-stop-btn').style.display = 'none';
    document.getElementById('playlist-panel').style.display = 'none';

    const body = document.body;
    body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,3,0,0.96);color:#f5d49a;font-family:Segoe UI,Arial,sans-serif;font-size:20px;font-weight:600;letter-spacing:0.03em;text-align:center;padding:24px;">Jeu arrêté</div>';

    try { window.close(); } catch (_) {}

    if (machineMenuOpen) closeMachineMenu();
  };

  window.resetGame = function(showMsgParam) {
    const showDefaultMsg = (showMsgParam !== false);
    const ov = document.getElementById('win-overlay');
    if (ov) ov.remove();
    Game.init();
    const s = Game.getState();
    ThreeBoard.removeSelectedRing();
    ThreeBoard.clearTravelPath();
    ThreeBoard.refreshSeeds(s.board, s.stores);
    updateUI();
    if (multiplayer.active && multiplayer.channel) {
      multiplayer.channel.postMessage({ type: 'reset' });
    }
    if (remoteSession.active) {
      pushRemoteState();
    }
    if (showDefaultMsg) {
      if (multiplayer.active) {
        setMsg('Nouvelle partie partagée — Joueur 1 commence');
      } else {
        setMsg('Nouvelle partie — Joueur 1 commence');
      }
    }
  };

  window.showHint = function() {
    const s = Game.getState();
    if (s.gameOver) return;
    if (gameMode === 'machine' && s.currentPlayer === 2) return;
    const moves = s.validMoves;
    if (moves.length === 0) return;
    const best = moves.reduce((a, b) => s.board[a] >= s.board[b] ? a : b);
    ThreeBoard.showSelectedRing(best);
    const label = best < 7
      ? 'Rangée haut, case ' + (best + 1)
      : 'Rangée bas, case ' + (best - 6);
    setMsg('Indice : ' + label + ' (' + s.board[best] + ' graines)');
    setTimeout(() => ThreeBoard.removeSelectedRing(), 2200);
  };

})();

// ─── Contrôle musique ────────────────────────────────────────────────────
function toggleMusic() {
  const btn = document.getElementById('music-btn');
  const icon = document.getElementById('music-icon');
  const label = document.getElementById('music-label');

  const nowPlaying = SongoMusic.toggle();

  if (nowPlaying) {
    btn.classList.add('playing');
    icon.textContent = '🔊';
    label.textContent = SongoMusic.getStyleName();
    btn.style.borderColor = SongoMusic.getStyleColor() + 'cc';
  } else {
    btn.classList.remove('playing');
    icon.textContent = '🎵';
    label.textContent = 'Musique';
    btn.style.borderColor = '';
  }
}

function initMusicVolumeControl() {
  const slider = document.getElementById('music-volume');
  if (!slider) return;
  slider.value = SongoMusic.getVolume();
  slider.addEventListener('input', (event) => {
    SongoMusic.setVolume(event.target.value);
  });
}

function initMusicFileControl() {
  const input = document.getElementById('music-file-input');
  const button = document.getElementById('music-file-btn');
  if (!input || !button) return;

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    SongoMusic.addMultipleFiles(files).then(() => {
      SongoMusic.updateMusicBtnUI();
      SongoMusic.updatePlaylistUI();
    });
    input.value = '';
  });
}

function togglePlaylistPanel() {
  const panel = document.getElementById('playlist-panel');
  if (!panel) return;
  const visible = panel.style.display !== 'none' && panel.style.display !== '';
  panel.style.display = visible ? 'none' : 'flex';
  if (!visible) SongoMusic.updatePlaylistUI();
}

// Initialisation seulement des contrôles musicaux sans lancement automatique
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initMusicVolumeControl();
    initMusicFileControl();
  });
  if (document.readyState !== 'loading') {
    initMusicVolumeControl();
    initMusicFileControl();
  }
})();
