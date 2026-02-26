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

// Spawn bows once when server starts
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
    const mode = data.mode || 'normal';

    let role = null;
    let color = data.color || 'blue';

    if (mode === 'tag') {
      // Random role assignment (30% chance to be tagger to start)
      role = Math.random() < 0.3 ? 'tagger' : 'runner';
      color = role === 'tagger' ? '#ff5252' : '#448aff';
    }

    players[socket.id] = {
      id: socket.id,
      x: Math.floor(Math.random() * 600) + 200,
      y: Math.floor(Math.random() * 400) + 200,
      color,
      name,
      health: 100,
      inventory: [],
      equipped: null,
      role,           // 'tagger', 'runner', or null
      mode,           // 'normal' or 'tag'
      lastShot: 0,
      lastMessage: '',
      messageTimeout: 0
    };

    // Send full current state to the new player
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
      const p = players[socket.id];
      p.x = Math.max(0, Math.min(WORLD_WIDTH - 50, data.x));
      p.y = Math.max(0, Math.min(WORLD_HEIGHT - 50, data.y));

      // In tag mode: check for tag collisions
      if (p.mode === 'tag') {
        for (const otherId in players) {
          if (otherId === socket.id) continue;
          const other = players[otherId];
          if (other.mode !== 'tag') continue;

          const dist = Math.hypot(p.x + 25 - other.x - 25, p.y + 25 - other.y - 25);
          if (dist < 60) {
            // Tagger touches runner → runner becomes tagger
            if (p.role === 'tagger' && other.role === 'runner') {
              other.role = 'tagger';
              other.color = '#ff5252';
              io.emit('playerUpdate', {
                id: otherId,
                role: other.role,
                color: other.color
              });
              console.log(`${other.name} was tagged by ${p.name}!`);
            } else if (other.role === 'tagger' && p.role === 'runner') {
              p.role = 'tagger';
              p.color = '#ff5252';
              io.emit('playerUpdate', {
                id: socket.id,
                role: p.role,
                color: p.color
              });
              console.log(`${p.name} was tagged by ${other.name}!`);
            }
          }
        }
      }

      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: p.x,
        y: p.y
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
    if (Date.now() - p.lastShot < 3000) return;

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
      vx, vy,
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

// Projectile physics & hit detection (runs ~20 times/sec)
setInterval(() => {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;

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

    // Remove off-map projectiles
    if (!hit && (
      proj.x < -50 || proj.x > WORLD_WIDTH + 50 ||
      proj.y < -50 || proj.y > WORLD_HEIGHT + 50
    )) {
      projectiles.splice(i, 1);
    }
  }

  io.emit('projectilesUpdate', projectiles);
}, 50);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
