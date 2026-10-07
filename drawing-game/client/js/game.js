const socket = io(window.QUICKDRAW_CONFIG.serverUrl || undefined);
const roomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
const sessionKey = `quickdraw:${roomCode}`;
const playerSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
const canvas = document.querySelector('#drawing-canvas');
const context = canvas.getContext('2d');
const scoreList = document.querySelector('#score-list');
const chatLog = document.querySelector('#chat-log');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatHint = document.querySelector('#chat-hint');
const choiceOverlay = document.querySelector('#choice-overlay');
const endOverlay = document.querySelector('#end-overlay');
const gameOverOverlay = document.querySelector('#game-over-overlay');
const wordChoices = document.querySelector('#word-choices');
const toast = document.querySelector('#toast');
let gameState = null;
let canDraw = false;
let drawing = false;
let currentStroke = null;
let strokes = [];
let selectedColor = '#202526';
let brushSize = 8;
let activeTool = 'brush';
let timerEndsAt = null;
let toastTimeout;

if (!roomCode || !playerSession) window.location.replace(roomCode ? `/?room=${roomCode}` : '/');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function normalizePoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
}

function strokeStyle(stroke) {
  context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  context.lineWidth = Math.max(1, stroke.size * canvas.width);
  context.lineCap = 'round';
  context.lineJoin = 'round';
}

function drawSegment(stroke, from, to) {
  strokeStyle(stroke);
  context.beginPath();
  context.moveTo(from.x * canvas.width, from.y * canvas.height);
  context.lineTo(to.x * canvas.width, to.y * canvas.height);
  context.stroke();
}

function redrawCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((stroke) => {
    const first = stroke.points[0];
    if (!first) return;
    if (stroke.points.length === 1) drawSegment(stroke, first, first);
    for (let index = 1; index < stroke.points.length; index += 1) drawSegment(stroke, stroke.points[index - 1], stroke.points[index]);
  });
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const previousWidth = canvas.width;
  const previousHeight = canvas.height;
  const previous = document.createElement('canvas');
  previous.width = previousWidth;
  previous.height = previousHeight;
  previous.getContext('2d').drawImage(canvas, 0, 0);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  context.setTransform(1, 0, 0, 1, 0, 0);
  if (strokes.length) redrawCanvas();
  else if (previousWidth && previousHeight) context.drawImage(previous, 0, 0, canvas.width, canvas.height);
}

function drawPayload(point) {
  return { ...point, color: selectedColor, size: brushSize / canvas.getBoundingClientRect().width, tool: activeTool };
}

function beginStroke(event, emit = true) {
  if (!canDraw || event.button > 0) return;
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  drawing = true;
  const point = normalizePoint(event);
  currentStroke = { color: selectedColor, size: brushSize / canvas.getBoundingClientRect().width, tool: activeTool, points: [point] };
  strokes.push(currentStroke);
  drawSegment(currentStroke, point, point);
  if (emit) socket.emit('draw_start', { ...point, color: selectedColor, size: currentStroke.size, tool: activeTool });
}

function moveStroke(event, emit = true) {
  if (!drawing || !currentStroke) return;
  const point = normalizePoint(event);
  const previous = currentStroke.points[currentStroke.points.length - 1];
  currentStroke.points.push(point);
  drawSegment(currentStroke, previous, point);
  if (emit) socket.emit('draw_move', { ...point, color: selectedColor, size: currentStroke.size, tool: activeTool });
}

function endStroke(emit = true) {
  if (!drawing) return;
  drawing = false;
  currentStroke = null;
  if (emit) socket.emit('draw_end', { x: 0, y: 0, color: selectedColor, size: brushSize / canvas.getBoundingClientRect().width, tool: activeTool });
}

