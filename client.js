// Updated client.js (full file - copy-paste replace)
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const colorSelect = document.getElementById('colorSelect');
const playButton = document.getElementById('playButton');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesUl = document.getElementById('messages');

const players = {};
let myId = null;
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
      // Focus chat if not focused
      if (document.activeElement !== chatInput) {
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

// Draw speech bubble
function drawBubble(x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const padding = 12;
  const bubbleWidth = Math.max(60, Math.min(220, metrics.width + 2 * padding));
  const bubbleHeight = 32;
  const bubbleY = y - bubbleHeight - 8;

  // Bubble background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(x - bubbleWidth / 2, bubbleY, bubbleWidth, bubbleHeight);

  // Border
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - bubbleWidth / 2, bubbleY, bubbleWidth, bubbleHeight);

  // Tail (triangle pointing down)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 8);
  ctx.lineTo(x + 8, y - 8);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#333';
  ctx.fillText(text, x, bubbleY + bubbleHeight / 2);
  ctx.restore();
}

// Game loop
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update my position
  if (players[myId]) {
    let changed = false;
    if (movement.up) { players[myId].y -= speed; changed = true; }
    if (movement.down) { players[myId].y += speed; changed = true; }
    if (movement.left) { players[myId].x -= speed; changed = true; }
    if (movement.right) { players[myId].x += speed; changed = true; }

    // Bounds
    players[myId].x = Math.max(0, Math.min(canvas.width - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(canvas.height - 50, players[myId].y));

    if (changed) {
      socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
    }
  }

  // Draw players + bubbles
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

  requestAnimationFrame(gameLoop);
}

gameLoop();
chatInput.focus(); // Focus chat on load? No, after play.
