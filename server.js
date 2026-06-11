const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const rooms = new Map();
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
};

const ROOM_TIMEOUT = 30 * 60 * 1000;
const MAX_ROOMS = 1000;

function generateRoomCode() {
  return 'SONGO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeRoomId(roomId) {
  return (roomId || '').trim().toUpperCase();
}

function createOrJoinRoom(providedRoomId, options = {}) {
  const action = String(options.action || '').toLowerCase();
  const roomId = normalizeRoomId(providedRoomId) || generateRoomCode();
  let room = rooms.get(roomId);

  if (!room) {
    room = { state: null, createdAt: Date.now(), playerCount: 0 };
    rooms.set(roomId, room);
  }

  if (action === 'join') {
    if (!room) {
      return { roomId, created: false, role: 'guest', playerCount: 0, full: false, state: null, exists: false, error: 'Salle introuvable' };
    }
    if (room.playerCount >= 2) {
      return { roomId, created: false, role: 'guest', playerCount: room.playerCount, full: true, state: room.state, exists: true };
    }
    room.playerCount = Math.min(2, room.playerCount + 1);
    room.updatedAt = Date.now();
    rooms.set(roomId, room);
    return { roomId, created: false, role: 'guest', playerCount: room.playerCount, full: room.playerCount >= 2, state: room.state, exists: true };
  }

  if (action === 'create') {
    if (room.playerCount >= 2) {
      return { roomId, created: false, role: 'host', playerCount: room.playerCount, full: true, state: room.state };
    }
    if (!room.playerCount) {
      room.playerCount = 1;
      room.updatedAt = Date.now();
      rooms.set(roomId, room);
      return { roomId, created: true, role: 'host', playerCount: room.playerCount, full: false, state: room.state };
    }
    return { roomId, created: false, role: 'host', playerCount: room.playerCount, full: room.playerCount >= 2, state: room.state };
  }

  if (room.playerCount >= 2) {
    return { roomId, created: false, role: 'guest', playerCount: room.playerCount, full: true, state: room.state, exists: true };
  }

  if (!room.playerCount) {
    room.playerCount = 1;
    room.updatedAt = Date.now();
    rooms.set(roomId, room);
    return { roomId, created: true, role: 'host', playerCount: room.playerCount, full: false, state: room.state, exists: true };
  }

  return { roomId, created: false, role: room.playerCount === 1 ? 'guest' : 'host', playerCount: room.playerCount, full: room.playerCount >= 2, state: room.state, exists: true };
}

function cleanupOldRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TIMEOUT) {
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanupOldRooms, 5 * 60 * 1000);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Corps JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(rootDir, 'index.html') : path.join(rootDir, pathname);
  if (!filePath.startsWith(rootDir)) {
    sendJson(res, 403, { error: 'Accès refusé' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Introuvable' });
        return;
      }
      filePath = path.join(rootDir, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        sendJson(res, 500, { error: 'Erreur lecture fichier' });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = requestUrl;

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const requestedRoomId = body && body.roomId ? body.roomId : '';
      const action = body && body.action ? body.action : (requestedRoomId ? 'join' : 'create');
      if (rooms.size >= MAX_ROOMS && !rooms.has(normalizeRoomId(requestedRoomId))) {
        sendJson(res, 503, { error: 'Serveur surchargé' });
        return;
      }
      const roomResult = createOrJoinRoom(requestedRoomId, { action });
      if (action === 'join' && !roomResult.exists) {
        sendJson(res, 404, { error: roomResult.error || 'Salle introuvable' });
        return;
      }
      sendJson(res, 200, {
        roomId: roomResult.roomId,
        created: roomResult.created,
        role: roomResult.role,
        playerCount: roomResult.playerCount,
        full: roomResult.full,
        state: roomResult.state
      });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  const match = pathname.match(/^\/api\/rooms\/([^/]+)\/state$/);
  if (match && req.method === 'GET') {
    const roomId = decodeURIComponent(match[1]);
    const room = rooms.get(roomId);
    sendJson(res, 200, { roomId, state: room ? room.state : null });
    return;
  }

  if (match && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const roomId = decodeURIComponent(match[1]);
      if (!body || !body.state) {
        sendJson(res, 400, { error: 'État requis' });
        return;
      }
      const room = rooms.get(roomId) || { state: null, createdAt: Date.now() };
      room.state = body.state;
      rooms.set(roomId, room);
      sendJson(res, 200, { roomId, ok: true });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('Serveur Songo prêt sur http://localhost:' + PORT);
  });
}

module.exports = {
  createOrJoinRoom,
  generateRoomCode,
  normalizeRoomId
};
