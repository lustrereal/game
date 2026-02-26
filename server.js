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
let bowCounter = 0;

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
    players[socket.id] = {
      id: socket.id,
      x: Math.floor(Math.random() * 600) + 200,
      y: Math.floor(Math.random() * 400) + 200,
      color: data.color || 'blue',
      name,
      health: 100,
      inventory: [],
      equipped: null,
      lastMessage: '',
      messageTimeout: 0
    };

    // Send full current state to the new player
    socket.emit('currentState', {
      players,
      bows,
      myId: socket.id
    });

    // Tell others someone joined
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
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

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
