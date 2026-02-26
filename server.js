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

// Spawn some bows
for (let i = 0; i < 15; i++) {
  bows.push({
    id: bowCounter++,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT
  });
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  socket.on('join', data => {
    players[socket.id] = {
      id: socket.id,
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 200,
      color: data.color || 'blue',
      name: data.name || 'Player',
      health: 100,
      inventory: [],
      equipped: null
    };

    // Send current state to new player
    socket.emit('currentPlayers', players);
    socket.emit('currentBows', bows);

    // Tell everyone else about new player
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMovement', data => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on('chatMessage', data => {
    if (players[socket.id]) {
      io.emit('chatMessage', {
        name: players[socket.id].name,
        color: players[socket.id].color,
        message: data.message
      });
    }
  });

  socket.on('pickupBow', bowId => {
    if (!players[socket.id]) return;
    const p = players[socket.id];
    const bowIdx = bows.findIndex(b => b.id === bowId);
    if (bowIdx === -1) return;

    const bow = bows[bowIdx];
    if (Math.hypot(p.x + 25 - bow.x, p.y + 25 - bow.y) < 80 && p.inventory.length < 3) {
      p.inventory.push({ type: 'bow', uses: 5 });
      bows.splice(bowIdx, 1);
      io.emit('bowPickedUp', { bowId });
      socket.emit('playerUpdate', { inventory: p.inventory, equipped: p.equipped });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
