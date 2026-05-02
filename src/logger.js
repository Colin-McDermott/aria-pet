/**
 * Logger — structured event logging with rotating files.
 *
 * Captures everything:
 *   - User interactions (poke, feed, chat, pet, play, decisions)
 *   - Learning events (words heard, source, vocab size)
 *   - Creature events (stage up, cell division, brain mutation, sleep)
 *   - System events (CPU spikes, errors, startup/shutdown)
 *   - Environment changes
 *
 * Saves to ~/.aria/logs/ as daily JSONL files (one JSON object per line).
 * Keeps last 30 days of logs. Each entry has timestamp, category, event, data.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'logs');
const MAX_DAYS = 30;

class Logger {
  constructor() {
    this._ensureDir();
    this._file = null;
    this._date = null;
    this._buffer = [];
    this._flushInterval = setInterval(() => this._flush(), 5000);

    // Counters for current session
    this.session = {
      started: Date.now(),
      interactions: 0,
      wordsLearned: 0,
      decisions: 0,
      errors: 0,
    };

    this.log('system', 'startup', { pid: process.pid });
    this._cleanup();
    // Force first flush
    setTimeout(() => this._flush(), 1000);
  }

  /**
   * Log an event.
   * category: 'user' | 'learn' | 'creature' | 'civ' | 'system' | 'error'
   * event: string describing what happened
   * data: any additional data
   */
  log(category, event, data = {}) {
    const entry = {
      t: Date.now(),
      ts: new Date().toISOString(),
      cat: category,
      ev: event,
      d: data,
    };

    const line = JSON.stringify(entry);
    this._buffer.push(line);

    // Also console.log for stdout capture
    const summary = typeof data === 'string' ? data : (data.text || data.msg || '');
    console.log(`[${category}] ${event}${summary ? ': ' + summary.substring(0, 80) : ''}`);

    // Flush immediately if buffer gets big
    if (this._buffer.length >= 5) this._flush();

    // Update session counters
    if (category === 'user') this.session.interactions++;
    if (category === 'learn') this.session.wordsLearned += (data.newWords || 0);
    if (category === 'civ' && event === 'decision') this.session.decisions++;
    if (category === 'error') this.session.errors++;
  }

  // Convenience methods
  userEvent(event, data) { this.log('user', event, data); }
  learnEvent(event, data) { this.log('learn', event, data); }
  creatureEvent(event, data) { this.log('creature', event, data); }
  civEvent(event, data) { this.log('civ', event, data); }
  error(event, data) { this.log('error', event, data); }

  /** Get session summary. */
  getSessionSummary() {
    return {
      ...this.session,
      duration: Math.floor((Date.now() - this.session.started) / 60000), // minutes
    };
  }

  /** Read today's log as array of entries. */
  readToday() {
    const file = this._getFile();
    try {
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, 'utf8').trim().split('\n')
          .filter(l => l.length > 0)
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean);
      }
    } catch {}
    return [];
  }

  /** Read last N events across all log files. */
  readRecent(n = 50) {
    try {
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.jsonl')).sort().reverse();
      const entries = [];
      for (const f of files) {
        if (entries.length >= n) break;
        const lines = fs.readFileSync(path.join(LOG_DIR, f), 'utf8').trim().split('\n').reverse();
        for (const line of lines) {
          if (entries.length >= n) break;
          try { entries.push(JSON.parse(line)); } catch {}
        }
      }
      return entries.reverse();
    } catch { return []; }
  }

  /** Flush buffer to disk. */
  _flush() {
    if (this._buffer.length === 0) return;
    const file = this._getFile();
    try {
      fs.appendFileSync(file, this._buffer.join('\n') + '\n');
    } catch (e) {
      console.error('[Logger] Write error:', e.message);
    }
    this._buffer = [];
  }

  /** Get current day's log file path. */
  _getFile() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this._date = today;
    return path.join(LOG_DIR, `${today}.jsonl`);
  }

  /** Create log directory. */
  _ensureDir() {
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch {}
  }

  /** Remove logs older than MAX_DAYS. */
  _cleanup() {
    try {
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.jsonl')).sort();
      while (files.length > MAX_DAYS) {
        const old = files.shift();
        fs.unlinkSync(path.join(LOG_DIR, old));
      }
    } catch {}
  }

  /** Shutdown — flush and log. */
  shutdown() {
    this.log('system', 'shutdown', this.getSessionSummary());
    this._flush();
    clearInterval(this._flushInterval);
  }
}

module.exports = { Logger };
