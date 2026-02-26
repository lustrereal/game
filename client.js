const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const game = document.getElementById('game');
const colorSelect = document.getElementById('colorSelect');
const playButton = document.getElementById('playButton');

const players = {}; // Local copy of players
let myId = null;
const movement = { up: false, down: false, left: false, right: false };
const speed = 5;

playButton.addEventListener('click', () => {
  const color = colorSelect.value;
  menu.style.display = 'none';
  game.style.display = 'block';
  socket.emit('join', { color });
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = true; break;
    case 's': movement.down = true; break;
    case 'a': movement.left = true; break;
    case 'd': movement.right = true; break;
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w': movement.up = false; break;
    case 's': movement.down = false; break;
    case 'a': movement.left = false; break;
    case 'd': movement.right = false; break;
  }
});

// Socket events
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('currentPlayers', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    players[id] = serverPlayers[id];
  });
});

socket.on('newPlayer', (data) => {
  // Wait for join event for full data
});

socket.on('playerJoined', (data) => {
  players[data.id] = { x: data.x, y: data.y, color: data.color };
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('playerDisconnected', (id) => {
  delete players[id];
});

// Game loop
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update my position if I'm in the game
  if (players[myId]) {
    if (movement.up) players[myId].y -= speed;
    if (movement.down) players[myId].y += speed;
    if (movement.left) players[myId].x -= speed;
    if (movement.right) players[myId].x += speed;

    // Keep within bounds
    players[myId].x = Math.max(0, Math.min(canvas.width - 50, players[myId].x));
    players[myId].y = Math.max(0, Math.min(canvas.height - 50, players[myId].y));

    socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
  }

  // Draw all players
  Object.values(players).forEach(player => {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, 50, 50);
  });

  requestAnimationFrame(gameLoop);
}

gameLoop();
