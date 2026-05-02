/**
 * Evolution — tracks accumulated environmental conditions and
 * translates them into body adaptations over time.
 *
 * The creature's form is shaped by the computer it lives on.
 * Also provides mutation bias for the NEAT neural network based on environment pressure.
 */

class Evolution {
  constructor() {
    // Body adaptations (0-1 each, grow over time based on exposure)
    this.adaptations = {
      heatPlates: 0,      // hot CPU exposure → armored, compact
      coolFins: 0,         // cold/idle → larger body, softer features
      speedLimbs: 0,       // high activity → more/faster limbs
      bigEyes: 0,          // low activity → bigger eyes, more observant
      antennae: 0,         // typing/input → sensory organs
      thickSkin: 0,        // long uptime → tougher, ages faster visually
      efficiency: 0,       // low RAM → smaller, more efficient body
      nocturnalEyes: 0,    // night exposure → glow, night vision look
      energyStore: 0,      // high RAM / many apps → bigger energy reserves
    };

    this._loadAdaptations();
  }

  /**
   * Tick evolution based on current environment profile.
   * Call this every few seconds with data from environment.js.
   * Rate is intentionally very slow — changes visible over days.
   */
  tick(envProfile) {
    const rate = 0.00005; // base adaptation rate per tick

    // Hot computer → heat plates (compact, armored)
    if (envProfile.temperature === 'hot') {
      this.adaptations.heatPlates = Math.min(1, this.adaptations.heatPlates + rate * 2);
    } else if (envProfile.temperature === 'warm') {
      this.adaptations.heatPlates = Math.min(1, this.adaptations.heatPlates + rate * 0.5);
    }

    // Cold/idle computer → cool fins (larger, softer)
    if (envProfile.temperature === 'cold') {
      this.adaptations.coolFins = Math.min(1, this.adaptations.coolFins + rate * 1.5);
    }

    // High activity → speed limbs
    if (envProfile.activity === 'intense') {
      this.adaptations.speedLimbs = Math.min(1, this.adaptations.speedLimbs + rate * 2);
    } else if (envProfile.activity === 'busy') {
      this.adaptations.speedLimbs = Math.min(1, this.adaptations.speedLimbs + rate);
    }

    // Low activity → big observant eyes
    if (envProfile.activity === 'idle') {
      this.adaptations.bigEyes = Math.min(1, this.adaptations.bigEyes + rate * 1.5);
    }

    // Night exposure → nocturnal features
    if (envProfile.timeOfDay === 'night') {
      this.adaptations.nocturnalEyes = Math.min(1, this.adaptations.nocturnalEyes + rate);
    }

    // Long uptime → thick skin, aging
    if (envProfile.uptime > 24) {
      this.adaptations.thickSkin = Math.min(1, this.adaptations.thickSkin + rate * 0.5);
    }

    // Low RAM → efficiency adaptation
    if (envProfile.ram < 40) {
      this.adaptations.efficiency = Math.min(1, this.adaptations.efficiency + rate);
    }

    // High RAM → energy storage
    if (envProfile.ram > 80) {
      this.adaptations.energyStore = Math.min(1, this.adaptations.energyStore + rate);
    }
  }

  /**
   * Get NEAT mutation bias based on current environment pressure.
   * Returns an object describing which mutations should be favored.
   * Used by cell.js to bias structural mutations during colony growth.
   */
  getMutationBias() {
    const a = this.adaptations;
    return {
      // Hot → favor pruning (efficiency)
      pruneWeight: a.heatPlates > 0.2 ? a.heatPlates * 0.5 : 0,
      // Active → favor adding connections to movement outputs
      addMovementConns: a.speedLimbs > 0.2 ? a.speedLimbs * 0.3 : 0,
      // Idle → favor adding connections to sensory inputs
      addSensoryConns: a.bigEyes > 0.2 ? a.bigEyes * 0.3 : 0,
      // Night → favor recurrent (memory) connections
      addRecurrent: a.nocturnalEyes > 0.2 ? a.nocturnalEyes * 0.4 : 0,
      // Efficient → smaller networks, stronger pruning
      pruneAggressive: a.efficiency > 0.3 ? a.efficiency * 0.3 : 0,
      // Energy store → favor food-seeking pathways
      addFoodConns: a.energyStore > 0.2 ? a.energyStore * 0.2 : 0,
    };
  }

  /** Get dominant body plan description based on accumulated adaptations */
  getBodyPlan() {
    const a = this.adaptations;
    const dominant = Object.entries(a).sort((x, y) => y[1] - x[1]);

    if (dominant[0][1] < 0.05) return 'undeveloped';

    const plans = {
      heatPlates: 'armored',
      coolFins: 'flowing',
      speedLimbs: 'agile',
      bigEyes: 'observant',
      antennae: 'sensory',
      thickSkin: 'weathered',
      efficiency: 'compact',
      nocturnalEyes: 'nocturnal',
      energyStore: 'robust',
    };

    return plans[dominant[0][0]] || 'balanced';
  }

  /** Get total evolution progress (0-1) */
  getProgress() {
    const vals = Object.values(this.adaptations);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // === Persistence ===

  _loadAdaptations() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'evolution.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        Object.assign(this.adaptations, data);
      }
    } catch (e) {
      console.error('[Evolution] Load error:', e.message);
    }
  }

  save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.env.APPDATA || process.env.HOME, '.aria');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'evolution.json'), JSON.stringify(this.adaptations, null, 2));
    } catch (e) {
      console.error('[Evolution] Save error:', e.message);
    }
  }
}

module.exports = { Evolution };
