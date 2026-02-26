// FULL server.js - COPY-PASTE REPLACE YOUR ENTIRE server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {}; // Store player data
const bows = []; // Store bow locations

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    players[socket.id] = {
      x: 400,
      y: 300,
      color: data.color,
      name: data.name
    };
  });

  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', data);
  });

  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
    }
  });

  socket.on('pickupBow', (bowId) => {
    // Handle pickup logic here
    // Check if bow exists, distance, add to inventory, emit update
  });
});

http.listen(3000, () => {
  console.log('Server running');
});
