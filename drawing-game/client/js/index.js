const socket = io();
const nameInput = document.querySelector('#player-name');
const roomInput = document.querySelector('#room-code');
const errorMessage = document.querySelector('#home-error');

function showError(message) {
  errorMessage.textContent = message;
}

function getPlayerId(roomCode) {
  const key = `quickdraw:${roomCode}`;
  let session = sessionStorage.getItem(key);
  if (!session) {
    session = JSON.stringify({ playerId: crypto.randomUUID(), name: nameInput.value.trim() });
    sessionStorage.setItem(key, session);
  }
  return JSON.parse(session).playerId;
}

function enterRoom(result, name) {
  const key = `quickdraw:${result.roomCode}`;
  sessionStorage.setItem(key, JSON.stringify({ playerId: result.playerId, name: name.trim() }));
  window.location.assign(`/lobby.html?room=${encodeURIComponent(result.roomCode)}`);
}

document.querySelector('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return showError('Add your name before creating a room.');
  showError('');
  socket.emit('create_room', { name, playerId: crypto.randomUUID() }, (result) => {
    if (!result?.ok) return showError(result?.error || 'Could not create the room. Try again.');
    enterRoom(result, name);
  });
});

document.querySelector('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim().toUpperCase();
  if (!name) return showError('Add your name before joining a room.');
  if (!roomCode) return showError('Enter a room code to join.');
  showError('');
  socket.emit('join_room', { roomCode, name, playerId: crypto.randomUUID() }, (result) => {
    if (!result?.ok) return showError(result?.error || 'Could not join the room. Try again.');
    enterRoom(result, name);
  });
});

roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

const params = new URLSearchParams(window.location.search);
if (params.has('room')) {
  roomInput.value = params.get('room').toUpperCase();
  nameInput.focus();
}