/**
 * Cell — the living organism. Starts as a simple blob, evolves over real time.
 *
 * Growth is driven by environment.js (real computer state), not fake feeding.
 * Body adaptations accumulate from evolution.js.
 * Behavior is driven by a NEAT neural network (brain).
 * Physics movement handled by cannon-es (creature-body.js) in the renderer.
 *
 * Stages (real-time progression):
 * 1. Single cell (Day 1-3)   — blob with light-sensitive dot
 * 2. Developing (Week 1)     — eye, mouth, color deepens, personality hints
 * 3. Multi-cell (Week 2-3)   — body shape adapts, tentacles/limbs, emotions
 * 4. Full creature (Month 1+) — unique body plan, full features
 */

const { CreatureBrain } = require('./brain/brain');
const { Trainer } = require('./brain/trainer');
const { Genome } = require('./brain/neat');

class Cell {
  constructor(seed) {
    // Position & physics (normalized 0-1)
    this.x = 0.5;
    this.y = 0.4;
    this.vx = 0;
    this.vy = 0;

    // Physical properties
    this.radius = 12;
    this.mass = 1;

    // Genetics (from seed)
    const rng = this._rng(seed || Date.now());
    this.dna = {
      hue: rng(),
      saturation: 0.4 + rng() * 0.4,
      brightness: 0.3 + rng() * 0.2,
      growthRate: 0.8 + rng() * 0.4,
      bodyPlan: rng(),
      eyeGenes: rng(),
      limbGenes: rng(),
      metabolismGenes: rng(),
    };

    // Growth state
    this.age = 0;             // total hours alive (persisted)
    this.energy = 50;
    this.maxEnergy = 100;
    this.totalEnergy = 0;     // lifetime energy absorbed (drives growth)
    this.stage = 1;

    // Developed features (grow over time from environment)
    this.features = {
      eyeSize: 0,
      mouthSize: 0,
      limbCount: 0,
      limbLength: 0,
      brainSize: 0,
      tailLength: 0,
      bodyWidth: 1,
      bodyHeight: 1,
      spots: 0,
      glow: 0,
    };

    // Membrane deformation
    this.membrane = [];
    for (let i = 0; i < 24; i++) {
      this.membrane.push({
        baseR: 1,
        offset: 0,
        phase: rng() * Math.PI * 2,
        speed: 0.5 + rng() * 1.5,
      });
    }

    // Behavior
    this.state = 'idle';      // idle, moving, eating, sleeping, curious, playing, fleeing
    this.targetX = 0.5;
    this.targetY = 0.5;
    this.stateTimer = 0;
    this.sleepy = 0;
    this.happy = 0.5;
    this.scared = 0;
    this.facing = 1;

    // Visual state
    this.squish = 0;
    this.blinking = false;
    this.blinkTimer = 0;
    this.mouthOpen = 0;
    this.expressionTimer = 0;
    this.expression = 'neutral';

    // Neural brain
    this.brain = new CreatureBrain();
    this.trainer = new Trainer(this.brain);
    this.behaviorBias = null; // from thought engine

    // Screen + audio sense data (set from renderer)
    this.screenData = null;
    this.audioData = null;

    // Motor CPG (trained in gym for locomotion)
    this.motorCPG = null;

    // Health — composite vitality score (0-1), affects learning rate and appearance
    this.health = 0.5;

    // Track previous energy for reward signals
    this._prevEnergy = 50;
    this._prevHappy = 0.5;
    this._wasSleeping = false;

    // Load persisted state
    this._loadState();
  }

