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

// ────────────────────────────────────────────────
// Constants — moved to top so they are defined before use
// ────────────────────────────────────────────────
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://YOUR_USER:YOUR_PASS@cluster0.xxx.mongodb.net/squaregame?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-this-in-production-987654321';

// Register route
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

// Login route
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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

  console.log('Tag mode reset — new tagger chosen');
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Authenticated user connected: ${socket.user?.username || 'unknown'} (${socket.id})`);

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

  // Normal mode only
  socket.on('pickupBow', (bowId) => {
    const p = players[socket.id];
    if (!p || p.mode !== 'normal') return;
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
    const p = players[socket.id];
    if (!p || p.mode !== 'normal') return;
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
    if (!p || p.mode !== 'normal') return;
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

// Projectile loop
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
