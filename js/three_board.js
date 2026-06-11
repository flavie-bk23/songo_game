// three_board.js — Rendu 3D du plateau et des graines avec Three.js r128
const ThreeBoard = (function() {

  let renderer, scene, camera, raycaster, mouse;
  let cellMeshes = [];
  let seedGroups = [];
  let storeMeshes = [];
  let storeSeedGroups = [];
  let selectedRing = null;
  let hoverCell = -1;
  let clickCallback = null;

  // ── Système de visualisation du trajet ────────────────────────────────────
  let arrowMeshes = [];       // anneaux colorés sur chaque case du trajet
  let travelParticle = null;  // sphère lumineuse qui voyage le long du trajet
  let travelPath = [];        // positions 3D ordonnées du trajet
  let travelStep = 0;
  let travelProgress = 0;
  let travelActive = false;

  // Palette matériaux
  let matWood, matWoodDark, matWoodRim, matHollow, matHollowInner;
  let matSeed, matSelected, matStore;

  const COLS = 7;
  const CELL_W = 1.18, CELL_H = 1.7, CELL_D = 0.95;
  const GAP = 0.10;
  const STORE_W = 1.0, STORE_H = 3.6, STORE_D = 0.75;
  const BOARD_PAD = 0.22;
  const ROW_SEP = 0.12;

  const BOARD_TOTAL_W = STORE_W * 2 + CELL_W * COLS + GAP * (COLS + 2) + BOARD_PAD * 2;
  const BOARD_TOTAL_H = CELL_H * 2 + ROW_SEP + BOARD_PAD * 2;

  // Positions 3D → écran pour les compteurs HTML
  let cellWorldPositions = [];
  let storeWorldPositions = [];

  function init(canvas, onCellClick) {
    clickCallback = onCellClick;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    resize();

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 7.5, 5.5);
    camera.lookAt(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    buildMaterials();
    buildLights();
    buildBoard();
    buildAllSeeds(Game.getState().board, Game.getState().stores);
    buildCounters();

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onMouseClick);
    window.addEventListener('resize', resize);

    animate();
  }

  function resize() {
    if (!renderer) return;
    const cv = renderer.domElement;
    const w = cv.clientWidth, h = cv.clientHeight;
    renderer.setSize(w, h, false);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // ── Matériaux ──────────────────────────────────────────────────────────────

  function buildMaterials() {
    const woodTex = makeWoodTexture(512, 256, '#7A4018', '#5A2C0C', '#9B5A28');
    matWood = new THREE.MeshStandardMaterial({
      map: woodTex, roughness: 0.78, metalness: 0.02, color: 0xffffff
    });

    const woodDarkTex = makeWoodTexture(256, 128, '#3D1A06', '#2A1006', '#5A2C10');
    matWoodDark = new THREE.MeshStandardMaterial({
      map: woodDarkTex, roughness: 0.9, metalness: 0.0
    });

    matWoodRim = new THREE.MeshStandardMaterial({
      color: 0x1A0800, roughness: 0.95, metalness: 0.0
    });

    // Creux : couleur très sombre avec légère teinte chaude
    matHollow = new THREE.MeshStandardMaterial({
      color: 0x0D0400, roughness: 1.0, metalness: 0.0
    });

    // Paroi intérieure du creux : bois sombre légèrement visible
    matHollowInner = new THREE.MeshStandardMaterial({
      color: 0x2A1005, roughness: 0.95, metalness: 0.0,
      side: THREE.BackSide
    });

    // Graines : bois de graine naturel (brun chaud brillant)
    matSeed = new THREE.MeshStandardMaterial({
      color: 0x3B1F08, roughness: 0.22, metalness: 0.08
    });

    matSelected = new THREE.MeshStandardMaterial({
      color: 0xFFCC00, roughness: 0.3, metalness: 0.5,
      transparent: true, opacity: 0.55,
      side: THREE.DoubleSide
    });

    const storeTex = makeWoodTexture(256, 512, '#6B3510', '#4A2008', '#8B4A20');
    matStore = new THREE.MeshStandardMaterial({
      map: storeTex, roughness: 0.85, metalness: 0.0
    });
  }

  function makeWoodTexture(W, H, base, dark, light) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() * W) | 0;
      const alpha = 0.04 + Math.random() * 0.08;
      const col = Math.random() > 0.5 ? dark : light;
      c.strokeStyle = col + Math.floor(alpha * 255).toString(16).padStart(2,'0');
      c.lineWidth = 0.5 + Math.random() * 1.5;
      c.beginPath();
      c.moveTo(x, 0);
      const cp1x = x + (Math.random()-0.5)*20, cp2x = x + (Math.random()-0.5)*20;
      c.bezierCurveTo(cp1x, H*0.33, cp2x, H*0.66, x+(Math.random()-0.5)*8, H);
      c.stroke();
    }
    return new THREE.CanvasTexture(cv);
  }

  // ── Lumières ──────────────────────────────────────────────────────────────

  function buildLights() {
    const ambient = new THREE.AmbientLight(0xFFF5E0, 0.60);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xFFEDD0, 1.8);
    sun.position.set(3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xC8E8FF, 0.40);
    fill.position.set(-4, 3, -2);
    scene.add(fill);

    const rim = new THREE.PointLight(0xFF9940, 0.5, 20);
    rim.position.set(0, 1, -5);
    scene.add(rim);

    // Lumière chaude sous le plateau (rebond)
    const bounce = new THREE.PointLight(0xFFB060, 0.25, 15);
    bounce.position.set(0, -2, 0);
    scene.add(bounce);
  }

  // ── Plateau ───────────────────────────────────────────────────────────────

  function buildBoard() {
    // Corps principal du plateau
    const boardGeo = new THREE.BoxGeometry(BOARD_TOTAL_W, 0.85, BOARD_TOTAL_H);
    const boardMesh = new THREE.Mesh(boardGeo, matWood);
    boardMesh.position.y = -0.425;
    boardMesh.receiveShadow = true;
    boardMesh.castShadow = true;
    scene.add(boardMesh);

    // Bords en bois sombre
    const rimH = 1.0;
    const rimGeo = new THREE.BoxGeometry(BOARD_TOTAL_W + 0.12, rimH, BOARD_TOTAL_H + 0.12);
    const rimMesh = new THREE.Mesh(rimGeo, matWoodDark);
    rimMesh.position.y = -rimH / 2 - 0.02;
    rimMesh.receiveShadow = true;
    scene.add(rimMesh);

    // Moulure décorative sur les bords (4 côtés)
    const moulW = BOARD_TOTAL_W + 0.16;
    const moulH = BOARD_TOTAL_H + 0.16;
    const moulureGeo1 = new THREE.BoxGeometry(moulW, 0.06, 0.07);
    const moulureGeo2 = new THREE.BoxGeometry(0.07, 0.06, moulH);
    const moulureMat = new THREE.MeshStandardMaterial({ color: 0xFFBB55, roughness: 0.4, metalness: 0.3 });
    [-BOARD_TOTAL_H/2 - 0.04, BOARD_TOTAL_H/2 + 0.04].forEach(z => {
      const m = new THREE.Mesh(moulureGeo1, moulureMat);
      m.position.set(0, 0.06, z); scene.add(m);
    });
    [-BOARD_TOTAL_W/2 - 0.04, BOARD_TOTAL_W/2 + 0.04].forEach(x => {
      const m = new THREE.Mesh(moulureGeo2, moulureMat);
      m.position.set(x, 0.06, 0); scene.add(m);
    });

    // Séparateur central : il s'arrête au niveau des cases extrêmes
    const startX = -BOARD_TOTAL_W / 2 + BOARD_PAD + STORE_W + GAP + CELL_W / 2;
    const sepW = CELL_W * COLS + GAP * (COLS - 1);
    const sepGeo = new THREE.BoxGeometry(sepW, 0.10, 0.07);
    const sep = new THREE.Mesh(sepGeo, matWoodRim);
    sep.position.set(startX + (COLS - 1) * (CELL_W + GAP) / 2, 0.05, 0);
    scene.add(sep);

    // Pieds sculptés
    const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.6, 12);
    const legPositions = [
      [-BOARD_TOTAL_W/2 + 0.4, -BOARD_TOTAL_H/2 + 0.35],
      [ BOARD_TOTAL_W/2 - 0.4, -BOARD_TOTAL_H/2 + 0.35],
      [-BOARD_TOTAL_W/2 + 0.4,  BOARD_TOTAL_H/2 - 0.35],
      [ BOARD_TOTAL_W/2 - 0.4,  BOARD_TOTAL_H/2 - 0.35],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, matWoodDark);
      leg.position.set(lx, -0.56, lz);
      leg.castShadow = true;
      scene.add(leg);
    }

    // Cases (creux)
    cellMeshes = [];
    cellWorldPositions = [];
    const rowZ = [-BOARD_TOTAL_H/4 - ROW_SEP/2, BOARD_TOTAL_H/4 + ROW_SEP/2];

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < 2; row++) {
        const idx = row === 0 ? col : col + 7;
        const x = startX + col * (CELL_W + GAP);
        const z = rowZ[row];
        buildCell(idx, x, z);
        cellWorldPositions[idx] = new THREE.Vector3(x, 0.18, z);

        // Séparateurs verticaux fins et élégants
        if (col < COLS - 1) {
          const divGeo = new THREE.BoxGeometry(GAP * 0.5, 0.16, CELL_H * 0.88);
          const div = new THREE.Mesh(divGeo, matWoodRim);
          div.position.set(x + CELL_W/2 + GAP/2, 0.06, z);
          scene.add(div);
        }
      }
    }

    // Grandes cases stores
    storeMeshes = [];
    storeWorldPositions = [];
    const sxL = -BOARD_TOTAL_W/2 + BOARD_PAD + STORE_W/2;
    const sxR =  BOARD_TOTAL_W/2 - BOARD_PAD - STORE_W/2;
    buildStoreCell(0, sxL, 0);
    buildStoreCell(1, sxR, 0);
    storeWorldPositions[0] = new THREE.Vector3(sxL, 0.18, 0);
    storeWorldPositions[1] = new THREE.Vector3(sxR, 0.18, 0);
  }

  function buildCell(idx, x, z) {
    const R_TOP = CELL_W * 0.46;
    const R_BOT = CELL_W * 0.40;
    const DEPTH = CELL_D;

    // Fond du creux (disque sombre au fond)
    const floorGeo = new THREE.CircleGeometry(R_BOT * 0.98, 36);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x080200, roughness: 1.0, metalness: 0.0 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(x, -DEPTH + 0.005, z);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Paroi intérieure du creux (cylindre ouvert, vue intérieure)
    const wallGeo = new THREE.CylinderGeometry(R_TOP, R_BOT, DEPTH, 36, 1, true);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2A1005, roughness: 0.95, metalness: 0.0, side: THREE.BackSide
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.set(x, -DEPTH / 2, z);
    scene.add(wallMesh);

    // Cylindre invisible pour la détection des clics uniquement (transparent)
    const blockGeo = new THREE.CylinderGeometry(R_TOP, R_BOT, DEPTH, 36);
    const blockMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
    const blockMesh = new THREE.Mesh(blockGeo, blockMat);
    blockMesh.position.set(x, -DEPTH / 2, z);
    blockMesh.userData = { cellIdx: idx };
    scene.add(blockMesh);
    cellMeshes.push(blockMesh);

    // Rebord doré (tore)
    const rimGeo = new THREE.TorusGeometry(R_TOP, 0.030, 10, 40);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xCC9933, roughness: 0.35, metalness: 0.55 });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.set(x, 0.015, z);
    rimMesh.rotation.x = Math.PI / 2;
    scene.add(rimMesh);

    // Plan invisible pour raycasting
    const hitGeo = new THREE.PlaneGeometry(CELL_W * 0.92, CELL_H * 0.92);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(x, 0.08, z);
    hitMesh.rotation.x = -Math.PI / 2;
    hitMesh.userData = { cellIdx: idx, isHit: true };
    scene.add(hitMesh);
  }

  function buildStoreCell(idx, x, z) {
    const SW = STORE_W * 0.88;       // largeur intérieure du rectangle
    const SH = BOARD_TOTAL_H * 0.82; // longueur intérieure (suit la hauteur du plateau)
    const DEPTH = STORE_D;
    const WALL = 0.07;               // épaisseur des parois

    // Fond du creux rectangulaire
    const floorGeo = new THREE.PlaneGeometry(SW, SH);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x080200, roughness: 1.0, metalness: 0.0 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(x, -DEPTH + 0.005, z);
    scene.add(floorMesh);

    // 4 parois intérieures du rectangle (bois sombre)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3A1A08, roughness: 0.95, metalness: 0.0 });
    const walls = [
      // [largeur, hauteur, posX, posZ, rotY]
      [SW + WALL*2, DEPTH, 0,        SH/2,  0],   // paroi avant
      [SW + WALL*2, DEPTH, 0,       -SH/2,  0],   // paroi arrière
      [WALL,        DEPTH, -SW/2,    0,      0],   // paroi gauche
      [WALL,        DEPTH,  SW/2,    0,      0],   // paroi droite
    ];
    walls.forEach(([w, h, dx, dz]) => {
      const wGeo = new THREE.BoxGeometry(w, h, WALL);
      const wMesh = new THREE.Mesh(wGeo, wallMat);
      wMesh.position.set(x + dx, -DEPTH/2, z + dz);
      scene.add(wMesh);
    });

    // Rebord doré rectangulaire (4 barres)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xCC9933, roughness: 0.35, metalness: 0.55 });
    const rimThick = 0.034;
    const rims = [
      [SW + rimThick*2, rimThick,  0,      SH/2 ],
      [SW + rimThick*2, rimThick,  0,     -SH/2 ],
      [rimThick,        SH,       -SW/2,   0     ],
      [rimThick,        SH,        SW/2,   0     ],
    ];
    rims.forEach(([rw, rh, dx, dz]) => {
      const rGeo = new THREE.BoxGeometry(rw, rimThick, rh);
      const rMesh = new THREE.Mesh(rGeo, rimMat);
      rMesh.position.set(x + dx, 0.015, z + dz);
      scene.add(rMesh);
    });

    // Boîte invisible pour raycasting store
    const hitGeo = new THREE.BoxGeometry(SW, DEPTH, SH);
    const hollow = new THREE.Mesh(hitGeo, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.0, depthWrite: false }));
    hollow.position.set(x, -DEPTH/2, z);
    scene.add(hollow);
    storeMeshes.push(hollow);
  }

  // ── Graines ───────────────────────────────────────────────────────────────

  // Positions fixes pour exactement 5 graines dans un creux (disposition en croix + centre)
  const SEED_POSITIONS_5 = [
    { x:  0.00, z:  0.00 },  // centre
    { x: -0.20, z: -0.20 },  // bas-gauche
    { x:  0.20, z: -0.20 },  // bas-droite
    { x: -0.20, z:  0.20 },  // haut-gauche
    { x:  0.20, z:  0.20 },  // haut-droite
  ];

  function buildAllSeeds(board, stores) {
    seedGroups.forEach(g => g && scene.remove(g));
    storeSeedGroups.forEach(g => g && scene.remove(g));
    seedGroups = Array(14).fill(null);
    storeSeedGroups = Array(2).fill(null);

    const startX = -BOARD_TOTAL_W / 2 + BOARD_PAD + STORE_W + GAP + CELL_W / 2;
    const rowZ = [-BOARD_TOTAL_H/4 - ROW_SEP/2, BOARD_TOTAL_H/4 + ROW_SEP/2];

    for (let idx = 0; idx < 14; idx++) {
      const col = idx % 7;
      const row = idx < 7 ? 0 : 1;
      const x = startX + col * (CELL_W + GAP);
      const z = rowZ[row];
      seedGroups[idx] = buildSeedGroup(board[idx], x, z, CELL_W * 0.38, false);
    }

    const storeX = [
      -BOARD_TOTAL_W/2 + BOARD_PAD + STORE_W/2,
       BOARD_TOTAL_W/2 - BOARD_PAD - STORE_W/2
    ];
    for (let s = 0; s < 2; s++) {
      storeSeedGroups[s] = buildSeedGroup(stores[s], storeX[s], 0, STORE_W * 0.38, true);
    }
  }

  function buildSeedGroup(count, cx, cz, radius, isStore) {
    const group = new THREE.Group();
    if (count === 0) { scene.add(group); return group; }

    const seedR = isStore ? 0.085 : 0.115;

    if (!isStore) {
      // Disposition spirale multi-couches : reflète le vrai nombre de graines
      // Couche 0 : 1 graine (centre)
      // Couche 1 : jusqu'à 6 graines en cercle
      // Couche 2 : jusqu'à 12 graines en cercle plus large
      // Au-delà : empilement vertical (couches superposées)
      const BASE_Y = 0.10;
      const LAYER_H = seedR * 2.1; // hauteur entre couches empilées

      // Calcul direct : générer toutes les positions
      const positions = [];
      // Anneau 0 : 1 centre
      positions.push({ x: 0, z: 0, layer: 0 });
      // Anneau 1 : 5 en cercle
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        positions.push({ x: Math.cos(a) * radius * 0.48, z: Math.sin(a) * radius * 0.48, layer: 0 });
      }
      // Anneau 2 : 9 en cercle plus large
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        positions.push({ x: Math.cos(a) * radius * 0.85, z: Math.sin(a) * radius * 0.85, layer: 0 });
      }
      // Couches supplémentaires (empilement) : répète les anneaux en hauteur
      for (let l = 1; l <= 3; l++) {
        positions.push({ x: 0, z: 0, layer: l });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + l * 0.4;
          positions.push({ x: Math.cos(a) * radius * 0.48, z: Math.sin(a) * radius * 0.48, layer: l });
        }
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + l * 0.3;
          positions.push({ x: Math.cos(a) * radius * 0.85, z: Math.sin(a) * radius * 0.85, layer: l });
        }
      }

      const n = Math.min(count, positions.length);
      for (let i = 0; i < n; i++) {
        const p = positions[i];
        const y = BASE_Y + p.layer * LAYER_H;
        const seed = makeSeed(seedR, cx + p.x, y, cz + p.z);
        group.add(seed);
      }
    } else {
      // Pour les stores : placement aléatoire compact
      const visualCount = Math.min(count, 12);
      const placed = [];
      for (let k = 0; k < visualCount; k++) {
        let pos = null;
        for (let t = 0; t < 80; t++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * (radius - seedR * 1.8);
          const px = Math.cos(angle) * dist;
          const pz = Math.sin(angle) * dist;
          let ok = true;
          for (const p of placed) {
            const dx = p.x - px, dz = p.z - pz;
            if (Math.sqrt(dx*dx + dz*dz) < seedR * 2.4) { ok = false; break; }
          }
          if (ok) { pos = { x: px, z: pz }; break; }
        }
        if (!pos) pos = { x: (Math.random()-0.5)*radius*0.9, z: (Math.random()-0.5)*radius*0.9 };
        placed.push(pos);
        const seed = makeSeed(seedR, cx + pos.x, 0.07, cz + pos.z);
        group.add(seed);
      }
    }

    scene.add(group);
    return group;
  }

  function makeSeed(r, x, y, z) {
    const geo = new THREE.SphereGeometry(r, 12, 10);
    // Légère déformation ellipsoïdale pour ressembler à une vraie graine
    geo.scale(0.80, 1.0, 0.80);
    const mat = matSeed.clone();
    // Variation subtile de couleur entre les graines
    const hueShift = (Math.random() - 0.5) * 0.04;
    mat.color.setHSL(0.065 + hueShift, 0.72, 0.52 + Math.random() * 0.10);
    mat.roughness = 0.18 + Math.random() * 0.12;
    const seed = new THREE.Mesh(geo, mat);
    seed.position.set(x, y, z);
    seed.rotation.y = Math.random() * Math.PI;
    seed.castShadow = true;
    seed.receiveShadow = true;
    return seed;
  }

  function refreshSeeds(board, stores) {
    buildAllSeeds(board, stores);
    updateCounters(board, stores);
  }

  // ── Compteurs HTML ────────────────────────────────────────────────────────

  let counterEls = []; // 14 + 2
  let counterLayer = null;

  function buildCounters() {
    counterLayer = document.getElementById('counters-layer');
    counterEls = [];

    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'cell-counter';
      el.dataset.idx = i;
      counterLayer.appendChild(el);
      counterEls.push(el);
    }
    // 2 stores
    for (let s = 0; s < 2; s++) {
      const el = document.createElement('div');
      el.className = 'cell-counter store-counter';
      el.dataset.store = s;
      counterLayer.appendChild(el);
      counterEls.push(el);
    }

    const s = Game.getState();
    updateCounters(s.board, s.stores);
  }

  function updateCounters(board, stores) {
    if (!renderer || !camera || counterEls.length === 0) return;
    const cv = renderer.domElement;
    const rect = cv.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    for (let i = 0; i < 14; i++) {
      const el = counterEls[i];
      const wp = cellWorldPositions[i];
      if (!wp) continue;
      const sp = worldToScreen(wp, W, H);
      el.style.left = (rect.left + sp.x) + 'px';
      el.style.top  = (rect.top  + sp.y - 38) + 'px';
      el.textContent = board[i];
      el.style.display = 'flex';
    }

    // Stores
    for (let s = 0; s < 2; s++) {
      const el = counterEls[14 + s];
      const wp = storeWorldPositions[s];
      if (!wp) continue;
      const sp = worldToScreen(wp, W, H);
      el.style.left = (rect.left + sp.x) + 'px';
      el.style.top  = (rect.top  + sp.y - 44) + 'px';
      el.textContent = stores[s];
      el.style.display = 'flex';
    }
  }

  function worldToScreen(worldPos, W, H) {
    const v = worldPos.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * W,
      y: (-v.y * 0.5 + 0.5) * H
    };
  }

  // ── Anneau de sélection ───────────────────────────────────────────────────

  function showSelectedRing(idx) {
    removeSelectedRing();
    const startX = -BOARD_TOTAL_W / 2 + BOARD_PAD + STORE_W + GAP + CELL_W / 2;
    const rowZ = [-BOARD_TOTAL_H/4 - ROW_SEP/2, BOARD_TOTAL_H/4 + ROW_SEP/2];
    const col = idx % 7, row = idx < 7 ? 0 : 1;
    const x = startX + col * (CELL_W + GAP);
    const z = rowZ[row];
    const ringGeo = new THREE.TorusGeometry(CELL_W * 0.48, 0.045, 10, 40);
    selectedRing = new THREE.Mesh(ringGeo, matSelected);
    selectedRing.position.set(x, 0.14, z);
    selectedRing.rotation.x = Math.PI / 2;
    scene.add(selectedRing);
  }

  function removeSelectedRing() {
    if (selectedRing) { scene.remove(selectedRing); selectedRing = null; }
  }

  // ── Trajet animé ──────────────────────────────────────────────────────────

  // Retourne la position 3D du centre d'une case board[idx]
  function getCellWorldPos(idx) {
    return cellWorldPositions[idx] ? cellWorldPositions[idx].clone() : null;
  }

  // Affiche les anneaux de trajet (une couleur dégradée par ordre de semis)
  // et lance la particule voyageuse
  function showTravelPath(orderIdxs) {
    clearTravelPath();
    if (!orderIdxs || orderIdxs.length === 0) return;

    // Construire les positions 3D dans l'ordre
    const positions = [];
    for (const idx of orderIdxs) {
      const pos = getCellWorldPos(idx);
      if (pos) positions.push(pos);
    }
    if (positions.length === 0) return;

    travelPath = positions;
    travelStep = 0;
    travelProgress = 0;
    travelActive = true;

    // Anneaux colorés sur chaque case du trajet
    orderIdxs.forEach((idx, i) => {
      const pos = getCellWorldPos(idx);
      if (!pos) return;
      // Couleur : vert→jaune→orange selon la progression
      const t = i / Math.max(orderIdxs.length - 1, 1);
      const r = Math.floor(50 + t * 205);
      const g = Math.floor(255 - t * 130);
      const b = 30;
      const color = (r << 16) | (g << 8) | b;

      const ringGeo = new THREE.TorusGeometry(CELL_W * 0.44, 0.028, 8, 36);
      const ringMat = new THREE.MeshStandardMaterial({
        color, roughness: 0.3, metalness: 0.4,
        transparent: true, opacity: 0.75,
        emissive: color, emissiveIntensity: 0.4
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(pos.x, 0.05, pos.z);
      ring.rotation.x = Math.PI / 2;
      ring.userData.travelRing = true;
      ring.userData.baseOpacity = 0.75;
      ring.userData.phase = i * 0.4; // décalage de phase pour l'animation
      scene.add(ring);
      arrowMeshes.push(ring);

      // Numéro d'ordre en HTML (petit badge)
      // (géré par les compteurs existants, on ne duplique pas)
    });

    // Particule voyageuse : sphère lumineuse jaune-or
    const pGeo = new THREE.SphereGeometry(0.13, 12, 10);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xFFEE44,
      emissive: 0xFFCC00,
      emissiveIntensity: 1.2,
      roughness: 0.1, metalness: 0.3,
      transparent: true, opacity: 0.92
    });
    travelParticle = new THREE.Mesh(pGeo, pMat);
    travelParticle.position.copy(positions[0]);
    travelParticle.position.y = 0.45;
    travelParticle.castShadow = false;
    scene.add(travelParticle);
  }

  function clearTravelPath() {
    arrowMeshes.forEach(m => scene.remove(m));
    arrowMeshes = [];
    if (travelParticle) { scene.remove(travelParticle); travelParticle = null; }
    travelPath = [];
    travelActive = false;
    travelStep = 0;
    travelProgress = 0;
  }

  // Appelé à chaque frame pour animer la particule
  function animateTravel(dt) {
    if (!travelActive || travelPath.length < 2) return;

    travelProgress += 0.07; // avance par frame
    if (travelProgress >= 1.0) {
      travelProgress = 0;
      travelStep++;
      if (travelStep >= travelPath.length - 1) {
        // Trajet terminé : la particule reste sur la dernière case, puis disparaît
        travelActive = false;
        setTimeout(() => clearTravelPath(), 800);
        return;
      }
    }

    // Interpolation curviligne entre les deux cases (arc parabolique)
    const from = travelPath[travelStep];
    const to   = travelPath[travelStep + 1];
    const t = travelProgress;
    const mx = from.x + (to.x - from.x) * t;
    const mz = from.z + (to.z - from.z) * t;
    // Arc en Y : monte et redescend entre les deux cases
    const arcH = 0.45 + 0.25 * Math.sin(t * Math.PI);
    travelParticle.position.set(mx, arcH, mz);

    // Pulsation lumineuse de la particule
    const pulse = 0.85 + 0.2 * Math.sin(Date.now() * 0.012);
    travelParticle.material.emissiveIntensity = pulse;
    travelParticle.scale.setScalar(pulse * 0.95 + 0.05);
  }

  // ── Événements souris ─────────────────────────────────────────────────────

  function getIntersectedCell(event) {
    const cv = renderer.domElement;
    const rect = cv.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (h.object.userData.cellIdx !== undefined) return h.object.userData.cellIdx;
    }
    return -1;
  }

  function onMouseMove(event) {
    const idx = getIntersectedCell(event);
    hoverCell = idx;
    renderer.domElement.style.cursor = idx >= 0 ? 'pointer' : 'default';
  }

  function onMouseClick(event) {
    const idx = getIntersectedCell(event);
    if (idx >= 0 && clickCallback) clickCallback(idx);
  }

  // ── Boucle d'animation ────────────────────────────────────────────────────

  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.016;

    if (selectedRing) {
      selectedRing.material.opacity = 0.4 + Math.sin(t * 3) * 0.2;
      selectedRing.scale.setScalar(1 + Math.sin(t * 3) * 0.025);
    }

    // Animer les anneaux de trajet (scintillement)
    for (const ring of arrowMeshes) {
      const phase = ring.userData.phase || 0;
      ring.material.opacity = (ring.userData.baseOpacity || 0.75) * (0.7 + 0.3 * Math.sin(t * 4 + phase));
    }

    // Animer la particule voyageuse
    animateTravel();

    renderer.render(scene, camera);

    // Mise à jour positions compteurs à chaque frame (pour resize)
    if (counterEls.length > 0) {
      const s = Game.getState();
      updateCounters(s.board, s.stores);
    }
  }

  return { init, refreshSeeds, showSelectedRing, removeSelectedRing, showTravelPath, clearTravelPath };
})();
