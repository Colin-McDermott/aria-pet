const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

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

  // Don't close, just hide
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Simple green circle icon
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
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault());

// IPC for LLM
ipcMain.handle('chat', async (event, prompt) => {
  return await queryLLM(prompt);
});

async function queryLLM(prompt) {
  // Try Ollama (local, user's hardware)
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
