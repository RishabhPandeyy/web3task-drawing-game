const socket = io();
const roomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
const sessionKey = `quickdraw:${roomCode}`;
const playerSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
const roomCodeDisplay = document.querySelector('#room-code-display');
const footerCode = document.querySelector('#footer-code');
const playerList = document.querySelector('#player-list');
const playerCount = document.querySelector('#player-count');
const startButton = document.querySelector('#start-game');
const waitingMessage = document.querySelector('#waiting-message');
const errorMessage = document.querySelector('#lobby-error');
let currentRoom = null;

if (!roomCode || !playerSession) window.location.replace(roomCode ? `/?room=${roomCode}` : '/');
roomCodeDisplay.textContent = roomCode || '-----';
footerCode.textContent = roomCode || '-----';

function setError(message) { errorMessage.textContent = message || ''; }
function addInitials(name) { return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); }

function renderPlayers(room) {
  currentRoom = room;
  const players = room.players;
  playerCount.textContent = players.length;
  playerList.replaceChildren();
  players.forEach((player, index) => {
    const item = document.createElement('li');
    item.className = `player-row${player.connected ? '' : ' disconnected'}`;
    const avatar = document.createElement('span');
    avatar.className = `player-avatar avatar-${index % 5}`;
    avatar.textContent = addInitials(player.name);
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name;
    const tag = document.createElement('span');
    tag.className = player.isHost ? 'host-tag' : 'player-presence';
    tag.textContent = player.isHost ? 'HOST' : player.connected ? 'READY' : 'RECONNECTING';
    item.append(avatar, name, tag);
    playerList.append(item);
  });
  const isHost = room.hostId === playerSession.playerId;
  startButton.disabled = !isHost || players.filter((player) => player.connected).length < 2 || room.gameStatus !== 'lobby';
  startButton.querySelector('span:first-child').textContent = isHost ? 'Start the game' : 'Waiting for host';
  waitingMessage.textContent = players.filter((player) => player.connected).length < 2 ? 'Waiting for at least one more player...' : isHost ? 'Everyone in? Deal the first word.' : 'The host will start the game shortly.';
  if (room.gameStatus === 'playing') window.location.replace(`/game.html?room=${roomCode}`);
  if (room.gameStatus === 'ended') window.location.replace(`/game.html?room=${roomCode}`);
}

socket.on('connect', () => {
  socket.emit('resume_room', { roomCode, playerId: playerSession?.playerId }, (result) => {
    if (!result?.ok) { setError(result?.error || 'Could not reconnect to the room.'); return; }
    setError('');
  });
});
socket.on('connect_error', () => setError('Connection lost. Retrying…'));
socket.on('room_updated', renderPlayers);
socket.on('game_started', () => window.location.assign(`/game.html?room=${roomCode}`));
socket.on('player_joined', ({ playerName }) => { waitingMessage.textContent = `${playerName} just joined. Looking good.`; });

document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    document.querySelector('#copy-code').textContent = '✓';
    setTimeout(() => { document.querySelector('#copy-code').textContent = '▣'; }, 1400);
  } catch { setError(`Share this code: ${roomCode}`); }
});

startButton.addEventListener('click', () => {
  setError('');
  socket.emit('start_game', (result) => {
    if (!result?.ok) setError(result?.error || 'Could not start the game.');
  });
});