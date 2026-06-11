const test = require('node:test');
const assert = require('node:assert/strict');

const { createOrJoinRoom } = require('../server');

test('createOrJoinRoom creates a room with a host and blocks a third player', () => {
  const roomId = 'ROOM-123';
  const first = createOrJoinRoom(roomId, { action: 'create' });
  assert.equal(first.created, true);
  assert.equal(first.role, 'host');
  assert.equal(first.playerCount, 1);
  assert.equal(first.full, false);

  const second = createOrJoinRoom(roomId, { action: 'join' });
  assert.equal(second.created, false);
  assert.equal(second.role, 'guest');
  assert.equal(second.playerCount, 2);
  assert.equal(second.full, true);

  const third = createOrJoinRoom(roomId, { action: 'join' });
  assert.equal(third.full, true);
  assert.equal(third.role, 'guest');
  assert.equal(third.playerCount, 2);
});

test('createOrJoinRoom can generate a room code when none is provided', () => {
  const created = createOrJoinRoom('', { action: 'create' });
  assert.equal(created.created, true);
  assert.equal(created.role, 'host');
  assert.match(created.roomId, /^SONGO-[A-Z0-9]+$/);
});