  /**
   * Tick — call periodically for state updates.
   * Movement is now handled by cannon-es physics in the renderer.
   * This tick manages energy, health, brain decisions (for communication), sleep.
   *
   * @param {number} dt — milliseconds
   * @param {Object} envProfile — from environment.js
   */
  tick(dt, envProfile) {
    this.age += dt * 0.001 / 3600; // convert ms to hours

    // Brain decision (for communication/thought outputs)
    const worldInfo = { groundY: 0, onGround: true, nearestFood: null, mouseNear: false, mouseX: 0, mouseY: 0 };
    const decision = this.brain.decide(this, worldInfo, envProfile, this.behaviorBias, this.screenData, this.audioData);
    this._lastDecision = decision;

    // Map brain action to behavioral state (for expression/sleep, not movement)
    switch (decision.action) {
      case 0: this.state = 'idle'; break;
      case 5: if (this.sleepy > 0.2) this.state = 'sleeping'; break;
      case 6: this.state = 'playing'; this.happy = Math.min(1, this.happy + 0.001 * dt); break;
      default: this.state = 'idle'; break;
    }
    if (this.state === 'sleeping' && this.sleepy < 0.1) this.state = 'idle';

    // Passive energy from environment
    if (envProfile) {
      const passive = envProfile.cpu * 0.0005 * dt;
      this.energy = Math.min(this.maxEnergy, this.energy + passive);
      this.totalEnergy += passive;
    }

    // Energy decay (slower when sleeping)
    const decayRate = this.state === 'sleeping' ? 0.001 : 0.003;
    this.energy -= decayRate * dt;
    this.energy = Math.max(0, Math.min(this.maxEnergy, this.energy));

    // Sleepiness
    this.sleepy += 0.0001 * dt;
    if (this.state === 'sleeping') this.sleepy -= 0.0005 * dt;
    this.sleepy = Math.max(0, Math.min(1, this.sleepy));

    if (envProfile && envProfile.timeOfDay === 'night' && envProfile.activity === 'idle') {
      this.sleepy = Math.min(1, this.sleepy + 0.0002 * dt);
    }

    // Max energy scales with total absorbed
    this.maxEnergy = 50 + this.totalEnergy * 0.1;

    // Health — composite vitality score. Gates speech/actions, NOT learning.
    this.health = (
      (this.energy / this.maxEnergy) * 0.4 +
      this.happy * 0.3 +
      (1 - this.scared) * 0.15 +
      (1 - this.sleepy) * 0.15
    );

    // Auto-reward signals
    this._processRewards();

    // Sleep consolidation trigger
    if (this.state === 'sleeping' && !this._wasSleeping) {
      this.trainer.sleepConsolidate();
    }
    this._wasSleeping = this.state === 'sleeping';

    // Update expression
    this._updateExpression(envProfile);

    // Scared decay
    this.scared *= 0.995;
  }

  /**
   * Evolve — manually triggered growth step.
   * Applies accumulated environmental adaptation, grows features,
   * processes colony mutations into brain structure.
   * Only happens when the user decides to evolve.
   */
  evolve(envProfile, adaptations) {
    // Run growth multiple times to make each evolve meaningful
    for (let i = 0; i < 50; i++) {
      this._grow(16, envProfile, adaptations);
    }
    // Structural brain mutations
    if (this.brain?.genome) {
      this.brain.genome.mutateWeight(0.4, 0.9);
      this.brain.genome.mutateBias(0.15);
      if (Math.random() < 0.4) this.brain.genome.mutateAddConnection();
      if (Math.random() < 0.2) this.brain.genome.mutateAddNode();
    }
    return {
      stage: this.stage,
      features: { ...this.features },
      brainComplexity: this.brain?.genome?.getComplexity() || 0,
    };
  }

  /** Feed the cell */
  feed(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
    this.totalEnergy += amount;
    this.mouthOpen = 1;
    this.happy = Math.min(1, this.happy + 0.1);
    this.expression = 'happy';
    this.expressionTimer = 60;

    // Reward the brain for eating
    this.trainer.rewardEating();
  }

  /** Poke the cell */
  poke(forceX, forceY) {
    this.vx += forceX;
    this.vy += forceY;
    this.squish = 0.4;
    this.scared = Math.min(1, this.scared + 0.3);
    this.expression = 'surprised';
    this.expressionTimer = 30;
    if (this.state === 'sleeping') {
      this.state = 'idle';
      this.sleepy = 0.3;
    }
  }


  // === Auto Reward Signals ===
  _processRewards() {
    // Happiness increased → small reward
    if (this.happy > this._prevHappy + 0.05) {
      this.trainer.rewardHappiness();
    }

    // Energy dropped below 20% → punishment
    if (this.energy < this.maxEnergy * 0.2 && this._prevEnergy >= this.maxEnergy * 0.2) {
      this.trainer.punishLowEnergy();
    }

    this._prevEnergy = this.energy;
    this._prevHappy = this.happy;
  }