function receiveStrokePoint(payload, starts, ends) {
  if (starts) {
    currentStroke = { color: payload.color, size: payload.size, tool: payload.tool, points: [{ x: payload.x, y: payload.y }] };
    strokes.push(currentStroke);
    drawSegment(currentStroke, currentStroke.points[0], currentStroke.points[0]);
    return;
  }
  if (ends) {
    currentStroke = null;
    return;
  }
  if (payload && currentStroke) {
    const point = { x: payload.x, y: payload.y };
    drawSegment(currentStroke, currentStroke.points[currentStroke.points.length - 1], point);
    currentStroke.points.push(point);
  }
}

function avatarIndex(player) {
  if (Number.isFinite(Number(player.avatar))) return Math.max(0, Math.min(7, Number(player.avatar)));
  const source = `${player.id || ''}:${player.name || ''}`;
  let hash = 0;
  for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  return hash % 8;
}

function createAvatar(player) {
  const avatar = document.createElement('span');
  avatar.className = `score-avatar character-avatar character-avatar-${avatarIndex(player)}`;
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

function renderPlayers(players) {
  scoreList.replaceChildren();
  const ordered = [...players].sort((left, right) => right.score - left.score);
  document.querySelector('#sidebar-player-count').textContent = ordered.length;
  ordered.forEach((player, index) => {
    const row = document.createElement('li');
    row.className = `score-row${player.id === gameState?.currentDrawerId ? ' is-drawing' : ''}${player.guessedCorrectly ? ' has-guessed' : ''}`;
    const rank = document.createElement('span');
    rank.className = 'score-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const avatar = createAvatar(player);
    const name = document.createElement('span');
    name.className = 'score-player-name';
    name.textContent = player.name;
    const role = document.createElement('span');
    role.className = 'score-role';
    role.textContent = player.id === gameState?.currentDrawerId ? 'DRAWING' : player.guessedCorrectly ? 'GOT IT' : '';
    const score = document.createElement('strong');
    score.className = 'score-value';
    score.textContent = player.score.toLocaleString();
    row.append(rank, avatar, name, role, score);
    scoreList.append(row);
  });
}

function renderState(state) {
  gameState = state;
  document.querySelector('#round-number').textContent = Math.max(1, state.currentRound);
  document.querySelector('#round-total').textContent = state.totalRounds;
  const drawer = state.players.find((player) => player.id === state.currentDrawerId);
  const self = state.players.find((player) => player.id === playerSession.playerId);
  document.querySelector('#drawer-label').textContent = drawer ? `${drawer.name} is drawing` : 'Waiting for the artist';
  document.querySelector('#word-display').textContent = state.isDrawer && state.word ? state.word : state.hint || (state.gameStatus === 'lobby' ? 'Waiting for players…' : 'Waiting for the drawer…');
  document.querySelector('#canvas-status').textContent = state.isDrawer ? 'Your canvas, your rules' : 'Watch closely';
  canDraw = Boolean(state.isDrawer && state.word && state.gameStatus === 'playing');
  document.querySelector('#drawing-tools').classList.toggle('tools-disabled', !canDraw);
  chatInput.disabled = Boolean(state.isDrawer || state.gameStatus !== 'playing');
  chatInput.placeholder = state.isDrawer ? 'You are drawing...' : self?.guessedCorrectly ? 'Send table talk...' : state.gameStatus === 'playing' ? 'Type your guess...' : 'Chat opens when the game starts';
  chatHint.textContent = state.isDrawer ? 'Sketch the word without spelling it out' : self?.guessedCorrectly ? 'You found it. Chat is open.' : 'Enter a guess to score points';
  renderPlayers(state.players);
  if (state.wordChoices?.length) showWordChoices(state.wordChoices);
  else choiceOverlay.hidden = true;
  if (state.turnEndsAt) timerEndsAt = state.turnEndsAt;
}

function showWordChoices(choices) {
  canDraw = false;
  wordChoices.replaceChildren();
  choices.forEach((word) => {
    const button = document.createElement('button');
    button.className = 'word-choice';
    button.type = 'button';
    button.textContent = word;
    button.addEventListener('click', () => socket.emit('choose_word', { word }, (result) => { if (!result?.ok) showToast(result?.error || 'Could not choose that word.'); }));
    wordChoices.append(button);
  });
  choiceOverlay.hidden = false;
  document.querySelector('#canvas-status').textContent = `Choose one of ${choices.length} words`;
}

function addMessage(message, type = 'message') {
  const item = document.createElement('div');
  item.className = `chat-message ${type}`;
  if (message.kind === 'system') item.textContent = message.text;
  else {
    const author = document.createElement('strong');
    author.textContent = message.playerName;
    const text = document.createElement('span');
    text.textContent = message.text;
    item.append(author, text);
  }
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function fitCanvas() {
  resizeCanvas();
}

canvas.addEventListener('pointerdown', (event) => beginStroke(event));
canvas.addEventListener('pointermove', (event) => moveStroke(event));
canvas.addEventListener('pointerup', () => endStroke());
canvas.addEventListener('pointercancel', () => endStroke());
canvas.addEventListener('pointerleave', (event) => { if (event.buttons === 0) endStroke(); });
window.addEventListener('resize', fitCanvas);
new ResizeObserver(fitCanvas).observe(canvas.parentElement);

socket.on('connect', () => {
  document.querySelector('#connection-status').innerHTML = '<span></span> CONNECTED';
  socket.emit('resume_room', { roomCode, playerId: playerSession?.playerId }, (result) => {
    if (!result?.ok) showToast(result?.error || 'Room session expired.');
  });
});
socket.on('disconnect', () => { document.querySelector('#connection-status').innerHTML = '<span></span> RECONNECTING'; showToast('Connection interrupted. Reconnecting…'); });
socket.on('kicked', () => {
  sessionStorage.removeItem(sessionKey);
  window.location.replace('/');
});
socket.on('room_updated', (room) => {
  if (gameState?.gameStatus === 'ended' && room.gameStatus === 'lobby') {
    window.location.assign(`/lobby.html?room=${roomCode}`);
    return;
  }
  renderState({ ...(gameState || {}), ...room, isDrawer: room.currentDrawerId === playerSession.playerId, players: room.players });
});
socket.on('game_state', renderState);
socket.on('draw_start', (payload) => receiveStrokePoint(payload, true, false));
socket.on('draw_move', (payload) => receiveStrokePoint(payload, false, false));
socket.on('draw_end', (payload) => receiveStrokePoint(payload, false, true));
socket.on('clear_canvas', () => { strokes = []; currentStroke = null; context.clearRect(0, 0, canvas.width, canvas.height); });
socket.on('undo_drawing', () => { strokes.pop(); redrawCanvas(); });
socket.on('choose_word_prompt', ({ drawerId }) => { if (drawerId === playerSession.playerId) document.querySelector('#canvas-status').textContent = 'Choose one of three words'; });
socket.on('round_started', ({ endsAt }) => {
  choiceOverlay.hidden = true;
  endOverlay.hidden = true;
  gameOverOverlay.hidden = true;
  timerEndsAt = endsAt;
  addMessage({ kind: 'system', text: 'A new sketch is underway.' });
});
socket.on('timer_update', ({ secondsRemaining, endsAt }) => {
  timerEndsAt = endsAt;
  const timer = document.querySelector('#timer');
  timer.textContent = String(secondsRemaining).padStart(2, '0');
  timer.classList.toggle('timer-urgent', secondsRemaining <= 10);
});
socket.on('correct_guess', ({ playerName, points }) => addMessage({ kind: 'system', text: `${playerName} guessed it! +${points} pts` }));
socket.on('guess_rejected', ({ message }) => showToast(message));
socket.on('chat_message', (message) => addMessage(message, message.kind));
socket.on('round_ended', ({ word, reason }) => {
  canDraw = false;
  endOverlay.hidden = false;
  document.querySelector('#end-kicker').textContent = reason === 'time_up' ? "TIME'S UP" : 'ROUND COMPLETE';
  document.querySelector('#end-title').textContent = 'The word was...';
  document.querySelector('#end-word').textContent = word || '—';
  document.querySelector('#timer').textContent = '00';
  addMessage({ kind: 'system', text: `The word was ${word}.` });
});
socket.on('turn_changed', ({ currentRound }) => {
  endOverlay.hidden = true;
  choiceOverlay.hidden = true;
  gameOverOverlay.hidden = true;
  document.querySelector('#round-number').textContent = currentRound;
  timerEndsAt = null;
  document.querySelector('#timer').textContent = '--';
  strokes = [];
  currentStroke = null;
  redrawCanvas();
});
socket.on('game_over', ({ leaderboard, winner }) => {
  gameOverOverlay.hidden = false;
  endOverlay.hidden = true;
  choiceOverlay.hidden = true;
  document.querySelector('#winner-title').textContent = winner ? `${winner.name} takes it.` : 'Game complete.';
  document.querySelector('#play-again').hidden = gameState?.hostId !== playerSession.playerId;
  const finalList = document.querySelector('#final-leaderboard');
  finalList.replaceChildren();
  leaderboard.forEach((player) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = player.name;
    const score = document.createElement('strong');
    score.textContent = `${player.score} pts`;
    item.append(name, score);
    finalList.append(item);
  });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatInput.disabled) return;
  const self = gameState?.players?.find((player) => player.id === playerSession.playerId);
  socket.emit(self?.guessedCorrectly ? 'chat_message' : 'guess', { text });
  chatInput.value = '';
});

