const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;

function makeRoomCode(rooms) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < 5; index += 1) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not generate a unique room code. Please try again.');
}

function cleanName(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
}

function createRoom(rooms, socketId, name, playerToken) {
  const cleanPlayerName = cleanName(name);
  if (!cleanPlayerName) throw new Error('Enter a player name first.');
  const code = makeRoomCode(rooms);
  const player = { id: playerToken, name: cleanPlayerName, score: 0, isHost: true, connected: true, guessedCorrectly: false };
  const room = {
    code, hostId: player.id, players: new Map([[player.id, player]]),
    status: 'lobby', currentDrawerId: null, currentRound: 0, totalRounds: 3,
    selectedWord: null, wordChoices: [], turnEndsAt: null, turnEnding: false, guessedPlayerIds: new Set(),
    turnOrder: [], turnIndex: -1, timer: null, disconnectTimers: new Map(),
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return { room, player };
}

function joinRoom(rooms, codeValue, socketId, name, playerToken) {
  const code = String(codeValue || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found. Check the code and try again.');
  if (room.status !== 'lobby') throw new Error('This game has already started.');
  const cleanPlayerName = cleanName(name);
  if (!cleanPlayerName) throw new Error('Enter a player name first.');
  const duplicate = [...room.players.values()].find((player) => player.name.toLocaleLowerCase() === cleanPlayerName.toLocaleLowerCase());
  if (duplicate) throw new Error('That player name is already in this room.');
  if (room.players.size >= MAX_PLAYERS) throw new Error('This room is full (8 players maximum).');
  const player = { id: playerToken, name: cleanPlayerName, score: 0, isHost: false, connected: true, guessedCorrectly: false };
  room.players.set(player.id, player);
  return { room, player };
}

function getRoom(rooms, code) {
  return rooms.get(String(code || '').toUpperCase());
}

function getPublicRoom(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    gameStatus: room.status,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    currentDrawerId: room.currentDrawerId,
    turnEndsAt: room.turnEndsAt,
    players: [...room.players.values()].map(({ id, name, score, isHost, connected, guessedCorrectly }) => ({ id, name, score, isHost, connected, guessedCorrectly }))
  };
}

module.exports = { MAX_PLAYERS, cleanName, createRoom, joinRoom, getRoom, getPublicRoom };