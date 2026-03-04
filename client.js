const socket = io({ autoConnect: false }); // Connect only after login

// DOM elements
const authScreen = document.getElementById('authScreen');
const modeSelect = document.getElementById('modeSelect');
const gameDiv = document.getElementById('game');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const authMessage = document.getElementById('authMessage');
const displayUsername = document.getElementById('displayUsername');
const profileUsername = document.getElementById('profileUsername');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesUl = document.getElementById('messages');
const slotsDiv = document.getElementById('slots');
const healthText = document.getElementById('healthText');
const healthBar = document.getElementById('healthBar');
const staminaText = document.getElementById('staminaText');
const staminaBar = document.getElementById('staminaBar');
const playersList = document.getElementById('playersList');
const playerListUl = document.getElementById('playerListUl');

// Constants
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

let authToken = null;
let currentUsername = null;
let currentMode = null;
const players = {};
const bows = [];
const projectiles = [];
let myId = null;
let cameraX = 0;
let cameraY = 0;

const movement = { up: false, down: false, left: false, right: false };
const baseSpeed = 5;
const sprintSpeed = 10;
let sprinting = false;
let stamina = 100;
const maxStamina = 100;
const staminaDrainRate = 25;
const staminaRegenRate = 15;

let mouseX = 0;
let mouseY = 0;
let lastDirection = { x: 1, y: 0 };

// ────────────────────────────────────────────────
// Login / Register
// ────────────────────────────────────────────────

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    authMessage.textContent = 'Please fill in both fields';
    return;
  }

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed');

    authToken = data.token;
    currentUsername = data.username;

    // Update displayed username
    displayUsername.textContent = currentUsername;
    profileUsername.textContent = currentUsername;

    authScreen.style.display = 'none';
    modeSelect.style.display = 'flex';
    authMessage.textContent = '';

    // Connect socket with token
    socket.io.opts.auth = { token: authToken };
    socket.connect();
  } catch (err) {
    authMessage.textContent = err.message;
  }
});

registerBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    authMessage.textContent = 'Please fill in both fields';
    return;
  }

  if (password.length < 6) {
    authMessage.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Registration failed');

    authToken = data.token;
    currentUsername = data.username;

    displayUsername.textContent = currentUsername;
    profileUsername.textContent = currentUsername;

    authScreen.style.display = 'none';
    modeSelect.style.display = 'flex';
    authMessage.textContent = '';

    socket.io.opts.auth = { token: authToken };
    socket.connect();
  } catch (err) {
    authMessage.textContent = err.message;
  }
});

// ────────────────────────────────────────────────
// Mode selection
// ────────────────────────────────────────────────

document.getElementById('normalBtn').addEventListener('click', () => {
  currentMode = 'normal';
  modeSelect.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { mode: 'normal' });
});

document.getElementById('tagBtn').addEventListener('click', () => {
  currentMode = 'tag';
  modeSelect.style.display = 'none';
  gameDiv.style.display = 'block';
  socket.emit('join', { mode: 'tag' });
});

// ────────────────────────────────────────────────
// Rest of your client.js code (movement, drawing, socket events, gameLoop, etc.)
// Paste your existing game logic here – no changes needed below this line
// ────────────────────────────────────────────────

// ... (your full gameLoop, draw functions, socket.on handlers, etc.)
