/**
 * ARIA — main process (Electron).
 *
 * Stripped to essentials: brain, speech, training, evolution.
 * No civilization, space, aliens, screen-watcher.
 */

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const { AriaMemory } = require('./memory');
const { Environment } = require('./environment');
const { Evolution } = require('./evolution');
const { LocalSTT } = require('./senses/local-stt');
const { Communication } = require('./civilization/communication');
const { Logger } = require('./logger');
const { findAudioSources } = require('./senses/platform');
const { initEmbeddings, UtteranceStore, isReady: embeddingsReady } = require('./civilization/embeddings');
const { TrainerGym } = require('./training/trainer-gym');
const { EvolutionSystem } = require('./training/evolution');

const log = new Logger();
let utteranceStore = null;

let mainWindow = null;
let tray = null;
let memory = null;
let environment = null;
let evolution = null;
let communication = null;
let micSTT = null;
let desktopSTT = null;

let state = { energy: 50, happiness: 50, bond: 0, mood: 'neutral', stage: 1 };
let neuralState = null;

let lastUserInteraction = Date.now();
let _heardRecent = false;
let _lastAudioTranscript = '';
let trainerGym = new TrainerGym();
let evolutionSystem = new EvolutionSystem();

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); }); }

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: 360, height: 640, x: width - 380, y: height - 660,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setVisibleOnAllWorkspaces(true);

  mainWindow.webContents.on('console-message', (e, level, msg, line, source) => {
    console.log(`[Renderer:${level}] ${msg}`);
  });
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('[Renderer CRASHED]', details.reason, details.exitCode);
  });

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('ARIA');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; saveAll(); app.quit(); } }
  ]));
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

function saveAll() {
  if (memory) memory.save();
  if (environment) environment.stop();
  if (evolution) evolution.save();
  if (communication) communication.save();
  if (utteranceStore) utteranceStore.save();
  log.shutdown();
}

function buildStateVec() {
  return [(state.energy||50)/100, (state.happiness||50)/100, 0.1, 0.2, 0, 0, 0];
}

function userPresent() {
  lastUserInteraction = Date.now();
}

