const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname));

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;
const players = {};
const bows = []; // {id, x, y}
const projectiles = []; // {id, x, y, vx, vy, ownerId}

let bowIdCounter = 0;
let projIdCounter = 0;

// Spawn 10 bows initially
for (let i = 0; i < 10; i++) {
  bows.push({
    id: bowIdCounter++,
    x: Math.random() * (WORLD_WIDTH - 100) + 50,
    y: Math.random() * (WORLD_HEIGHT - 100) + 50
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.emit('currentState', { players, bows, projectiles });

  socket.on('join', (data) => {
    const name = (data.name || 'Anonymous').trim().substring(0, 16);
    players[socket.id] = {
      x: Math.random() * (WORLD_WIDTH - 100) + 50,
      y: Math.random() * (WORLD_HEIGHT - 100) + 50,
      color: data.color,
      name,
      health: 100,
      inventory: [], // array of {type: 'bow', uses: 5}
      equipped: null, // {type: 'bow', uses: 5}
      lastShot: 0
    };
    io.emit('playerJoined', { id: socket.id, ...players[socket.id] });
  });

  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      let p = players[socket.id];
      p.x = Math.max(0, Math.min(WORLD_WIDTH - 50, data.x));
      p.y = Math.max(0, Math.min(WORLD_HEIGHT - 50, data.y));

      // Check bow pickup
      for (let i = bows.length - 1; i >= 0; i--) {
        const b = bows[i];
        if (Math.hypot(p.x + 25 - b.x, p.y + 25 - b.y) < 60) {
          if (p.inventory.length < 3) {
            p.inventory.push({ type: 'bow', uses: 5 });
            bows.splice(i, 1);
            io.emit('bowPickedUp', { bowId: b.id, playerId: socket.id });
          }
          break;
        }
      }

      socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y });
    }
  });

  socket.on('equipItem', (slotIndex) => {
    if (players[socket.id]) {
      const p = players[socket.id];
      if (slotIndex >= 0 && slotIndex < p.inventory.length) {
        p.equipped = p.inventory[slotIndex];
      } else {
        p.equipped = null;
      }
      io.emit('playerEquipped', { id: socket.id, equipped: p.equipped });
    }
  });

  socket.on('shoot', (data) => {  // data: {angle}
    const p = players[socket.id];
    if (!p || !p.equipped || p.equipped.type !== 'bow' || Date.now() - p.lastShot < 3000) return;

    p.lastShot = Date.now();
    p.equipped.uses--;
    if (p.equipped.uses <= 0) {
      p.equipped = null;
      p.inventory = p.inventory.filter(item => item.uses > 0);
    }

    const speed = 12;
    const vx = Math.cos(data.angle) * speed;
    const vy = Math.sin(data.angle) * speed;

    const proj = {
      id: projIdCounter++,
      x: p.x + 25,
      y: p.y + 25,
      vx, vy,
      ownerId: socket.id
    };
    projectiles.push(proj);

    io.emit('projectileFired', proj);
    io.emit('playerUpdate', { id: socket.id, equipped: p.equipped, inventory: p.inventory });
  });

  socket.on('chatMessage', (data) => { /* unchanged */ });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

setInterval(() => {
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Check hits
    for (const id in players) {
      const p = players[id];
      if (id !== proj.ownerId && Math.hypot(proj.x - (p.x + 25), proj.y - (p.y + 25)) < 40) {
        p.health = Math.max(0, p.health - 5);
        io.emit('playerHit', { id, health: p.health });
        projectiles.splice(i, 1);
        break;
      }
    }

    // Remove off-screen
    if (proj.x < -50 || proj.x > WORLD_WIDTH + 50 || proj.y < -50 || proj.y > WORLD_HEIGHT + 50) {
      projectiles.splice(i, 1);
    }
  }

  io.emit('projectilesUpdate', projectiles);
}, 50); // ~20 fps sync

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server on ${PORT}`));
