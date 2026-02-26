// Updated server.js (full file - copy-paste replace)
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname)); // Serve client files

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

const players = {}; // {id: {x, y, color, name}}

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // Send current players to new player
  socket.emit('currentPlayers', players);

  // Broadcast new player to others
  socket.broadcast.emit('newPlayer', { id: socket.id });

  socket.on('join', (data) => {
    if (!data.name || data.name.trim().length === 0) data.name = 'Anonymous';
    data.name = data.name.trim().substring(0, 16);
    players[socket.id] = {
      x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
      y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50,
      color: data.color,
      name: data.name
    };
    io.emit('playerJoined', { id: socket.id, ...players[socket.id] });
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      const newX = Math.max(0, Math.min(WORLD_WIDTH - 50, movementData.x));
      const newY = Math.max(0, Math.min(WORLD_HEIGHT - 50, movementData.y));
      players[socket.id].x = newX;
      players[socket.id].y = newY;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: newX, y: newY });
    }
  });

  socket.on('chatMessage', (data) => {
    if (players[socket.id] && data.message && data.message.trim()) {
      const player = players[socket.id];
      const message = data.message.trim().substring(0, 100);
      io.emit('chatMessage', {
        id: socket.id,
        name: player.name,
        color: player.color,
        message: message
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
