/**
 * Environment Reader — your computer IS the terrarium.
 *
 * Polls real system state and translates it into creature conditions.
 * Tracks cumulative exposure over time to drive evolution.
 */

const os = require('os');

class Environment {
  constructor() {
    // Current snapshot
    this.cpu = 0;           // 0-100
    this.ram = 0;           // 0-100
    this.uptime = 0;        // hours
    this.hour = new Date().getHours();
    this.appsOpen = 0;      // rough estimate from CPU load

    // Derived conditions
    this.temperature = 'mild';    // cold, mild, warm, hot
    this.activity = 'idle';       // idle, light, busy, intense
    this.timeOfDay = 'day';       // night, dawn, day, dusk

    // Cumulative exposure (hours spent in each condition — drives evolution)
    this.exposure = {
      hot: 0,
      cold: 0,
      busy: 0,
      idle: 0,
      night: 0,
      day: 0,
      highRam: 0,
      lowRam: 0,
      longUptime: 0,
    };

    // CPU history for smoothing
    this._cpuPrev = null;
    this._pollInterval = null;

    // Load saved exposure
    this._loadExposure();
  }

  /** Start polling system state every intervalMs */
  start(intervalMs = 5000) {
    this.poll(); // immediate first poll
    this._pollInterval = setInterval(() => this.poll(), intervalMs);

    // Save exposure every 60s
    this._saveInterval = setInterval(() => this._saveExposure(), 60000);
  }

  stop() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    if (this._saveInterval) clearInterval(this._saveInterval);
    this._saveExposure();
  }

  /** Poll system state and update conditions */
  poll() {
    // CPU usage (compare idle time between polls)
    const cpus = os.cpus();
    const cpuNow = cpus.map(c => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      return { idle: c.times.idle, total };
    });

    if (this._cpuPrev) {
      let idleDelta = 0, totalDelta = 0;
      for (let i = 0; i < cpuNow.length; i++) {
        idleDelta += cpuNow[i].idle - this._cpuPrev[i].idle;
        totalDelta += cpuNow[i].total - this._cpuPrev[i].total;
      }
      this.cpu = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    }
    this._cpuPrev = cpuNow;

    // RAM
    this.ram = Math.round((1 - os.freemem() / os.totalmem()) * 100);

    // Uptime (hours)
    this.uptime = os.uptime() / 3600;

    // Time of day
    this.hour = new Date().getHours();

    // Derive conditions
    this._deriveConditions();

    // Accumulate exposure (in fractional hours based on poll interval)
    this._accumulateExposure();
  }

  _deriveConditions() {
    // Temperature from CPU load
    if (this.cpu > 80) this.temperature = 'hot';
    else if (this.cpu > 50) this.temperature = 'warm';
    else if (this.cpu > 15) this.temperature = 'mild';
    else this.temperature = 'cold';

    // Activity level
    if (this.cpu > 70) this.activity = 'intense';
    else if (this.cpu > 40) this.activity = 'busy';
    else if (this.cpu > 10) this.activity = 'light';
    else this.activity = 'idle';

    // Time of day
    if (this.hour >= 0 && this.hour < 6) this.timeOfDay = 'night';
    else if (this.hour >= 6 && this.hour < 9) this.timeOfDay = 'dawn';
    else if (this.hour >= 9 && this.hour < 18) this.timeOfDay = 'day';
    else if (this.hour >= 18 && this.hour < 21) this.timeOfDay = 'dusk';
    else this.timeOfDay = 'night';
  }

  _accumulateExposure() {
    // Each poll adds ~5s worth of exposure (converted to hours)
    const dt = 5 / 3600;

    if (this.temperature === 'hot' || this.temperature === 'warm') this.exposure.hot += dt;
    if (this.temperature === 'cold') this.exposure.cold += dt;
    if (this.activity === 'intense' || this.activity === 'busy') this.exposure.busy += dt;
    if (this.activity === 'idle') this.exposure.idle += dt;
    if (this.timeOfDay === 'night') this.exposure.night += dt;
    else this.exposure.day += dt;
    if (this.ram > 80) this.exposure.highRam += dt;
    if (this.ram < 40) this.exposure.lowRam += dt;
    if (this.uptime > 24) this.exposure.longUptime += dt;
  }

  /** Get a summary suitable for feeding into cell growth */
  getProfile() {
    return {
      cpu: this.cpu,
      ram: this.ram,
      uptime: this.uptime,
      hour: this.hour,
      temperature: this.temperature,
      activity: this.activity,
      timeOfDay: this.timeOfDay,
      exposure: { ...this.exposure },
    };
  }

  /** Food spawn rate — busier computer = more food */
  getFoodRate() {
    if (this.activity === 'intense') return 0.02;
    if (this.activity === 'busy') return 0.008;
    if (this.activity === 'light') return 0.003;
    return 0.001; // idle — scarce
  }

  /** Energy the creature gets from the environment (passive) */
  getPassiveEnergy() {
    // High CPU activity = more ambient energy
    return this.cpu * 0.001;
  }

  /** Should the creature sleep? */
  isSleepTime() {
    return this.timeOfDay === 'night' && this.activity === 'idle';
  }

  // === Persistence ===

  _loadExposure() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'exposure.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        Object.assign(this.exposure, data);
      }
    } catch (e) {
      console.error('[Environment] Load exposure error:', e.message);
    }
  }

  _saveExposure() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.env.APPDATA || process.env.HOME, '.aria');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'exposure.json'), JSON.stringify(this.exposure, null, 2));
    } catch (e) {
      console.error('[Environment] Save exposure error:', e.message);
    }
  }
}

module.exports = { Environment };
