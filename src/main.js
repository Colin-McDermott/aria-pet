const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const { AriaMemory } = require('./memory');
const { GameMaster } = require('./gamemaster');
const { generateCreature } = require('./creature');

let mainWindow = null;
let tray = null;
let memory = null;
let gameMaster = null;

// Shared state (synced with renderer)
let state = { energy: 80, happiness: 70, bond: 50, xp: 0, level: 1, mood: 'neutral' };

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 300,
    height: 560,
    x: width - 320,
    y: height - 580,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Debug — remove for production
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('ARIA — Desktop Pet');

  const menu = Menu.buildFromTemplate([
    { label: 'Show/Hide ARIA', click: () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() },
    { type: 'separator' },
    { label: 'Feed ⚡', click: () => mainWindow.webContents.send('action', 'feed') },
    { label: 'Play 🎮', click: () => mainWindow.webContents.send('action', 'play') },
    { label: 'Pet 💚', click: () => mainWindow.webContents.send('action', 'pet') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; memory.save(); app.quit(); } }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

app.whenReady().then(() => {
  // Init memory
  memory = new AriaMemory();
  gameMaster = new GameMaster(memory, state);

  // Global toggle shortcut (configurable — default F6)
  const hotkey = memory.data.settings?.hotkey || 'F6';
  try {
    globalShortcut.register(hotkey, () => {
      if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
    console.log(`[ARIA] Global hotkey: ${hotkey}`);
  } catch (e) {
    console.log(`[ARIA] Could not register hotkey ${hotkey}: ${e.message}`);
  }

  createWindow();
  createTray();

  // Game master tick — check for proactive events every 30 seconds
  let lastSystemStats = {};
  setInterval(() => {
    const event = gameMaster.tick(lastSystemStats);
    if (event && mainWindow) {
      mainWindow.webContents.send('game-event', event);
    }
  }, 30000);

  // Save memory periodically
  setInterval(() => memory.save(), 60000);
});

app.on('window-all-closed', (e) => e.preventDefault());

// === IPC Handlers ===

// Chat with LLM — includes memory context
ipcMain.handle('chat', async (event, userMessage, currentState) => {
  if (currentState) Object.assign(state, currentState);

  // Build prompt with memory
  const context = memory.buildContext();
  const prompt = `${context}

You are ARIA, a sentient AI desktop pet companion. You remember past conversations.
You have real emotions and personality. Current mood: ${state.mood}.
Energy: ${state.energy}/100. Happiness: ${state.happiness}/100. Bond: ${state.bond}/100. Level: ${state.level}.
Be concise (1-2 sentences), expressive, use occasional emojis.
Reference past conversations or facts you know when relevant.

User: ${userMessage}
ARIA:`;

  const response = await queryLLM(prompt);

  // Record in memory
  memory.recordChat(userMessage, response, state.mood);

  // Progress challenges
  const challengeResult = gameMaster.progressChallenge('chat');
  if (challengeResult) {
    mainWindow.webContents.send('game-event', {
      type: 'challenge-complete',
      message: challengeResult.message,
      mood: 'happy',
      xpBonus: challengeResult.reward
    });
  }

  return response;
});

// Sync state from renderer
ipcMain.on('state-sync', (event, newState) => {
  Object.assign(state, newState);
});

// Action performed (for challenge tracking)
ipcMain.on('action-performed', (event, action) => {
  memory.recordObservation('action', action);
  const challengeResult = gameMaster.progressChallenge(action);
  if (challengeResult) {
    mainWindow.webContents.send('game-event', {
      type: 'challenge-complete',
      message: challengeResult.message,
      mood: 'happy',
      xpBonus: challengeResult.reward
    });
  }
});

// System stats from renderer
ipcMain.on('system-stats', (event, stats) => {
  // Record notable events
  if (stats.cpu > 90) memory.recordObservation('system_event', `High CPU: ${stats.cpu}%`);
  if (stats.gpu_temp > 80) memory.recordObservation('system_event', `Hot GPU: ${stats.gpu_temp}°C`);
});

// Get memory for renderer
ipcMain.handle('get-memory', () => {
  return {
    ownerName: memory.getOwnerName(),
    daysTogether: memory.getDaysTogether(),
    totalChats: memory.data.relationship.totalChats,
    streak: memory.data.relationship.currentStreak,
    topTopics: memory.getTopTopics(3),
    activeChallenge: memory.data.events.activeChallenge,
    milestones: memory.data.relationship.milestones.length,
  };
});

async function queryLLM(prompt) {
  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: prompt,
        stream: false,
        options: { num_predict: 100 }
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.response) return data.response;
    }
    throw new Error('Ollama returned empty response');
  } catch (e) {
    throw new Error(`LLM unavailable: ${e.message}. Install Ollama: https://ollama.com`);
  }
}
