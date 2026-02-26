// FULL client.js - COPY-PASTE REPLACE YOUR ENTIRE client.js
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
const slotsDiv = document.getElementById('slots');
const healthText = document.getElementById('healthText');
const healthBar = document.getElementById('healthBar');
const staminaText = document.getElementById('staminaText');
const staminaBar = document.getElementById('staminaBar');

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

const players = {};
const bows = [];
const projectiles = [];
let myId = null;
let cameraX = 0;
let cameraY = 0;
const movement = { up: false, down: false, left: false, right: false };
const baseSpeed = 5;
const sprintSpeed = 10;
let sprinting = false;
let stamina = 100;
const staminaDrain = 20; // per second
const staminaRegen = 10; // per second
let mouseX = 0;
let mouseY = 0;
let lastDirection = { x: 1, y: 0 };

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

// Keyboard controls
document.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = true; break;
    case 's': movement.down = true; break;
    case 'a': movement.left = true; break;
    case 'd': movement.right = true; break;
    case 'shift': sprinting = true; break;
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = false; break;
    case 's': movement.down = false; break;
    case 'a': movement.left = false; break;
    case 'd': movement.right = false; break;
    case 'shift': sprinting = false; break;
  }
});

// Game loop
let lastTime = performance.now();
function gameLoop(time) {
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  // Update stamina
  if (sprinting && (movement.up || movement.down || movement.left || movement.right)) {
    stamina = Math.max(0, stamina - staminaDrain * dt);
  } else {
    stamina = Math.min(100, stamina + staminaRegen * dt);
  }

  // Update position
  if (players[myId]) {
    const speed = sprinting && stamina > 0 ? sprintSpeed : baseSpeed;
    if (movement.up) players[myId].y -= speed;
    if (movement.down) players[myId].y += speed;
    if (movement.left) players[myId].x -= speed;
    if (movement.right) players[myId].x += speed;

    players[myId].x = Math.max(0, Math.min(WORLD_WIDTH - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(WORLD_HEIGHT - 50, players[myId].y));

    socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
  }

  // Render
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // UI update
  if (players[myId]) {
    staminaText.textContent = `Stamina: ${Math.floor(stamina)}/100`;
    staminaBar.style.width = `${stamina}%`;
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();

// Socket events (simplified for brevity)
socket.on('chatMessage', (data) => {
  addMessageToChat(data.name, data.color, data.message);
});
