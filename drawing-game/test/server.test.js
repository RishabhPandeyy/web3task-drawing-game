const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, joinRoom, getPublicRoom, DEFAULT_SETTINGS, MAX_PLAYERS, normalizeSettings } = require('../server/roomManager');
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
  for (let index = 2; index <= DEFAULT_SETTINGS.maxPlayers; index += 1) joinRoom(rooms, room.code, `socket-${index}`, `Player ${index}`, `player-${index}`);
  assert.throws(() => joinRoom(rooms, room.code, 'socket-full', 'Extra', 'player-extra'), /full/);
});

test('normalizes host-configurable room settings', () => {
  const settings = normalizeSettings({ maxPlayers: 99, rounds: 1, drawTime: 999, wordCount: 0, hintCount: 99, isPublic: true, wordMode: 'hidden', customWords: 'Alpha, Beta\nGamma' });
  assert.equal(settings.maxPlayers, MAX_PLAYERS);
  assert.equal(settings.rounds, 2);
  assert.equal(settings.drawTime, 240);
  assert.equal(settings.wordCount, 1);
  assert.equal(settings.hintCount, 5);
  assert.equal(settings.isPublic, true);
  assert.equal(settings.wordMode, 'hidden');
  assert.deepEqual(settings.customWords, ['Alpha', 'Beta', 'Gamma']);
});

test('keeps selected player avatars in public room snapshots', () => {
  const rooms = new Map();
  const { room } = createRoom(rooms, 'socket-a', 'Ada', 'player-a', {}, 3);
  joinRoom(rooms, room.code, 'socket-b', 'Lin', 'player-b', 12);
  const snapshot = getPublicRoom(room);
  assert.equal(snapshot.players[0].avatar, 3);
  assert.equal(snapshot.players[1].avatar, 7);
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

test('the single HTML entry loads React without a server-served Socket.IO dependency', () => {
  const files = ['index.html'];
  for (const file of files) {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'client', file), 'utf8');
    assert.match(html, /type="module" src="\/src\/main\.tsx"/);
    assert.doesNotMatch(html, /\/socket\.io\/socket\.io\.js/);
    assert.doesNotMatch(html, /web3task-drawing-game\.onrender\.com/);
  }
});
