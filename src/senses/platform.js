/**
 * Platform — abstracts OS-specific operations.
 * One module that handles Linux/Mac/Windows differences.
 */

const { execFile } = require('child_process');
const os = require('os');

const PLATFORM = process.platform; // 'linux', 'darwin', 'win32'

/**
 * Get the active window title.
 */
function getWindowTitle() {
  return new Promise((resolve) => {
    if (PLATFORM === 'linux') {
      execFile('xdotool', ['getactivewindow', 'getwindowname'], { timeout: 2000 }, (err, stdout) => {
        resolve(err ? null : stdout.trim());
      });
    } else if (PLATFORM === 'darwin') {
      execFile('osascript', ['-e',
        'tell application "System Events" to get name of first application process whose frontmost is true'
      ], { timeout: 2000 }, (err, stdout) => {
        resolve(err ? null : stdout.trim());
      });
    } else if (PLATFORM === 'win32') {
      execFile('powershell', ['-Command',
        '(Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object -First 1).MainWindowTitle'
      ], { timeout: 3000 }, (err, stdout) => {
        resolve(err ? null : stdout.trim());
      });
    } else {
      resolve(null);
    }
  });
}

/**
 * Find audio sources for STT.
 * Returns { mic: sourceName, monitor: sourceName } or nulls.
 */
function findAudioSources() {
  return new Promise((resolve) => {
    if (PLATFORM === 'linux') {
      execFile('pactl', ['list', 'short', 'sources'], { timeout: 3000 }, (err, stdout) => {
        if (err) { resolve({ mic: null, monitor: null }); return; }
        const lines = stdout.trim().split('\n');
        const mic = lines.find(l => l.includes('input') && !l.includes('monitor') && l.includes('RUNNING'))
          || lines.find(l => l.includes('input') && !l.includes('monitor'));
        const mon = lines.find(l => l.includes('.monitor') && l.includes('RUNNING'))
          || lines.find(l => l.includes('.monitor'));
        resolve({
          mic: mic ? mic.split('\t')[1] : null,
          monitor: mon ? mon.split('\t')[1] : null,
        });
      });
    } else if (PLATFORM === 'darwin') {
      // macOS: use default input, no easy monitor source
      resolve({ mic: 'default', monitor: null });
    } else if (PLATFORM === 'win32') {
      // Windows: use default input, WASAPI loopback needs special handling
      resolve({ mic: 'default', monitor: null });
    } else {
      resolve({ mic: null, monitor: null });
    }
  });
}

/**
 * Record audio to a WAV file from a source.
 * Returns the child process (kill it to stop recording).
 */
function recordAudio(sourceName, outputFile, durationSec) {
  if (PLATFORM === 'linux') {
    return require('child_process').spawn('parec', [
      '--device', sourceName,
      '--file-format=wav', '--channels=1', '--rate=16000',
      outputFile,
    ]);
  } else if (PLATFORM === 'darwin') {
    // macOS: use sox
    return require('child_process').spawn('sox', [
      '-d', '-r', '16000', '-c', '1', outputFile, 'trim', '0', String(durationSec),
    ]);
  } else if (PLATFORM === 'win32') {
    // Windows: use ffmpeg with dshow
    return require('child_process').spawn('ffmpeg', [
      '-f', 'dshow', '-i', `audio=${sourceName}`,
      '-ar', '16000', '-ac', '1', '-t', String(durationSec),
      outputFile, '-y',
    ]);
  }
  return null;
}

/**
 * Get the data directory path.
 */
function getDataDir() {
  if (PLATFORM === 'win32') {
    return require('path').join(process.env.APPDATA || os.homedir(), '.aria');
  }
  return require('path').join(os.homedir(), '.aria');
}

module.exports = { PLATFORM, getWindowTitle, findAudioSources, recordAudio, getDataDir };
