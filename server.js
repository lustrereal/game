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
const bows = [];
const projectiles = [];

let bowCounter = 0;
let projCounter = 0;

// Spawn bows on server start
for (let i = 0; i < 18; i++) {
  bows.push({
    id: bowCounter++,
    x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
    y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join', (data) => {
    const name = (data.name || 'Anonymous').trim().substring(0, 16);
    players[socket.id] = {
      id: socket.id,
      x: Math.floor(Math.random() * 600) + 200,
      y: Math.floor(Math.random() * 400) + 200,
      color: data.color || 'blue',
      name,
      health: 100,
      inventory: [],
      equipped: null,
      lastShot: 0,           // timestamp of last shot
      lastMessage: '',
      messageTimeout: 0
    };

    // Send full current state to new player
    socket.emit('currentState', {
      players,
      bows,
      projectiles,
      myId: socket.id
    });

    // Notify others of new player
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = Math.max(0, Math.min(WORLD_WIDTH - 50, data.x));
      players[socket.id].y = Math.max(0, Math.min(WORLD_HEIGHT - 50, data.y));
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: players[socket.id].x,
        y: players[socket.id].y
      });
    }
  });

  socket.on('chatMessage', (data) => {
    if (players[socket.id] && data.message?.trim()) {
      const msg = data.message.trim().substring(0, 120);
      io.emit('chatMessage', {
        id: socket.id,
        name: players[socket.id].name,
        color: players[socket.id].color,
        message: msg
      });
    }
  });

  socket.on('pickupBow', (bowId) => {
    if (!players[socket.id]) return;
    const p = players[socket.id];
    const bowIndex = bows.findIndex(b => b.id === bowId);
    if (bowIndex === -1) return;

    const bow = bows[bowIndex];
    const dist = Math.hypot(p.x + 25 - bow.x, p.y + 25 - bow.y);

    if (dist < 80 && p.inventory.length < 3) {
      p.inventory.push({ type: 'bow', uses: 5 });
      bows.splice(bowIndex, 1);
      io.emit('bowPickedUp', { bowId });
      io.emit('playerUpdate', {
        id: socket.id,
        inventory: p.inventory,
        equipped: p.equipped
      });
    }
  });

  socket.on('equipItem', (slotIndex) => {
    if (!players[socket.id]) return;
    const p = players[socket.id];
    if (slotIndex >= 0 && slotIndex < p.inventory.length) {
      p.equipped = p.inventory[slotIndex];
    } else {
      p.equipped = null;
    }
    io.emit('playerUpdate', {
      id: socket.id,
      inventory: p.inventory,
      equipped: p.equipped
    });
  });

  socket.on('shoot', (data) => {
    const p = players[socket.id];
    if (!p) return;
    if (!p.equipped || p.equipped.type !== 'bow') return;
    if (Date.now() - p.lastShot < 3000) return; // 3-second cooldown

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
      id: projCounter++,
      x: p.x + 25,
      y: p.y + 25,
      vx,
      vy,
      ownerId: socket.id
    };

    projectiles.push(proj);
    io.emit('projectileFired', proj);
    io.emit('playerUpdate', {
      id: socket.id,
      inventory: p.inventory,
      equipped: p.equipped
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Projectile update loop (runs ~20 times per second)
setInterval(() => {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Check collision with players
    let hit = false;
    for (const id in players) {
      if (id === proj.ownerId) continue;
      const p = players[id];
      const dx = proj.x - (p.x + 25);
      const dy = proj.y - (p.y + 25);
      if (Math.hypot(dx, dy) < 35) {
        p.health = Math.max(0, p.health - 5);
        io.emit('playerHit', { id, health: p.health });
        projectiles.splice(i, 1);
        hit = true;
        break;
      }
    }

    // Remove if off map
    if (!hit && (
      proj.x < -50 ||
      proj.x > WORLD_WIDTH + 50 ||
      proj.y < -50 ||
      proj.y > WORLD_HEIGHT + 50
    )) {
      projectiles.splice(i, 1);
    }
  }

  // Broadcast current projectiles to all clients
  io.emit('projectilesUpdate', projectiles);
}, 50); // 20 updates per second

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
