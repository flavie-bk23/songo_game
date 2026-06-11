// music.js — Musique pour Songo
// Supporte une playlist de fichiers MP3 dans assets/sounds/
// + synthèse générative si aucun MP3 trouvé

const SongoMusic = (function () {

  let ctx = null;
  let masterGain = null;
  let isPlaying = false;
  let scheduledNodes = [];
  let loopTimeout = null;
  let volume = 0.28;

  // ─── Playlist MP3 ────────────────────────────────────────────────────────
  // Liste des pistes MP3 dans assets/sounds/
  // Ajoutez vos fichiers MP3 dans assets/sounds/ et listez-les ici :
  const PLAYLIST_FILES = [
    // 'assets/sounds/chanson1.mp3',
    // 'assets/sounds/chanson2.mp3',
    // 'assets/sounds/chanson3.mp3',
  ];

  // Noms affichés pour chaque piste (même ordre que PLAYLIST_FILES)
  const PLAYLIST_NAMES = [
    // 'Chanson 1',
    // 'Chanson 2',
    // 'Chanson 3',
  ];

  let playlist = [];      // { url, name } — rempli à l'init
  let currentIndex = -1;
  let currentAudio = null;
  let userFiles = [];     // fichiers ajoutés via le sélecteur de fichiers
  const STORAGE_KEY = 'songoMusicUserFiles';
  const DB_NAME = 'songoMusicDB';
  const DB_STORE = 'tracks';

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Impossible de lire le fichier audio'));
      reader.readAsArrayBuffer(file);
    });
  }

  function openMusicDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir la base de données audio'));
    });
  }

  async function saveTrackToStorage(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    const type = file.type || 'audio/mpeg';
    const blob = new Blob([arrayBuffer], { type });
    const url = URL.createObjectURL(blob);

    try {
      const db = await openMusicDb();
      if (db) {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        store.add({ id, name, type, data: arrayBuffer });
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Impossible d’enregistrer la piste audio'));
        });
        db.close();
      }
    } catch (e) {
      console.warn('SongoMusic: sauvegarde IndexedDB impossible', e);
    }

    return { name, url, type };
  }

  async function persistUserFiles() {
    try {
      if (!window.localStorage) return;
      const safe = userFiles.filter(item => item && typeof item.url === 'string' && typeof item.name === 'string' && item.url.startsWith('data:'));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (e) {
      console.warn('SongoMusic: impossible de sauvegarder la playlist', e);
    }
  }

  async function restoreUserFiles() {
    try {
      const db = await openMusicDb();
      if (db) {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const tracks = await new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error || new Error('Impossible de lire les pistes audio'));
        });
        db.close();

        userFiles = tracks.map(track => {
          const blob = new Blob([track.data], { type: track.type || 'audio/mpeg' });
          return { name: track.name, url: URL.createObjectURL(blob) };
        });
        return;
      }
    } catch (e) {
      console.warn('SongoMusic: impossible de restaurer la playlist depuis IndexedDB', e);
    }

    try {
      if (!window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      userFiles = parsed.filter(item => item && typeof item.url === 'string' && typeof item.name === 'string' && item.url.startsWith('data:'));
    } catch (e) {
      console.warn('SongoMusic: impossible de restaurer la playlist', e);
      userFiles = [];
    }
  }

  function buildPlaylist() {
    playlist = [];
    // 1. Fichiers définis dans PLAYLIST_FILES
    PLAYLIST_FILES.forEach((url, i) => {
      playlist.push({ url, name: PLAYLIST_NAMES[i] || url.split('/').pop() });
    });
    // 2. Fichiers chargés par l'utilisateur via le bouton
    userFiles.forEach(f => playlist.push(f));
  }

  function stopCurrentAudio() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (_) {}
      try { currentAudio.src = ''; } catch (_) {}
      currentAudio = null;
    }
  }

  function playTrack(index) {
    stopCurrentAudio();
    if (playlist.length === 0) return false;
    if (index < 0) index = playlist.length - 1;
    if (index >= playlist.length) index = 0;
    currentIndex = index;

    const track = playlist[currentIndex];
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audio.src = track.url;
    currentAudio = audio;

    audio.addEventListener('ended', () => {
      if (isPlaying && playlist.length > 0) playTrack((currentIndex + 1) % playlist.length);
    });

    audio.addEventListener('error', () => {
      console.warn('SongoMusic: erreur lecture', track.url);
      if (isPlaying && playlist.length > 0) playTrack((currentIndex + 1) % playlist.length);
    });

    audio.play().catch(() => {});
    updatePlaylistUI();
    return true;
  }

  function playNext() { if (playlist.length > 0) playTrack((currentIndex + 1) % playlist.length); }
  function playPrev() { if (playlist.length > 0) playTrack((currentIndex - 1 + playlist.length) % playlist.length); }

  // ─── Styles musicaux synthétiques (fallback si pas de MP3) ──────────────
  const STYLES = [
    { name: 'Kora Africaine',    tempo: 112, scale: [0,2,4,7,9],    baseOctave: 4, waveMain: 'triangle', waveBass: 'sawtooth', reverbWet: 0.45, delayTime: 0.27, delayFeed: 0.38, color: '#f5d49a' },
    { name: 'Balafon Forestier', tempo: 96,  scale: [0,3,5,7,10],   baseOctave: 4, waveMain: 'square',   waveBass: 'triangle', reverbWet: 0.55, delayTime: 0.33, delayFeed: 0.30, color: '#b8f0a0' },
    { name: 'Tam-Tam Mystique',  tempo: 88,  scale: [0,2,5,7,9,11], baseOctave: 3, waveMain: 'sawtooth', waveBass: 'sine',     reverbWet: 0.65, delayTime: 0.40, delayFeed: 0.42, color: '#ffa08a' },
    { name: 'Nuit de Savane',    tempo: 72,  scale: [0,2,4,6,9],    baseOctave: 4, waveMain: 'sine',     waveBass: 'triangle', reverbWet: 0.70, delayTime: 0.50, delayFeed: 0.35, color: '#a0c8ff' },
    { name: 'Rythme Ekang',      tempo: 128, scale: [0,2,3,7,8],    baseOctave: 4, waveMain: 'triangle', waveBass: 'sawtooth', reverbWet: 0.30, delayTime: 0.22, delayFeed: 0.25, color: '#ffd700' },
  ];
  const CURRENT_STYLE = STYLES[Math.floor(Math.random() * STYLES.length)];

  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function scaleNote(degree, octave) {
    const semi = CURRENT_STYLE.scale[degree % CURRENT_STYLE.scale.length];
    const oct  = octave + Math.floor(degree / CURRENT_STYLE.scale.length);
    return midiToFreq(60 + (oct - 4) * 12 + semi);
  }

  function buildContext() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2.5);
    const reverbNode = buildReverb(2.8);
    const reverbGain = ctx.createGain(); reverbGain.gain.value = CURRENT_STYLE.reverbWet;
    const delayNode  = ctx.createDelay(1.0); delayNode.delayTime.value = CURRENT_STYLE.delayTime;
    const delayFeed  = ctx.createGain(); delayFeed.gain.value = CURRENT_STYLE.delayFeed;
    delayNode.connect(delayFeed); delayFeed.connect(delayNode); delayNode.connect(ctx.destination);
    const dryGain = ctx.createGain(); dryGain.gain.value = 0.75;
    masterGain.connect(dryGain); masterGain.connect(reverbNode); masterGain.connect(delayNode);
    reverbNode.connect(reverbGain); reverbGain.connect(ctx.destination); dryGain.connect(ctx.destination);
  }

  function buildReverb(dur) {
    const sr = ctx.sampleRate, len = sr * dur;
    const imp = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const ch = imp.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random()*2-1)*Math.pow(1-i/len,2.5);
    }
    const conv = ctx.createConvolver(); conv.buffer = imp; return conv;
  }

  function playNote(freq, t, dur, vol, wave) {
    if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = wave || CURRENT_STYLE.waveMain; osc.frequency.value = freq;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.012);
    g.gain.setValueAtTime(vol,t+dur*0.6); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    osc.connect(g); g.connect(masterGain); osc.start(t); osc.stop(t+dur+0.05);
    scheduledNodes.push(osc);
  }

  function playPerc(t, vol, type) {
    if (!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate*0.15, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    if (type==='hi'){f.type='highpass';f.frequency.value=4000;}
    else if(type==='mid'){f.type='bandpass';f.frequency.value=600;f.Q.value=3;}
    else{f.type='lowpass';f.frequency.value=200;}
    const g=ctx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
    src.connect(f);f.connect(g);g.connect(masterGain);src.start(t);scheduledNodes.push(src);
  }

  function scheduleLoop(startTime) {
    if (!isPlaying) return;
    const s=CURRENT_STYLE, beat=60/s.tempo, barLen=beat*4, numBars=4;
    const patterns=[[0,2,1,3,0,4,2,1],[4,3,2,0,1,3,4,2],[0,1,0,2,3,2,4,3],[2,4,1,3,0,2,1,4]];
    const pattern=patterns[Math.floor(Math.random()*patterns.length)];
    const bassPattern=[0,-1,0,-1,1,-1,2,-1];
    for(let bar=0;bar<numBars;bar++){
      const bs=startTime+bar*barLen;
      for(let step=0;step<8;step++){
        const t=bs+step*(beat/2), deg=pattern[step];
        if(deg>=0){const oct=(step%2===0)?0:1;playNote(scaleNote(deg,s.baseOctave+oct),t,beat*(step%4===0?0.7:0.35),0.15+Math.random()*0.08,s.waveMain);}
        const bd=bassPattern[step];
        if(bd>=0&&step%2===0) playNote(scaleNote(bd,s.baseOctave-2),t,beat*0.8,0.18,s.waveBass);
        if(step===0||step===4) playPerc(t,0.22,'low');
        if(step===2||step===6) playPerc(t,0.15,'mid');
        if(step%2!==0) playPerc(t+beat*0.25,0.08,'hi');
      }
      if(bar%2===0){[0,2,4].forEach(d=>playNote(scaleNote(d,s.baseOctave+1),bs+barLen*0.75,beat*1.2,0.06,'sine'));}
    }
    const loopDur=barLen*numBars;
    loopTimeout=setTimeout(()=>scheduleLoop(startTime+loopDur),(loopDur-0.3)*1000);
  }

  // ─── UI Playlist ─────────────────────────────────────────────────────────
  function updatePlaylistUI() {
    const list = document.getElementById('songo-playlist-list');
    if (!list) return;
    list.innerHTML = '';
    if (playlist.length === 0) {
      list.innerHTML = '<li class="pl-empty">Aucune piste — ajoutez des MP3</li>';
      return;
    }
    playlist.forEach((track, i) => {
      const li = document.createElement('li');
      li.className = 'pl-item' + (i === currentIndex && isPlaying ? ' pl-active' : '');
      li.textContent = (i === currentIndex && isPlaying ? '▶ ' : '') + track.name;
      li.title = track.name;
      li.onclick = () => { isPlaying = true; playTrack(i); updateMusicBtnUI(); };
      list.appendChild(li);
    });
  }

  function updateMusicBtnUI() {
    const btn   = document.getElementById('music-btn');
    const icon  = document.getElementById('music-icon');
    const label = document.getElementById('music-label');
    if (!btn) return;
    if (isPlaying) {
      btn.classList.add('playing');
      icon.textContent = '🎵';
      label.textContent = playlist.length > 0 && currentIndex >= 0
        ? playlist[currentIndex].name
        : CURRENT_STYLE.name;
      btn.style.borderColor = (playlist.length > 0 ? '#80ffaa' : CURRENT_STYLE.color) + 'cc';
    } else {
      btn.classList.remove('playing');
      icon.textContent = '🎵';
      label.textContent = 'Musique';
      btn.style.borderColor = '';
    }
  }

  // ─── API publique ─────────────────────────────────────────────────────────

  function start() {
    if (isPlaying) return;
    buildPlaylist();
    try {
      if (playlist.length > 0) {
        isPlaying = true;
        playTrack(currentIndex < 0 ? 0 : currentIndex);
        updateMusicBtnUI();
        updatePlaylistUI();
        return;
      }
      buildContext();
      isPlaying = true;
      scheduleLoop(ctx.currentTime + 0.2);
      updateMusicBtnUI();
    } catch (e) { console.warn('SongoMusic: erreur démarrage', e); }
  }

  function stop() {
    isPlaying = false;
    stopCurrentAudio();
    if (loopTimeout) {
      clearTimeout(loopTimeout);
      loopTimeout = null;
    }
    if (masterGain && ctx) {
      try { masterGain.gain.cancelScheduledValues(ctx.currentTime); } catch (_) {}
      try { masterGain.gain.setValueAtTime(0, ctx.currentTime); } catch (_) {}
    }
    scheduledNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    scheduledNodes = [];
    if (ctx) {
      try { if (typeof ctx.suspend === 'function') ctx.suspend(); } catch (_) {}
      try { ctx.close(); } catch (_) {}
      ctx = null;
      masterGain = null;
    }
    updateMusicBtnUI();
    updatePlaylistUI();
  }

  function toggle() { if (isPlaying) stop(); else start(); return isPlaying; }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, Number(val) || 0));
    if (currentAudio) currentAudio.volume = volume;
    if (masterGain && ctx) { masterGain.gain.cancelScheduledValues(ctx.currentTime); masterGain.gain.setValueAtTime(volume, ctx.currentTime); }
    return volume;
  }

  function getVolume() { return volume; }

  async function setCustomTrackFromFile(file) {
    if (!file) return false;
    const saved = await saveTrackToStorage(file);
    userFiles.push({ url: saved.url, name: saved.name });
    await persistUserFiles();
    buildPlaylist();
    updatePlaylistUI();
    isPlaying = true;
    playTrack(playlist.length - 1);
    updateMusicBtnUI();
    return true;
  }

  async function addMultipleFiles(files) {
    const items = Array.from(files || []);
    for (const f of items) {
      const saved = await saveTrackToStorage(f);
      userFiles.push({ url: saved.url, name: saved.name });
    }
    await persistUserFiles();
    buildPlaylist();
    updatePlaylistUI();
    if (!isPlaying) { isPlaying = true; playTrack(0); updateMusicBtnUI(); }
  }

  async function initializePersistedTracks() {
    await restoreUserFiles();
    buildPlaylist();
    updatePlaylistUI();
  }

  initializePersistedTracks();

  function getStyleName() {
    if (isPlaying && playlist.length > 0 && currentIndex >= 0) return playlist[currentIndex].name;
    return CURRENT_STYLE.name;
  }

  function getStyleColor() {
    return (isPlaying && playlist.length > 0) ? '#ffb347' : CURRENT_STYLE.color;
  }

  function isActive() { return isPlaying; }
  function getPlaylist() { return playlist; }
  function getCurrentIndex() { return currentIndex; }

  return { start, stop, toggle, setVolume, getVolume, setCustomTrackFromFile, addMultipleFiles,
           playNext, playPrev, getStyleName, getStyleColor, isActive, getPlaylist, getCurrentIndex,
           updatePlaylistUI, updateMusicBtnUI };

})();
