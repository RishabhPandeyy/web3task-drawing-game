const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameManager } = require('../server/gameManager');

function setup(t) {
  const rooms = new Map();
  const identities = new Map();
  const io = { to: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
  const manager = createGameManager(io, rooms, identities);
  t.after(() => {
    for (const room of rooms.values()) {
      clearInterval(room.timer);
      for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
    }
  });
  function socket(id) {
    const handlers = new Map();
    manager.register({ id, on: (event, handler) => handlers.set(event, handler), emit() {}, join() {} });
    return { send: (event, ...args) => handlers.get(event)(...args) };
  }
  return { rooms, socket };
}

test('host can start after lobby resumes before the old home socket disconnects', (t) => {
  const { rooms, socket } = setup(t);
  const home = socket('host-home');
  let created;
  home.send('create_room', { name: 'Host', playerId: 'host' }, (result) => { created = result; });
  const guest = socket('guest');
  guest.send('join_room', { roomCode: created.roomCode, name: 'Guest', playerId: 'guest' }, (result) => assert.equal(result.ok, true));
  const lobby = socket('host-lobby');
  lobby.send('resume_room', { roomCode: created.roomCode, playerId: 'host' }, (result) => assert.equal(result.ok, true));
  home.send('disconnect');
  const room = rooms.get(created.roomCode);
  assert.equal(room.players.get('host').connected, true);
  assert.equal(room.disconnectTimers.has('host'), false);
  lobby.send('start_game', (result) => assert.equal(result.ok, true));
  assert.equal(room.status, 'playing');
  lobby.send('disconnect');
  assert.equal(room.players.get('host').connected, false);
  assert.equal(room.disconnectTimers.has('host'), true);
});

test('host can start after the old home socket closes before lobby reconnects', (t) => {
  const { rooms, socket } = setup(t);
  const home = socket('host-home');
  let created;
  home.send('create_room', { name: 'Host', playerId: 'host' }, (result) => { created = result; });
  home.send('disconnect');
  const room = rooms.get(created.roomCode);
  assert.equal(room.players.get('host').connected, false);
  const lobby = socket('host-lobby');
  lobby.send('resume_room', { roomCode: created.roomCode, playerId: 'host' }, (result) => assert.equal(result.ok, true));
  assert.equal(room.disconnectTimers.has('host'), false);
  const guest = socket('guest');
  guest.send('join_room', { roomCode: created.roomCode, name: 'Guest', playerId: 'guest' }, (result) => assert.equal(result.ok, true));
  lobby.send('start_game', (result) => assert.equal(result.ok, true));
  assert.equal(room.status, 'playing');
});
