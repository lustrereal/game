const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

// ────────────────────────────────────────────────
// Constants — MOVED TO THE VERY TOP so they are defined before use
// ────────────────────────────────────────────────
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

// App & server setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Trust proxy (fixes X-Forwarded-For error on Render)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  trustProxy: true
}));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB error:', err);
    process.exit(1);
  });

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}

// ────────────────────────────────────────────────
// Register
// ────────────────────────────────────────────────
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
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────
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
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ────────────────────────────────────────────────
// Game state
// ────────────────────────────────────────────────
const players = {};
const bows = [];
const projectiles = [];
let bowCounter = 0;
let projCounter = 0;

// Spawn bows (now safe because constants are defined above)
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

// Socket auth
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
  console.log(`Authenticated: ${socket.user.username} (${socket.id})`);

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
          if
