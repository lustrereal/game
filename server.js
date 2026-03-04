const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve client files (index.html, client.js, etc.)
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// MongoDB connection (use Render env var or hardcode for local testing)
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxx.mongodb.net/squaregame?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// JWT secret (CHANGE THIS in production – use env var)
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-CHANGE-ME-987654321';

// Register
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed });
    await user.save();

    const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // { id, username }
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

// Game state
const players = {};
const bows = [];
const projectiles = [];
let bowCounter = 0;
let projCounter = 0;

// Spawn bows for normal mode
for (let i = 0; i < 18; i++) {
  bows.push({
    id: bowCounter++,
    x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
    y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50
  });
}

function resetTagMode() {
  const tagPlayers = Object.values(players).filter(p => p.mode === 'tag');
  if (tagPlayers.length < 2) return;

  const newTaggerIndex = Math.floor(Math.random() * tagPlayers.length);
  tagPlayers.forEach((p, i) => {
    const oldRole = p.role;
    p.role = (i === newTaggerIndex) ? 'tagger' : 'runner';
    p.color = (i === newTaggerIndex) ? '#ff5252' : '#448aff';

    if (oldRole !== p.role) {
      io.emit('playerUpdate', {
        id: p.id,
        role: p.role,
        color: p.color
      });
    }
  });

  console.log('Tag mode reset - new tagger chosen');
}

io.on('connection', (socket) => {
  console.log(`Authenticated user: ${socket.user.username} (${socket.id})`);

  socket.on('join', (data) => {
    const mode = data.mode || 'normal';
    let role = null;
    let color = data.color || 'blue';

    if (mode === 'tag') {
      role = Math.random() < 0.3 ? 'tagger' : 'runner';
      color = role === 'tagger' ? '#ff5252' : '#448aff';
    }

    players[socket.id] = {
      id: socket.id,
      username: socket.user.username,
      x: Math.floor(Math.random() * 600) + 200,
      y: Math.floor(Math.random() * 400) + 200,
      color,
      name: socket.user.username,
      health: 100,
      inventory: mode === 'normal' ? [] : undefined,
      equipped: null,
      role,
      mode,
      lastShot: 0,
      lastMessage: '',
      messageTimeout: 0
    };

    socket.emit('currentState', {
      players,
      bows: mode === 'normal' ? bows : [],
      projectiles: mode === 'normal' ? projectiles : [],
      myId: socket.id
    });

    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMovement', (data) => {
    if (!players[socket.id]) return;
    const p = players[socket.id];

    p.x = Math.max(0, Math.min(WORLD_WIDTH - 50, data.x));
    p.y = Math.max(0, Math.min(WORLD_HEIGHT - 50, data.y));

    // Tag mode collision tagging
    if (p.mode === 'tag') {
      let tagged = false;
      for (const otherId in players) {
        if (otherId === socket.id) continue;
        const other = players[otherId];
        if (other.mode !== 'tag') continue;

        const dist = Math.hypot(p.x + 25 - other.x - 25, p.y + 25 - other.y - 25);
        if (dist < 60) {
          if (p.role === 'tagger' && other.role === 'runner') {
            other.role = 'tagger';
            other.color = '#ff5252';
            io.emit('playerUpdate', { id: otherId, role: 'tagger', color: '#ff5252' });
            tagged = true;
          } else if (other.role === 'tagger' && p.role === 'runner') {
            p.role = 'tagger';
            p.color = '#ff5252';
            io.emit('playerUpdate', { id: socket.id, role: 'tagger', color: '#ff5252' });
            tagged = true;
          }
        }
      }

      // Reset tag mode if all are taggers
      if (tagged) {
        const tagPlayers = Object.values(players).filter(pl => pl.mode === 'tag');
        if (tagPlayers.every(pl => pl.role === 'tagger')) {
          resetTagMode();
        }
      }
    }

    socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y });
  });

  socket.on('chatMessage', (data) => {
    if (players[socket.id] && data.message?.trim()) {
      io.emit('chatMessage', {
        id: socket.id,
        name: players[socket.id].name,
        color: players[socket.id].color,
        message: data.message.trim().substring(0, 120)
      });
    }
  });

  // Normal mode only – ignore in tag
  socket.on('pickupBow', (bowId) => {
    const p = players[socket.id];
    if (!p || p.mode !== 'normal') return;
    // ... (your existing pickup logic)
  });

  socket.on('equipItem', (slotIndex) => {
    const p = players[socket.id];
    if (!p || p.mode !== 'normal') return;
    // ... (your existing equip logic)
  });

  socket.on('shoot', (data) => {
    const p = players[socket.id];
    if (!p || p.mode !== 'normal') return;
    // ... (your existing shoot logic)
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Projectile loop (normal mode only)
setInterval(() => {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;

    let hit = false;
    for (const id in players) {
      if (id === proj.ownerId) continue;
      const p = players[id];
      if (p.mode !== 'normal') continue;

      if (Math.hypot(proj.x - (p.x + 25), proj.y - (p.y + 25)) < 35) {
        p.health = Math.max(0, p.health - 5);
        io.emit('playerHit', { id, health: p.health });
        projectiles.splice(i, 1);
        hit = true;
        break;
      }
    }

    if (!hit && (proj.x < -50 || proj.x > WORLD_WIDTH + 50 || proj.y < -50 || proj.y > WORLD_HEIGHT + 50)) {
      projectiles.splice(i, 1);
    }
  }

  io.emit('projectilesUpdate', projectiles);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