document.querySelectorAll('.swatch').forEach((button) => button.addEventListener('click', () => {
  selectedColor = button.dataset.color;
  activeTool = 'brush';
  document.querySelectorAll('.swatch').forEach((swatch) => swatch.classList.toggle('selected', swatch === button));
  document.querySelector('#brush-tool').classList.add('selected');
  document.querySelector('#eraser-tool').classList.remove('selected');
}));
document.querySelector('#color-picker').addEventListener('input', (event) => {
  selectedColor = event.target.value;
  document.querySelectorAll('.swatch').forEach((swatch) => swatch.classList.remove('selected'));
});
document.querySelector('#brush-size').addEventListener('input', (event) => {
  brushSize = Number(event.target.value);
  document.querySelector('#size-value').textContent = brushSize;
});
document.querySelector('#brush-tool').addEventListener('click', () => {
  activeTool = 'brush';
  document.querySelector('#brush-tool').classList.add('selected');
  document.querySelector('#eraser-tool').classList.remove('selected');
});
document.querySelector('#eraser-tool').addEventListener('click', () => {
  activeTool = 'eraser';
  document.querySelector('#eraser-tool').classList.add('selected');
  document.querySelector('#brush-tool').classList.remove('selected');
});
document.querySelector('#clear-tool').addEventListener('click', () => {
  if (!canDraw) return;
  strokes = [];
  currentStroke = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clear_canvas');
});
document.querySelector('#undo-tool').addEventListener('click', () => {
  if (!canDraw || !strokes.length) return;
  strokes.pop();
  redrawCanvas();
  socket.emit('undo_drawing');
});
document.querySelector('#next-turn-button').addEventListener('click', () => { endOverlay.hidden = true; });
document.querySelector('#play-again').addEventListener('click', () => socket.emit('play_again', (result) => {
  if (result?.ok) window.location.assign(`/lobby.html?room=${roomCode}`);
  else showToast(result?.error || 'Could not reset the game.');
}));

setInterval(() => {
  if (timerEndsAt && !document.querySelector('#timer').classList.contains('timer-urgent')) {
    const secondsRemaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    document.querySelector('#timer').textContent = String(secondsRemaining).padStart(2, '0');
    document.querySelector('#timer').classList.toggle('timer-urgent', secondsRemaining <= 10);
  }
}, 250);
requestAnimationFrame(fitCanvas);
