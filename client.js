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

// New stamina elements (add to index.html later)
let staminaText, staminaBar;
function initStaminaUI() {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 8px;
    color: white; font-weight: bold; z-index: 100;
  `;
  staminaText = document.createElement('div');
  staminaText.textContent = 'Stamina: 100/100';
  staminaBarContainer = document.createElement('div');
  staminaBarContainer.style.cssText = 'width:220px; height:16px; background:#333; border-radius:6px; overflow:hidden; margin-top:4px;';
  staminaBar = document.createElement('div');
  staminaBar.style.cssText = 'width:100%; height:100%; background:linear-gradient(to right, #3498db, #3498db); transition: width 0.3s;';
  staminaBarContainer.appendChild(staminaBar);
  container.appendChild(staminaText);
  container.appendChild(staminaBarContainer);
  document.getElementById('game').appendChild(container);
}

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
const sprintSpeed = 9;
let sprinting = false;
let stamina = 100;
const maxStamina = 100;
const staminaDrainRate = 20;    // per second while sprinting
const staminaRegenRate = 12;    // per second when not sprinting

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
  if (messagesUl.children.length > 50) messagesUl.removeChild(messagesUl.firstChild);
  messagesUl.scrollTop = messagesUl.scrollHeight;
}

playButton.addEventListener('click', () => {
  const color = colorSelect.value;
  const name = nameInput.value.trim() || 'Anonymous';
  menu.style.display = 'none';
  gameDiv.style.display = 'block';
  initStaminaUI(); // Create stamina bar UI
  socket.emit('join', { color, name });
});

sendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    sendChatMessage();
    e.preventDefault(); // Prevent any weird behavior
  }
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { message });
    chatInput.value = '';
  }
  chatInput.blur(); // Optional: unfocus after send to allow movement keys again
}

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) + cameraX;
  mouseY = (e.clientY - rect.top) + cameraY;
});

canvas.addEventListener('click', () => {
  if (players[myId] && players[myId].equipped?.type === 'bow') {
    const p = players[myId];
    const dx = mouseX - (p.x + 25);
    const dy = mouseY - (p.y + 25);
    const angle = Math.atan2(dy, dx);
    socket.emit('shoot', { angle });
  }
});

document.addEventListener('keydown', e => {
  if (e.target === chatInput) return;

  switch (e.key.toLowerCase()) {
    case 'w': movement.up = true; break;
    case 's': movement.down = true; break;
    case 'a': movement.left = true; break;
    case 'd': movement.right = true; break;
    case 'shift':
      sprinting = true;
      break;
    case 'e':
      if (players[myId]) {
        const p = players[myId];
        let closestBow = null;
        let minDist = Infinity;

        bows.forEach(bow => {
          const dist = Math.hypot(p.x + 25 - bow.x, p.y + 25 - bow.y);
          if (dist < 70 && dist < minDist) {
            minDist = dist;
            closestBow = bow;
          }
        });

        if (closestBow) {
          socket.emit('pickupBow', closestBow.id);
        }
      }
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
    case 'shift':
      sprinting = false;
      break;
  }
});

function updateInventoryUI() {
  if (!players[myId]) return;
  slotsDiv.innerHTML = '';
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
  const dt = (time - lastTime) / 1000; // delta time in seconds
  lastTime = time;

  // Stamina logic
  if (sprinting && stamina > 0) {
    stamina = Math.max(0, stamina - staminaDrainRate * dt);
  } else if (!sprinting) {
    stamina = Math.min(maxStamina, stamina + staminaRegenRate * dt);
  }

  // Update movement speed
  const currentSpeed = sprinting && stamina > 0 ? sprintSpeed : baseSpeed;

  if (players[myId]) {
    let changed = false;
    if (movement.up)    { players[myId].y -= currentSpeed; changed = true; }
    if (movement.down)  { players[myId].y += currentSpeed; changed = true; }
    if (movement.left)  { players[myId].x -= currentSpeed; changed = true; }
    if (movement.right) { players[myId].x += currentSpeed; changed = true; }

    players[myId].x = Math.max(0, Math.min(WORLD_WIDTH - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(WORLD_HEIGHT - 50, players[myId].y));

    if (changed) {
      socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
    }

    if (movement.right || movement.left || movement.up || movement.down) {
      lastDirection = {
        x: (movement.right ? 1 : 0) - (movement.left ? 1 : 0),
        y: (movement.down ? 1 : 0) - (movement.up ? 1 : 0)
      };
    }
  }

  // Camera
  if (players[myId]) {
    cameraX = players[myId].x + 25 - canvas.width / 2;
    cameraY = players[myId].y + 25 - canvas.height / 2;
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, cameraX));
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, cameraY));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  // Players
  Object.values(players).forEach(p => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 50, 50);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, 50, 50);

    drawEquipped(p);

    // Health bar
    const barW = 50;
    const barH = 6;
    const pct = p.health / 100;
    ctx.fillStyle = '#333';
    ctx.fillRect(p.x, p.y - 12, barW, barH);
    ctx.fillStyle = pct > 0.5 ? '#0f0' : pct > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(p.x, p.y - 12, barW * pct, barH);

    if (p.lastMessage && Date.now() < p.messageTimeout) {
      drawBubble(p.x + 25, p.y, p.lastMessage, p.color);
    }
  });

  // Bows
  bows.forEach(b => {
    drawBowIcon(ctx, b.x, b.y, 48);
  });

  // Highlight nearby bows
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

  // Projectiles
  projectiles.forEach(p => {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(p.x - 10, p.y - 5, 20, 10);
    ctx.fillStyle = 'rgba(255,100,100,0.6)';
    ctx.fillRect(p.x - 14, p.y - 7, 28, 14);
  });

  ctx.restore();

  // Minimap (unchanged)
  mctx.clearRect(0, 0, 200, 150);
  mctx.fillStyle = '#228B22';
  mctx.fillRect(0, 0, 200, 150);

  const sx = 200 / WORLD_WIDTH;
  const sy = 150 / WORLD_HEIGHT;

  Object.values(players).forEach(p => {
    const mx = p.x * sx;
    const my = p.y * sy;
    mctx.fillStyle = p.color;
    mctx.beginPath();
    mctx.arc(mx, my, 2, 0, Math.PI * 2);
    mctx.fill();
  });

  if (players[myId]) {
    const mx = players[myId].x * sx;
    const my = players[myId].y * sy;
    mctx.save();
    mctx.shadowColor = '#fff';
    mctx.shadowBlur = 8;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.arc(mx, my, 4, 0, Math.PI * 2);
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
    healthText.textContent = `Health: ${players[myId].health}/100`;
    const hpct = players[myId].health;
    healthBar.style.width = hpct + '%';
    healthBar.style.background = hpct > 50 ? 'linear-gradient(to right, #0f0, #0f0)' :
                                 hpct > 20 ? 'linear-gradient(to right, #ff0, #ff0)' :
                                 'linear-gradient(to right, #f00, #f00)';

    // Stamina UI
    staminaText.textContent = `Stamina: ${Math.round(stamina)}/${maxStamina}`;
    const spct = (stamina / maxStamina) * 100;
    staminaBar.style.width = spct + '%';
    staminaBar.style.background = spct > 30 ? 'linear-gradient(to right, #3498db, #3498db)' :
                                  spct > 10 ? 'linear-gradient(to right, #f39c12, #f39c12)' :
                                  'linear-gradient(to right, #e74c3c, #e74c3c)';

    updateInventoryUI();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();

// Socket events
socket.on('connect', () => { myId = socket.id; });

socket.on('currentState', data => {
  Object.assign(players, data.players);
  bows.length = 0; bows.push(...(data.bows || []));
  projectiles.length = 0; projectiles.push(...(data.projectiles || []));
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
  }
});

socket.on('playerHit', data => {
  if (players[data.id]) players[data.id].health = data.health;
});

socket.on('bowPickedUp', data => {
  bows = bows.filter(b => b.id !== data.bowId);
});

socket.on('projectileFired', proj => projectiles.push(proj));

socket.on('projectilesUpdate', projs => projectiles = projs);

socket.on('chatMessage', data => {
  addMessageToChat(data.name, data.color, data.message);
  if (players[data.id]) {
    players[data.id].lastMessage = data.message;
    players[data.id].messageTimeout = Date.now() + 5000;
  }
});

socket.on('playerDisconnected', id => delete players[id]);