app.whenReady().then(() => {
  memory = new AriaMemory();
  environment = new Environment();
  evolution = new Evolution();
  communication = new Communication();
  environment.start(5000);

  // Sentence embedding engine
  utteranceStore = new UtteranceStore();
  utteranceStore.load();
  initEmbeddings().then(async (ok) => {
    if (ok) {
      await utteranceStore.reembed();
      console.log('[ARIA] Embedding engine ready');
    }
  }).catch(e => console.log('[ARIA] Embedding init failed:', e.message));

  // Global hotkey
  const hotkey = memory.data.settings?.hotkey || 'F6';
  try { globalShortcut.register(hotkey, () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); }); }
  catch (e) { console.log(`[ARIA] Hotkey ${hotkey} failed: ${e.message}`); }
  log.log('system', 'hotkey', { key: hotkey });

  createWindow();
  createTray();

  // Initial state on load
  mainWindow.webContents.on('did-finish-load', () => {
    if (communication) mainWindow.webContents.send('comm-status', { vocabSize: communication.associations.size, exposure: communication.exposure });
  });

  // Auto-start Whisper STT
  setTimeout(async () => {
    try {
      const sources = await findAudioSources();

      if (sources.mic) {
        micSTT = new LocalSTT();
        micSTT.onTranscript = (text) => {
          if (communication && text) {
            const sv = buildStateVec(); sv[5] = 0.5;
            communication.hear(text, sv);
            if (utteranceStore) utteranceStore.add(text, 'mic');
            _heardRecent = true;
            _lastAudioTranscript = text;
            userPresent();
            log.learnEvent('mic', { text, vocab: communication.associations.size });
            if (mainWindow) mainWindow.webContents.send('words-heard', text, 'mic');
          }
        };
        micSTT.start(sources.mic, 'mic');
      }

      if (sources.monitor) {
        desktopSTT = new LocalSTT();
        desktopSTT.onTranscript = (text) => {
          if (communication && text) {
            communication.hear(text, buildStateVec());
            if (utteranceStore) utteranceStore.add(text, 'desktop');
            _heardRecent = true;
            _lastAudioTranscript = text;
            log.learnEvent('desktop', { text, vocab: communication.associations.size });
            if (mainWindow) mainWindow.webContents.send('words-heard', text, 'desktop');
          }
        };
        desktopSTT.start(sources.monitor, 'desktop');
      }
    } catch (e) {
      console.log('[ARIA] Audio source detection failed:', e.message);
    }
  }, 3000);

  // === Environment tick (5s) ===
  setInterval(() => {
    const profile = environment.getProfile();
    evolution.tick(profile);

    if (mainWindow) {
      mainWindow.webContents.send('env-update', profile);
      mainWindow.webContents.send('adaptations-update', evolution.adaptations);
    }

    // Communication state for brain inputs
    if (mainWindow) {
      const minutesSinceUser = (Date.now() - lastUserInteraction) / 60000;
      mainWindow.webContents.send('comm-state', {
        vocabSize: communication?.associations?.size || 0,
        heardRecent: _heardRecent,
        popSatisfaction: 50,
        unmetNeed: 0,
        loneliness: Math.min(1, minutesSinceUser / 30),
      });
      _heardRecent = false;
    }

    // Auto-reward signals
    if (mainWindow) {
      const rewards = [];
      if (_heardRecent) rewards.push({ type: 'heard', amount: 0.5 });

      const minutesSinceUser = (Date.now() - lastUserInteraction) / 60000;
      if (minutesSinceUser > 10) rewards.push({ type: 'lonely', amount: -0.1 * Math.min(1, minutesSinceUser / 60) });

      if (communication && communication.associations.size > (state._lastVocabSize || 0)) {
        rewards.push({ type: 'learned', amount: 0.3 });
        state._lastVocabSize = communication.associations.size;
      }

      if (rewards.length > 0) mainWindow.webContents.send('auto-rewards', rewards);
    }
  }, 5000);

  // === Communication tick (10s) ===
  setInterval(async () => {
    if (!mainWindow || !communication) return;
    const sv = buildStateVec();

    // Brain-driven thoughts
    const brainThink = state.brainThink || 0;
    const brainTone = state.brainVocalTone || 0.5;
    const tonedSv = [...sv];
    tonedSv[1] = brainTone;

    if (brainThink > 0.5) {
      const context = _lastAudioTranscript || '';
      let thought = null;

      if (utteranceStore && embeddingsReady() && context) {
        const similar = await utteranceStore.findSimilar(context, 3);
        if (similar.length > 0) {
          thought = similar[Math.floor(Math.random() * similar.length)].text + '...';
        }
      }
      if (!thought) {
        thought = communication.think(tonedSv, state.health || 0.5, context);
      }
      if (thought) mainWindow.webContents.send('thought', thought);
    }

    const intel = communication.getIntelligence();
    mainWindow.webContents.send('comm-status', {
      vocabSize: intel.vocabSize, exposure: communication.exposure,
      intelligence: intel.score, chainDepth: intel.chainDepth, patterns: intel.patterns,
    });
  }, 10000);

  // === Saves (60s) ===
  setInterval(() => { saveAll(); }, 60000);

  // === Sleep consolidation (5 min check, max 1x per 30 min) ===
  let lastConsolidation = 0;
  setInterval(() => {
    const profile = environment.getProfile();
    const now = Date.now();
    if (profile.timeOfDay === 'night' && profile.activity === 'idle' && now - lastConsolidation > 30 * 60 * 1000) {
      lastConsolidation = now;
      if (communication) communication.consolidate();
      if (mainWindow) mainWindow.webContents.send('sleep-consolidate');
      log.creatureEvent('sleep-consolidation', { vocab: communication?.associations?.size });
    }
  }, 5 * 60 * 1000);
});

app.on('window-all-closed', (e) => e.preventDefault());

// === IPC ===

