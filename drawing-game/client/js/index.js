const socket = io();
const nameInput = document.querySelector('#player-name');
const roomInput = document.querySelector('#room-code');
const errorMessage = document.querySelector('#home-error');
const avatarOptions = document.querySelector('#avatar-options');
const privateOptions = document.querySelector('#private-options');
const privateToggle = document.querySelector('#private-room-toggle');
const createRoomButton = document.querySelector('#create-room-button');
const privateToggleLabel = privateToggle.querySelector('span:first-child');
const privateToggleIcon = privateToggle.querySelector('span:last-child');
let privateMode = false;
let selectedAvatar = Number(localStorage.getItem('quickdraw:avatar') || 0);

function showError(message) {
  errorMessage.textContent = message;
}

function numberValue(selector) {
  return Number(document.querySelector(selector).value);
}

function collectSettings(isPrivate = false) {
  return {
    maxPlayers: numberValue('#max-players'),
    rounds: numberValue('#rounds'),
    drawTime: numberValue('#draw-time'),
    wordCount: numberValue('#word-count'),
    hintCount: numberValue('#hint-count'),
    wordMode: document.querySelector('#word-mode').value,
    isPublic: !isPrivate,
    customWords: document.querySelector('#custom-words').value
  };
}

function avatarMarkup(index, sizeClass = 'avatar-choice-preview') {
  const avatar = document.createElement('span');
  avatar.className = `${sizeClass} character-avatar character-avatar-${index}`;
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

function renderAvatarOptions() {
  avatarOptions.replaceChildren();
  for (let index = 0; index < 8; index += 1) {
    const button = document.createElement('button');
    button.className = `avatar-choice${index === selectedAvatar ? ' selected' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-label', `Choose avatar ${index + 1}`);
    button.setAttribute('aria-pressed', String(index === selectedAvatar));
    button.append(avatarMarkup(index));
    button.addEventListener('click', () => {
      selectedAvatar = index;
      localStorage.setItem('quickdraw:avatar', String(selectedAvatar));
      renderAvatarOptions();
    });
    avatarOptions.append(button);
  }
}

function enterRoom(result, name) {
  const key = `quickdraw:${result.roomCode}`;
  sessionStorage.setItem(key, JSON.stringify({ playerId: result.playerId, name: name.trim(), avatar: selectedAvatar }));
  window.location.assign(`/lobby.html?room=${encodeURIComponent(result.roomCode)}`);
}

document.querySelector('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return showError('Add your name before creating a room.');
  showError('');
  socket.emit('create_room', { name, playerId: crypto.randomUUID(), avatar: selectedAvatar, settings: collectSettings(privateMode) }, (result) => {
    if (!result?.ok) return showError(result?.error || 'Could not create the room. Try again.');
    enterRoom(result, name);
  });
});

privateToggle.addEventListener('click', () => {
  privateMode = !privateMode;
  privateOptions.hidden = !privateMode;
  privateToggle.setAttribute('aria-expanded', String(privateMode));
  privateToggleLabel.textContent = privateMode ? 'Public room' : 'Private room';
  privateToggleIcon.textContent = privateMode ? '↑' : '↓';
  createRoomButton.querySelector('span:first-child').textContent = privateMode ? 'Create private room' : 'Create public room';
  showError('');
});

document.querySelector('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim().toUpperCase();
  if (!name) return showError('Add your name before joining a room.');
  if (!roomCode) return showError('Enter a room code to join.');
  showError('');
  socket.emit('join_room', { roomCode, name, playerId: crypto.randomUUID(), avatar: selectedAvatar }, (result) => {
    if (!result?.ok) return showError(result?.error || 'Could not join the room. Try again.');
    enterRoom(result, name);
  });
});

document.querySelector('#join-public').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return showError('Add your name before joining a public room.');
  showError('');
  socket.emit('join_public_room', { name, playerId: crypto.randomUUID(), avatar: selectedAvatar }, (result) => {
    if (!result?.ok) return showError(result?.error || 'No public room is available.');
    enterRoom(result, name);
  });
});

roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

const params = new URLSearchParams(window.location.search);
if (params.has('room')) {
  roomInput.value = params.get('room').toUpperCase();
  nameInput.focus();
}

renderAvatarOptions();
