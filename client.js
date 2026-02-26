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
let cameraX = 0, cameraY = 0;
const movement = { up: false, down: false, left: false, right: false };
const baseSpeed = 5;
const sprintSpeed = 10;
let sprinting = false;
let stamina = 100;
let mouseX = 0, mouseY = 0;
let lastDirection = { x: 1, y: 0 };

playButton.addEventListener('click', () => {
  const color = colorSelect.value;
  const name = nameInput.value.trim() || 'Player';
  menu.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { color, name });
});

sendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
  const msg = chatInput.value.trim();
  if (msg) {
    socket.emit('chatMessage', { message: msg });
    chatInput.value = '';
  }
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = true; break;
    case 's': movement.down = true; break;
    case 'a': movement.left = true; break;
    case 'd': movement.right = true; break;
    case 'shift': sprinting = true; break;
    case 'e':
      if (players[myId]) {
        const p = players[myId];
        let closest = null, minD = 80;
        bows.forEach(b => {
          const d = Math.hypot(p.x + 25 - b.x, p.y + 25 - b.y);
          if (d < minD) { minD = d; closest = b; }
        });
        if (closest) socket.emit('pickupBow', closest.id);
      }
      break;
  }
});

document.addEventListener('keyup', e => {
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = false; break;
    case 's': movement.down = false; break;
    case 'a': movement.left = false; break;
    case 'd': movement.right = false; break;
    case 'shift': sprinting = false; break;
  }
});

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left + cameraX;
  mouseY = e.clientY - r.top + cameraY;
});

canvas.addEventListener('click', () => {
  if (players[myId]?.equipped?.type === 'bow') {
    const p = players[myId];
    const angle = Math.atan2(mouseY - p.y - 25, mouseX - p.x - 25);
    socket.emit('shoot', { angle });
  }
});

function gameLoop() {
  const speed = sprinting ? sprintSpeed : baseSpeed;
  if (players[myId]) {
    if (movement.up)    players[myId].y -= speed;
    if (movement.down)  players[myId].y += speed;
    if (movement.left)  players[myId].x -= speed;
    if (movement.right) players[myId].x += speed;

    players[myId].x = Math.max(0, Math.min(WORLD_WIDTH - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(WORLD_HEIGHT - 50, players[myId].y));

    socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
  }

  // Camera
  if (players[myId]) {
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, players[myId].x + 25 - canvas.width / 2));
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, players[myId].y + 25 - canvas.height / 2));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  // Draw players, bows, projectiles, health bars, etc. (your existing drawing code here)
  // ... paste your previous drawing logic ...

  ctx.restore();

  // Update UI bars
  if (players[myId]) {
    healthText.textContent = `Health: ${Math.floor(players[myId].health || 100)}/100`;
    healthBar.style.width = `${players[myId].health || 100}%`;

    staminaText.textContent = `Stamina: ${Math.floor(stamina)}/100`;
    staminaBar.style.width = `${stamina}%`;
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Socket listeners – make sure these match server events
socket.on('currentPlayers', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    players[id] = serverPlayers[id];
  });
  if (socket.id in players) myId = socket.id;
});

socket.on('playerJoined', data => {
  players[data.id] = data;
  if (data.id === socket.id) myId = data.id;
});

socket.on('playerMoved', data => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('chatMessage', data => addMessageToChat(data.name, data.color, data.message));

socket.on('bowPickedUp', data => {
  bows = bows.filter(b => b.id !== data.bowId);
});

socket.on('playerUpdate', data => {
  if (players[data.id]) {
    players[data.id].inventory = data.inventory;
    players[data.id].equipped = data.equipped;
  }
});

// Add other events you had (projectileFired, playerHit, etc.)