// Chat
ipcMain.handle('chat', async (event, userMessage, currentState) => {
  if (currentState) Object.assign(state, currentState);
  userPresent();
  _heardRecent = true;
  const sv = buildStateVec();
  sv[5] = 0.3;

  const brainTone = state.brainVocalTone || 0.5;
  sv[1] = sv[1] * 0.5 + brainTone * 0.5;

  if (communication) {
    communication.hear(userMessage, sv);
    if (utteranceStore) utteranceStore.add(userMessage, 'user');
    log.userEvent('chat', { text: userMessage, vocab: communication.associations.size });
  }

  // Strategy 1: Embedding retrieval
  if (utteranceStore && embeddingsReady()) {
    const results = await utteranceStore.findResponse(userMessage, 5);
    if (results.length > 0) {
      const best = results[0];
      log.creatureEvent('speak', { text: best.text, similarity: best.similarity.toFixed(3), source: 'embedding' });
      memory.recordChat(userMessage, best.text, state.mood);
      return best.text;
    }
  }

  // Strategy 2: N-gram phrase recall
  const h = state.health || 0.5;
  const maxWords = Math.max(3, Math.floor(3 + h * 12));
  const phrases = communication ? communication.findRelevantPhrases(userMessage, 5, maxWords) : [];
  if (phrases.length > 0) {
    const resp = phrases[0];
    log.creatureEvent('speak', { text: resp, source: 'phrase-fallback' });
    memory.recordChat(userMessage, resp, state.mood);
    return resp;
  }

  return null;
});

ipcMain.on('state-sync', (e, s) => { Object.assign(state, s); });
ipcMain.on('cell-dna-sync', (e, dna) => { state._cellDna = dna; });
ipcMain.on('neural-state', (e, n) => { neuralState = n; });
ipcMain.on('action-performed', (e, action) => { userPresent(); memory.recordObservation('action', action); log.userEvent(action); });

// Speech feedback
ipcMain.on('speech-feedback', (e, responseText, amount) => {
  if (utteranceStore) utteranceStore.feedback(responseText, amount);
});

// Genome export/import
ipcMain.handle('export-genome', async (e, json) => {
  const { dialog } = require('electron'); const fs = require('fs');
  const r = await dialog.showSaveDialog(mainWindow, { defaultPath: 'aria-genome.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, json); return true; }
  return false;
});
ipcMain.handle('import-genome', async () => {
  const { dialog } = require('electron'); const fs = require('fs');
  const r = await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (!r.canceled && r.filePaths.length > 0) return fs.readFileSync(r.filePaths[0], 'utf8');
  return null;
});

// Memory
ipcMain.handle('get-memory', () => ({
  ownerName: memory.getOwnerName(), daysTogether: memory.getDaysTogether(),
  totalChats: memory.data.relationship.totalChats, streak: memory.data.relationship.currentStreak,
}));
ipcMain.handle('get-body-plan', () => evolution.getBodyPlan());

// Training gym
ipcMain.handle('train', async (e, type) => {
  if (trainerGym.running) return null;
  const dna = state._cellDna || { bodyPlan: 0.5, limbGenes: 0.5, eyeGenes: 0.5, metabolismGenes: 0.5 };
  const stage = state.stage || 4;
  const result = await trainerGym.runGeneration(type || 'walk', dna, stage);
  return result;
});
ipcMain.handle('train-summary', () => trainerGym.getSummary());

// Evolution
ipcMain.handle('evo-choices', () => {
  const mockCell = { dna: state._cellDna || {}, brain: null };
  return evolutionSystem.getChoices(mockCell, trainerGym.history);
});
ipcMain.handle('evo-apply', (e, choiceKey) => {
  return { key: choiceKey, ...(require('./training/evolution').EVOLUTION_PATHS[choiceKey] || {}) };
});
ipcMain.handle('evo-summary', () => evolutionSystem.toJSON());

// Environment data
ipcMain.handle('evolve', () => {
  const profile = environment ? environment.getProfile() : null;
  const adaptations = evolution ? evolution.adaptations : null;
  return { profile, adaptations };
});

ipcMain.handle('get-logs', (e, n) => log.readRecent(n || 50));
ipcMain.handle('get-session', () => log.getSessionSummary());