  // === Growth (driven by real environment) ===
  _grow(dt, envProfile, adaptations) {
    const rate = this.dna.growthRate * 0.00001 * dt;
    const ageHours = this.age;

    // Stage progression based on real time alive
    if (ageHours > 24 * 30 && this.stage < 4) this.stage = 4;
    else if (ageHours > 24 * 14 && this.stage < 3) this.stage = 3;
    else if (ageHours > 24 * 3 && this.stage < 2) this.stage = 2;

    // Eyes develop over time (stage 2+)
    if (this.stage >= 2) {
      this.features.eyeSize = Math.min(1, this.features.eyeSize + rate * this.dna.eyeGenes);
    }

    // Mouth develops after eyes
    if (this.stage >= 2 && this.features.eyeSize > 0.3) {
      this.features.mouthSize = Math.min(1, this.features.mouthSize + rate * 0.5);
    }

    // Body grows based on energy absorbed
    this.radius = 12 + Math.min(this.totalEnergy * 0.02, 20);

    // Spots appear in stage 2
    if (this.stage >= 2 && this.features.spots === 0) {
      this.features.spots = Math.floor(this.dna.bodyPlan * 5);
    }

    // Limbs in stage 3
    if (this.stage >= 3 && this.features.limbCount === 0) {
      let limbBase = Math.floor(this.dna.limbGenes * 4) + 2;
      if (adaptations && adaptations.speedLimbs > 0.3) limbBase += 1;
      this.features.limbCount = limbBase;
    }

    // Continuous growth (stage 3+)
    if (this.stage >= 3) {
      this.features.limbLength = Math.min(1, this.features.limbLength + rate * this.dna.limbGenes);
      this.features.tailLength = Math.min(1, this.features.tailLength + rate * (1 - this.dna.limbGenes));
    }

    // Glow (stage 4, or nocturnal adaptation)
    if (this.stage >= 4) {
      this.features.glow = Math.min(1, this.features.glow + rate * 0.2);
    }
    if (adaptations && adaptations.nocturnalEyes > 0.2) {
      this.features.glow = Math.min(1, this.features.glow + rate * adaptations.nocturnalEyes * 0.5);
    }

    // Brain (stage 4)
    if (this.stage >= 4) {
      this.features.brainSize = Math.min(1, this.features.brainSize + rate * this.dna.eyeGenes * 0.3);
    }

    // Adaptation-driven modifications
    if (adaptations) {
      if (adaptations.heatPlates > 0.1) {
        this.features.bodyWidth = Math.max(0.7, 1 - adaptations.heatPlates * 0.3);
        this.features.bodyHeight = Math.min(1.3, 1 + adaptations.heatPlates * 0.2);
      }
      if (adaptations.coolFins > 0.1) {
        this.features.bodyWidth = Math.min(1.3, 1 + adaptations.coolFins * 0.3);
      }
      if (adaptations.bigEyes > 0.1) {
        this.features.eyeSize = Math.min(1, this.features.eyeSize + adaptations.bigEyes * rate);
      }
      if (adaptations.efficiency > 0.2) {
        this.radius = Math.max(10, this.radius * (1 - adaptations.efficiency * 0.15));
      }
    }
  }

  _updateExpression(envProfile) {
    this.expressionTimer--;
    if (this.expressionTimer > 0) return;

    if (this.state === 'sleeping') this.expression = 'sleepy';
    else if (this.scared > 0.4) this.expression = 'scared';
    else if (this.happy > 0.6) this.expression = 'happy';
    else if (this.energy < 20) this.expression = 'sad';
    else if (this.state === 'playing') this.expression = 'happy';
    else this.expression = 'neutral';
  }

  /** Get personality description for LLM context */
  getPersonality() {
    const traits = [];
    if (this.happy > 0.6) traits.push('cheerful');
    if (this.scared > 0.3) traits.push('nervous');
    if (this.sleepy > 0.5) traits.push('drowsy');
    if (this.stage >= 3) traits.push('curious');
    if (this.stage >= 4) traits.push('thoughtful');
    if (this.energy < 30) traits.push('hungry');

    // Add brain complexity indicator
    const hidden = this.brain.genome.getHiddenCount();
    if (hidden > 10) traits.push('complex');
    else if (hidden > 5) traits.push('developing');

    return traits.length > 0 ? traits.join(', ') : 'calm';
  }

  // === Persistence ===
  save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.env.APPDATA || process.env.HOME, '.aria');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'cell.json'), JSON.stringify({
        age: this.age,
        totalEnergy: this.totalEnergy,
        stage: this.stage,
        features: this.features,
        dna: this.dna,
        energy: this.energy,
        happy: this.happy,
        brain: this.brain.toJSON(),
        motorCPG: this.motorCPG ? this.motorCPG.toJSON() : null,
      }, null, 2));
    } catch (e) {
      console.error('[Cell] Save error:', e.message);
    }
  }

  _loadState() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'cell.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.age) this.age = data.age;
        if (data.totalEnergy) this.totalEnergy = data.totalEnergy;
        if (data.stage) this.stage = data.stage;
        if (data.features) Object.assign(this.features, data.features);
        if (data.energy) this.energy = data.energy;
        if (data.happy) this.happy = data.happy;
        if (data.brain) {
          this.brain = CreatureBrain.fromJSON(data.brain);
          this.trainer = new Trainer(this.brain);
        }
        if (data.motorCPG) {
          const { CPGController } = require('./training/cpg');
          this.motorCPG = CPGController.fromJSON(data.motorCPG);
        }
        // Gracefully ignore old motorGenome data
      }
    } catch (e) {
      console.error('[Cell] Load error:', e.message);
    }
  }

  // === Helpers ===
  _rng(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
}

if (typeof module !== 'undefined') module.exports = { Cell };
