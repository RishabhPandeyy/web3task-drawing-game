const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_SETTINGS = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hintCount: 2,
  isPublic: false,
  wordMode: 'normal',
  customWords: []
};
const MAX_PLAYERS = 20;

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

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

function cleanWord(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 28);
}

function cleanAvatar(value) {
  const avatarIndex = Number(value);
  if (!Number.isFinite(avatarIndex)) return 0;
  return Math.max(0, Math.min(7, Math.round(avatarIndex)));
}

function normalizeSettings(settings = {}) {
  const customWords = String(settings.customWords || '')
    .split(/[\n,]+/)
    .map(cleanWord)
    .filter(Boolean)
    .slice(0, 80);
  const wordMode = ['normal', 'hidden', 'combination'].includes(settings.wordMode) ? settings.wordMode : DEFAULT_SETTINGS.wordMode;
  return {
    maxPlayers: clampNumber(settings.maxPlayers, DEFAULT_SETTINGS.maxPlayers, 2, MAX_PLAYERS),
    rounds: clampNumber(settings.rounds, DEFAULT_SETTINGS.rounds, 2, 10),
    drawTime: clampNumber(settings.drawTime, DEFAULT_SETTINGS.drawTime, 15, 240),
    wordCount: clampNumber(settings.wordCount, DEFAULT_SETTINGS.wordCount, 1, 5),
    hintCount: clampNumber(settings.hintCount, DEFAULT_SETTINGS.hintCount, 0, 5),
    isPublic: Boolean(settings.isPublic),
    wordMode,
    customWords
  };
}

function createRoom(rooms, socketId, name, playerToken, settings = {}, avatar = 0) {
  const cleanPlayerName = cleanName(name);
  if (!cleanPlayerName) throw new Error('Enter a player name first.');
  const code = makeRoomCode(rooms);
  const roomSettings = normalizeSettings(settings);
  const player = { id: playerToken, name: cleanPlayerName, avatar: cleanAvatar(avatar), score: 0, isHost: true, connected: true, guessedCorrectly: false };
  const room = {
    code, hostId: player.id, players: new Map([[player.id, player]]),
    status: 'lobby', currentDrawerId: null, currentRound: 0, totalRounds: roomSettings.rounds,
    selectedWord: null, wordChoices: [], hint: null, turnEndsAt: null, turnEnding: false, guessedPlayerIds: new Set(),
    turnOrder: [], turnIndex: -1, timer: null, disconnectTimers: new Map(),
    settings: roomSettings,
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return { room, player };
}

function joinRoom(rooms, codeValue, socketId, name, playerToken, avatar = 0) {
  const code = String(codeValue || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found. Check the code and try again.');
  if (room.status !== 'lobby') throw new Error('This game has already started.');
  const cleanPlayerName = cleanName(name);
  if (!cleanPlayerName) throw new Error('Enter a player name first.');
  const duplicate = [...room.players.values()].find((player) => player.name.toLocaleLowerCase() === cleanPlayerName.toLocaleLowerCase());
  if (duplicate) throw new Error('That player name is already in this room.');
  if (room.players.size >= room.settings.maxPlayers) throw new Error(`This room is full (${room.settings.maxPlayers} players maximum).`);
  const player = { id: playerToken, name: cleanPlayerName, avatar: cleanAvatar(avatar), score: 0, isHost: false, connected: true, guessedCorrectly: false };
  room.players.set(player.id, player);
  return { room, player };
}

function getJoinablePublicRoom(rooms) {
  return [...rooms.values()].find((room) => room.settings.isPublic && room.status === 'lobby' && room.players.size < room.settings.maxPlayers);
}

function listPublicRooms(rooms) {
  return [...rooms.values()]
    .filter((room) => room.settings.isPublic && room.status === 'lobby')
    .map((room) => ({
      roomCode: room.code,
      players: room.players.size,
      maxPlayers: room.settings.maxPlayers,
      rounds: room.settings.rounds,
      drawTime: room.settings.drawTime
    }));
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
    settings: {
      maxPlayers: room.settings.maxPlayers,
      rounds: room.settings.rounds,
      drawTime: room.settings.drawTime,
      wordCount: room.settings.wordCount,
      hintCount: room.settings.hintCount,
      isPublic: room.settings.isPublic,
      wordMode: room.settings.wordMode
    },
    players: [...room.players.values()].map(({ id, name, avatar, score, isHost, connected, guessedCorrectly }) => ({ id, name, avatar, score, isHost, connected, guessedCorrectly }))
  };
}

module.exports = { DEFAULT_SETTINGS, MAX_PLAYERS, cleanName, cleanAvatar, normalizeSettings, createRoom, joinRoom, getRoom, getJoinablePublicRoom, listPublicRooms, getPublicRoom };
