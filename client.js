// Updated client.js (full file - copy-paste replace)
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');
const menu = document.getElementById('menu');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const colorSelect = document.getElementById('colorSelect');
const playButton = document.getElementById('playButton');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesUl = document.getElementById('messages');

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

const players = {};
let myId = null;
let cameraX = 0;
let cameraY = 0;
const movement = { up: false, down: false, left: false, right: false };
const speed = 5;

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function addMessageToChat(name, color, message) {
  const li = document.createElement('li');
  li.innerHTML = `<span style="color: ${color}; font-weight: bold;">${escapeHtml(name)}:</span> ${escapeHtml(message)}`;
  messagesUl.appendChild(li);
  if (messagesUl.children.length > 50) {
    messagesUl.removeChild(messagesUl.firstChild);
  }
  messagesUl.scrollTop = messagesUl.scrollHeight;
}

playButton.addEventListener('click', () => {
  const color = colorSelect.value;
  const name = nameInput.value.trim() || 'Anonymous';
  menu.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { color, name });
});

sendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { message });
    chatInput.value = '';
  }
}

// Keyboard controls (ignore if typing in chat input)
document.addEventListener('keydown', (e) => {
  if (e.target === chatInput) return;
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = true; break;
    case 's': movement.down = true; break;
    case 'a': movement.left = true; break;
    case 'd': movement.right = true; break;
    case 'enter':
      if (document.activeElement !== chatInput) {
        e.preventDefault();
        chatInput.focus();
      }
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.target === chatInput) return;
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = false; break;
    case 's': movement.down = false; break;
    case 'a': movement.left = false; break;
    case 'd': movement.right = false; break;
  }
});

// Socket events
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('currentPlayers', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    players[id] = {
      ...serverPlayers[id],
      lastMessage: '',
      messageTimeout: 0
    };
  });
});

socket.on('playerJoined', (data) => {
  players[data.id] = {
    ...data,
    lastMessage: '',
    messageTimeout: 0
  };
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('chatMessage', (data) => {
  addMessageToChat(data.name, data.color, data.message);
  if (players[data.id]) {
    players[data.id].lastMessage = data.message;
    players[data.id].messageTimeout = Date.now() + 5000;
  }
});

socket.on('playerDisconnected', (id) => {
  delete players[id];
});

// Draw speech bubble (world coordinates)
function drawBubble(x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let displayText = text;
  const padding = 10;
  const maxWidth = 200;
  while (ctx.measureText(displayText).width > maxWidth - 2 * padding && displayText.length > 0) {
    displayText = displayText.slice(0, -1);
  }
  if (displayText.length < text.length) displayText += '...';

  const metrics = ctx.measureText(displayText);
  const bubbleWidth = Math.max(50, metrics.width + 2 * padding);
  const bubbleHeight = 28;
  const bubbleY = y - bubbleHeight - 10;

  // Bubble background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(x - bubbleWidth / 2, bubbleY, bubbleWidth, bubbleHeight);

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - bubbleWidth / 2, bubbleY, bubbleWidth, bubbleHeight);

  // Tail
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(x - 6, bubbleY + bubbleHeight);
  ctx.lineTo(x + 6, bubbleY + bubbleHeight);
  ctx.lineTo(x, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#222';
  ctx.fillText(displayText, x, bubbleY + bubbleHeight / 2);

  ctx.restore();
}

// Game loop
function gameLoop() {
  // Update camera
  if (players[myId]) {
    cameraX = players[myId].x + 25 - canvas.width / 2;
    cameraY = players[myId].y + 25 - canvas.height / 2;
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, cameraX));
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, cameraY));
  }

  // Update my position (prediction)
  if (players[myId]) {
    let changed = false;
    if (movement.up) { players[myId].y -= speed; changed = true; }
    if (movement.down) { players[myId].y += speed; changed = true; }
    if (movement.left) { players[myId].x -= speed; changed = true; }
    if (movement.right) { players[myId].x += speed; changed = true; }

    // Clamp to world
    players[myId].x = Math.max(0, Math.min(WORLD_WIDTH - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(WORLD_HEIGHT - 50, players[myId].y));

    if (changed) {
      socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
    }
  }

  // Main canvas: clear viewport
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Translate for camera
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  // Draw all players + bubbles
  Object.values(players).forEach(player => {
    // Square
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, 50, 50);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.x, player.y, 50, 50);

    // Bubble if active
    if (player.lastMessage && Date.now() < player.messageTimeout) {
      drawBubble(player.x + 25, player.y, player.lastMessage, player.color);
    }
  });

  ctx.restore();

  // Minimap
  mctx.clearRect(0, 0, 200, 150);
  mctx.fillStyle = '#228B22';
  mctx.fillRect(0, 0, 200, 150);

  const scaleX = 200 / WORLD_WIDTH;
  const scaleY = 150 / WORLD_HEIGHT;

  // Players as dots
  Object.values(players).forEach(player => {
    const mx = player.x * scaleX;
    const my = player.y * scaleY;
    mctx.fillStyle = player.color;
    mctx.beginPath();
    mctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    mctx.fill();
  });

  // Self dot (highlighted)
  if (players[myId]) {
    const mx = players[myId].x * scaleX;
    const my = players[myId].y * scaleY;
    mctx.save();
    mctx.shadowColor = '#ffffff';
    mctx.shadowBlur = 6;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.arc(mx, my, 3, 0, Math.PI * 2);
    mctx.fill();
    mctx.shadowBlur = 0;
    mctx.restore();
  }

  // Viewport rect
  const vx = cameraX * scaleX;
  const vy = cameraY * scaleY;
  const vw = canvas.width * scaleX;
  const vh = canvas.height * scaleY;
  mctx.strokeStyle = '#ffffff';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(vx, vy, vw, vh);

  requestAnimationFrame(gameLoop);
}

gameLoop();
