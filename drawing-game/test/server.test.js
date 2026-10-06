const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, joinRoom, getPublicRoom, MAX_PLAYERS } = require('../server/roomManager');
const { getWordChoices, normalizeWord } = require('../server/wordManager');
const { scoreCorrectGuess, scoreDrawer } = require('../server/scoring');
const { sanitizeDrawing } = require('../server/gameManager');

test('creates unique room codes and marks the creator as host', () => {
  const rooms = new Map();
  const first = createRoom(rooms, 'socket-a', 'Ada', 'player-a');
  const second = createRoom(rooms, 'socket-b', 'Lin', 'player-b');
  assert.notEqual(first.room.code, second.room.code);
  assert.equal(first.room.hostId, 'player-a');
  assert.equal(first.player.isHost, true);
});

test('validates names, room codes, duplicate names, and capacity', () => {
  const rooms = new Map();
  const { room } = createRoom(rooms, 'socket-a', 'Ada', 'player-a');
  assert.throws(() => joinRoom(rooms, 'NOPE', 'socket-x', 'Lin', 'player-x'), /Room not found/);
  assert.throws(() => joinRoom(rooms, room.code, 'socket-x', '  ', 'player-x'), /player name/);
  assert.throws(() => joinRoom(rooms, room.code, 'socket-x', 'ada', 'player-x'), /already in this room/);
  for (let index = 2; index <= MAX_PLAYERS; index += 1) joinRoom(rooms, room.code, `socket-${index}`, `Player ${index}`, `player-${index}`);
  assert.throws(() => joinRoom(rooms, room.code, 'socket-full', 'Extra', 'player-extra'), /full/);
});

test('public room snapshots never include selected words or word choices', () => {
  const rooms = new Map();
  const { room } = createRoom(rooms, 'socket-a', 'Ada', 'player-a');
  room.selectedWord = 'Elephant';
  room.wordChoices = ['Lion', 'Cat', 'Dog'];
  const snapshot = getPublicRoom(room);
  assert.equal('selectedWord' in snapshot, false);
  assert.equal('wordChoices' in snapshot, false);
});

test('selects distinct word choices and normalizes guesses', () => {
  const choices = getWordChoices(5);
  assert.equal(choices.length, 5);
  assert.equal(new Set(choices).size, 5);
  assert.equal(normalizeWord('  PIZZA  '), normalizeWord('pizza'));
  assert.equal(normalizeWord('two   words'), 'two words');
});

test('awards speed-scaled guess points and a drawer bonus', () => {
  assert.equal(scoreCorrectGuess(60, 60), 200);
  assert.equal(scoreCorrectGuess(0, 60), 100);
  assert.equal(scoreDrawer(2), 100);
});

test('keeps normalized drawing widths small and clamps untrusted point data', () => {
  assert.deepEqual(sanitizeDrawing({ x: -1, y: 2, color: 'bad', size: 0.01, tool: 'eraser' }), {
    x: 0, y: 1, color: '#1f2937', size: 0.01, tool: 'eraser'
  });
  assert.equal(sanitizeDrawing({ x: 'invalid', y: 0.5 }), null);
  assert.equal(sanitizeDrawing({ x: 0.5, y: 0.5, size: 10 }).size, 0.1);
});