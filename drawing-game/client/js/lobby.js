const socket = io();
const roomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
const sessionKey = `quickdraw:${roomCode}`;
const playerSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
const roomCodeDisplay = document.querySelector('#room-code-display');
const footerCode = document.querySelector('#footer-code');
const playerList = document.querySelector('#player-list');
const playerCount = document.querySelector('#player-count');
const capacityLabel = document.querySelector('#capacity-label');
const settingsSummary = document.querySelector('#settings-summary');
const startButton = document.querySelector('#start-game');
const waitingMessage = document.querySelector('#waiting-message');
const errorMessage = document.querySelector('#lobby-error');
let currentRoom = null;

if (!roomCode || !playerSession) window.location.replace(roomCode ? `/?room=${roomCode}` : '/');
roomCodeDisplay.textContent = roomCode || '-----';
footerCode.textContent = roomCode || '-----';

function setError(message) { errorMessage.textContent = message || ''; }
function avatarIndex(player) {
  if (Number.isFinite(Number(player.avatar))) return Math.max(0, Math.min(7, Number(player.avatar)));
  const source = `${player.id || ''}:${player.name || ''}`;
  let hash = 0;
  for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  return hash % 8;
}

function createAvatar(player) {
  const avatar = document.createElement('span');
  avatar.className = `player-avatar character-avatar character-avatar-${avatarIndex(player)}`;
  avatar.setAttribute('role', 'img');
  avatar.setAttribute('aria-label', `${player.name} avatar`);
  const face = document.createElement('span');
  face.className = 'avatar-face';
  const hair = document.createElement('span');
  hair.className = 'avatar-hair';
  const eyes = document.createElement('span');
  eyes.className = 'avatar-eyes';
  const smile = document.createElement('span');
  smile.className = 'avatar-smile';
  face.append(hair, eyes, smile);
  avatar.append(face);
  return avatar;
}

function renderPlayers(room) {
  currentRoom = room;
  const players = room.players;
  const isHost = room.hostId === playerSession.playerId;
  playerCount.textContent = players.length;
  capacityLabel.textContent = `UP TO ${room.settings?.maxPlayers || 8}`;
  settingsSummary.replaceChildren(
    ...[
      `${room.settings?.rounds || 3} rounds`,
      `${room.settings?.drawTime || 60}s draw`,
      `${room.settings?.wordCount || 3} words`,
      `${room.settings?.hintCount ?? 2} hints`,
      room.settings?.isPublic ? 'public' : 'private',
      room.settings?.wordMode || 'normal'
    ].map((label) => {
      const item = document.createElement('span');
      item.textContent = label.toUpperCase();
      return item;
    })
  );
  playerList.replaceChildren();
  players.forEach((player) => {
    const item = document.createElement('li');
    item.className = `player-row${player.connected ? '' : ' disconnected'}`;
    const avatar = createAvatar(player);
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name;
    const tag = document.createElement('span');
    tag.className = player.isHost ? 'host-tag' : 'player-presence';
    tag.textContent = player.isHost ? 'HOST' : player.connected ? 'READY' : 'RECONNECTING';
    item.append(avatar, name, tag);
    if (isHost && !player.isHost && room.gameStatus === 'lobby') {
      const kickButton = document.createElement('button');
      kickButton.className = 'kick-button';
      kickButton.type = 'button';
      kickButton.textContent = 'KICK';
      kickButton.addEventListener('click', () => socket.emit('kick_player', { playerId: player.id }, (result) => {
        if (!result?.ok) setError(result?.error || 'Could not remove that player.');
      }));
      item.append(kickButton);
    }
    playerList.append(item);
  });
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
socket.on('kicked', () => {
  sessionStorage.removeItem(sessionKey);
  window.location.replace('/');
});

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
