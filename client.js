// FULL updated client.js - replace your current file
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');
const menu = document.getElementById('menu');
const modeSelect = document.getElementById('modeSelect');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const colorSelect = document.getElementById('colorSelect');
const playButton = document.getElementById('playButton');
const normalBtn = document.getElementById('normalBtn');
const tagBtn = document.getElementById('tagBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesUl = document.getElementById('messages');
const slotsDiv = document.getElementById('slots');
const healthText = document.getElementById('healthText');
const healthBar = document.getElementById('healthBar');
const staminaText = document.getElementById('staminaText');
const staminaBar = document.getElementById('staminaBar');
const playersList = document.getElementById('playersList');
const playerListUl = document.getElementById('playerListUl');

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

let currentMode = null;
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
const maxStamina = 100;
const staminaDrainRate = 25;
const staminaRegenRate = 15;

let mouseX = 0;
let mouseY = 0;
let lastDirection = { x: 1, y: 0 };

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function addMessageToChat(name, color, message) {
  const li = document.createElement('li');
  li.innerHTML = `<span style="color:${color};font-weight:bold">${escapeHtml(name)}:</span> ${escapeHtml(message)}`;
  messagesUl.appendChild(li);
  if (messagesUl.children.length > 50) messagesUl.removeChild(messagesUl.firstChild);
  messagesUl.scrollTop = messagesUl.scrollHeight;
}

function updatePlayersList() {
  if (currentMode !== 'tag') {
    playersList.style.display = 'none';
    return;
  }
  playersList.style.display = 'block';
  playerListUl.innerHTML = '';
  Object.values(players).forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name} (${p.role || '???'})`;
    li.className = p.role === 'tagger' ? 'tagger' : 'runner';
    playerListUl.appendChild(li);
  });
}

playButton.addEventListener('click', () => {
  menu.style.display = 'none';
  modeSelect.style.display = 'flex';
});

normalBtn.addEventListener('click', () => {
  currentMode = 'normal';
  modeSelect.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { color: colorSelect.value, name: nameInput.value.trim() || 'Anonymous', mode: 'normal' });
});

tagBtn.addEventListener('click', () => {
  currentMode = 'tag';
  modeSelect.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { color: colorSelect.value, name: nameInput.value.trim() || 'Anonymous', mode: 'tag' });
});

sendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { message });
    chatInput.value = '';
  }
}

// Mouse & click for shooting
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left + cameraX;
  mouseY = e.clientY - rect.top + cameraY;
});

canvas.addEventListener('click', e => {
  if (e.button === 0 && players[myId]?.equipped?.type === 'bow') {
    const p = players[myId];
    const dx = mouseX - (p.x + 25);
    const dy = mouseY - (p.y + 25);
    const angle = Math.atan2(dy, dx);
    socket.emit('shoot', { angle });
  }
});

// Keyboard
document.addEventListener('keydown', e => {
  if (e.target === chatInput) return;

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
    case '1': case '2': case '3':
      const slot = parseInt(e.key) - 1;
      socket.emit('equipItem', slot);
      break;
    case 'enter':
      if (document.activeElement !== chatInput) {
        e.preventDefault();
        chatInput.focus();
      }
      break;
  }
});

document.addEventListener('keyup', e => {
  if (e.target === chatInput) return;
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = false; break;
    case 's': movement.down = false; break;
    case 'a': movement.left = false; break;
    case 'd': movement.right = false; break;
    case 'shift': sprinting = false; break;
  }
});

function updateInventoryUI() {
  slotsDiv.innerHTML = '';
  if (!players[myId]) return;
  players[myId].inventory.forEach((item, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (players[myId].equipped === item) slot.classList.add('selected');

    const mini = document.createElement('canvas');
    mini.width = 48; mini.height = 48;
    const mctx = mini.getContext('2d');
    drawBowIcon(mctx, 24, 24, 36);
    if (item.type === 'bow') {
      mctx.fillStyle = 'white';
      mctx.font = 'bold 12px Arial';
      mctx.fillText(`${item.uses}/5`, 4, 42);
    }
    slot.appendChild(mini);

    slot.onclick = () => socket.emit('equipItem', i);
    slotsDiv.appendChild(slot);
  });
}

function drawBowIcon(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-6, -24, 12, 48);
  ctx.fillRect(-20, -8, 40, 16);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-16, -12);
  ctx.lineTo(16, 12);
  ctx.stroke();
  ctx.fillStyle = '#ccc';
  ctx.fillRect(-4, -28, 8, 8);
  ctx.restore();
}

function drawEquipped(player) {
  if (!player.equipped || player.equipped.type !== 'bow') return;
  ctx.save();
  ctx.translate(player.x + 25, player.y + 25);

  let angle = Math.atan2(mouseY - (player.y + 25), mouseX - (player.x + 25));
  if (Math.hypot(mouseX - (player.x + 25), mouseY - (player.y + 25)) < 30) {
    angle = Math.atan2(lastDirection.y, lastDirection.x);
  }

  ctx.rotate(angle);
  drawBowIcon(ctx, 0, 0, 64);
  ctx.restore();
}

function drawName(x, y, name) {
  ctx.save();
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.strokeText(name, x, y - 55);
  ctx.fillText(name, x, y - 55);
  ctx.restore();
}

function drawBubble(x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let displayText = text;
  const maxWidth = 180;
  const padding = 10;
  while (ctx.measureText(displayText).width > maxWidth - 2 * padding && displayText.length > 3) {
    displayText = displayText.slice(0, -1);
  }
  if (displayText.length < text.length) displayText += '...';

  const metrics = ctx.measureText(displayText);
  const w = Math.max(60, metrics.width + 2 * padding);
  const h = 28;
  const by = y - h - 12;

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(x - w/2, by, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w/2, by, w, h);

  ctx.beginPath();
  ctx.moveTo(x - 6, by + h);
  ctx.lineTo(x + 6, by + h);
  ctx.lineTo(x, y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#222';
  ctx.fillText(displayText, x, by + h/2);
  ctx.restore();
}

let lastTime = performance.now();

function gameLoop(time = performance.now()) {
  const dt = (time - lastTime) / 1000;
  lastTime = time;

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

  if (players[myId]) {
    cameraX = players[myId].x + 25 - canvas.width / 2;
    cameraY = players[myId].y + 25 - canvas.height / 2;
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, cameraX));
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, cameraY));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  Object.values(players).forEach(p => {
    ctx.fillStyle = p.role === 'tagger' ? '#ff5252' : '#448aff';
    ctx.fillRect(p.x, p.y, 50, 50);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(p.x, p.y, 50, 50);

    drawEquipped(p);
    drawName(p.x + 25, p.y, p.name);

    const barW = 50;
    const barH = 6;
    const pct = (p.health ?? 100) / 100;
    ctx.fillStyle = '#333';
    ctx.fillRect(p.x, p.y - 12, barW, barH);
    ctx.fillStyle = pct > 0.5 ? '#0f0' : pct > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(p.x, p.y - 12, barW * pct, barH);

    if (p.lastMessage && Date.now() < p.messageTimeout) {
      drawBubble(p.x + 25, p.y - 20, p.lastMessage, p.color);
    }
  });

  bows.forEach(b => drawBowIcon(ctx, b.x, b.y, 48));

  if (players[myId]) {
    const p = players[myId];
    bows.forEach(bow => {
      const dist = Math.hypot(p.x + 25 - bow.x, p.y + 25 - bow.y);
      if (dist < 70) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(bow.x, bow.y, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  projectiles.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(-18, -4, 36, 8);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(6, -10);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(255,180,180,0.7)';
    ctx.fillRect(-30, -6, 24, 12);
    ctx.restore();
  });

  ctx.restore();

  // Minimap
  mctx.clearRect(0, 0, minimap.width, minimap.height);
  mctx.fillStyle = '#228B22';
  mctx.fillRect(0, 0, minimap.width, minimap.height);

  const sx = minimap.width / WORLD_WIDTH;
  const sy = minimap.height / WORLD_HEIGHT;

  Object.values(players).forEach(p => {
    mctx.fillStyle = p.role === 'tagger' ? '#ff5252' : '#448aff';
    mctx.beginPath();
    mctx.arc(p.x * sx, p.y * sy, 2.5, 0, Math.PI * 2);
    mctx.fill();
  });

  if (players[myId]) {
    mctx.save();
    mctx.shadowColor = '#fff';
    mctx.shadowBlur = 8;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.arc(players[myId].x * sx, players[myId].y * sy, 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
  }

  const vx = cameraX * sx;
  const vy = cameraY * sy;
  mctx.strokeStyle = '#ffffff';
  mctx.lineWidth = 2;
  mctx.strokeRect(vx, vy, canvas.width * sx, canvas.height * sy);

  // UI updates
  if (players[myId]) {
    const hp = players[myId].health ?? 100;
    healthText.textContent = `Health: ${Math.floor(hp)}/100`;
    healthBar.style.width = `${hp}%`;
    healthBar.style.background = hp > 50 ? '#0f0' : hp > 20 ? '#ff0' : '#f00';

    staminaText.textContent = `Stamina: ${Math.floor(stamina)}/100`;
    staminaBar.style.width = `${(stamina / maxStamina) * 100}%`;
    staminaBar.style.background = stamina > 30 ? '#3498db' : stamina > 10 ? '#f39c12' : '#e74c3c';

    updateInventoryUI();
    updatePlayersList();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Socket events
socket.on('currentState', data => {
  Object.assign(players, data.players);
  bows.length = 0;
  bows.push(...(data.bows || []));
  projectiles.length = 0;
  projectiles.push(...(data.projectiles || []));
  myId = data.myId;
});

socket.on('playerJoined', data => {
  players[data.id] = { ...data, lastMessage: '', messageTimeout: 0 };
});

socket.on('playerMoved', data => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('playerUpdate', data => {
  if (players[data.id]) {
    players[data.id].inventory = data.inventory;
    players[data.id].equipped = data.equipped;
    players[data.id].role = data.role;
  }
});

socket.on('playerHit', data => {
  if (players[data.id]) players[data.id].health = data.health;
});

socket.on('bowPickedUp', data => {
  bows = bows.filter(b => b.id !== data.bowId);
});

socket.on('projectileFired', proj => projectiles.push(proj));

socket.on('projectilesUpdate', projs => {
  projectiles.length = 0;
  projectiles.push(...projs);
});

socket.on('chatMessage', data => {
  addMessageToChat(data.name, data.color, data.message);
  if (players[data.id]) {
    players[data.id].lastMessage = data.message;
    players[data.id].messageTimeout = Date.now() + 5000;
  }
});

socket.on('playerDisconnected', id => {
  delete players[id];
});
