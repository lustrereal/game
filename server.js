const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname)); // Serve client files

const players = {}; // Store player data: {id: {x, y, color}}

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // Send current players to new player
  socket.emit('currentPlayers', players);

  // Broadcast new player to others
  socket.broadcast.emit('newPlayer', { id: socket.id });

  socket.on('join', (data) => {
    players[socket.id] = {
      x: Math.floor(Math.random() * 800) + 50, // Random start position
      y: Math.floor(Math.random() * 600) + 50,
      color: data.color
    };
    io.emit('playerJoined', { id: socket.id, ...players[socket.id] });
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...movementData });
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
