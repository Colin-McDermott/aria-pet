/**
 * Cell — the simplest living thing. Starts as a blob.
 * Grows features based on environment and feeding.
 *
 * Growth stages:
 * 1. Single cell (blob) — just exists, eats, moves randomly
 * 2. Multi-cell — develops mouth, eye spot
 * 3. Organism — limbs/fins, brain visible
 * 4. Creature — full body, personality, speaks
 */

class Cell {
  constructor(seed) {
    // Position & physics
    this.x = 0.5;
    this.y = 0.4;
    this.vx = 0;
    this.vy = 0;

    // Physical properties
    this.radius = 12;
    this.mass = 1;

    // Genetics (from seed — determines growth path)
    const rng = this._rng(seed || Date.now());
    this.dna = {
      hue: rng(),
      saturation: 0.4 + rng() * 0.4,
      brightness: 0.3 + rng() * 0.2,
      growthRate: 0.8 + rng() * 0.4,   // how fast it grows
      bodyPlan: rng(),                   // determines final form
      eyeGenes: rng(),                   // eye size/count tendency
      limbGenes: rng(),                  // limb development tendency
      metabolismGenes: rng(),            // energy efficiency
    };

    // Growth state
    this.age = 0;
    this.energy = 50;
    this.maxEnergy = 100;
    this.totalFed = 0;
    this.stage = 1;         // 1=cell, 2=multi, 3=organism, 4=creature

    // Developed features (grow over time)
    this.features = {
      eyeSize: 0,           // 0-1
      mouthSize: 0,         // 0-1
      limbCount: 0,         // 0-6
      limbLength: 0,        // 0-1
      brainSize: 0,         // 0-1 (visible neural complexity)
      tailLength: 0,        // 0-1
      bodyWidth: 1,         // relative to radius
      bodyHeight: 1,
      spots: 0,             // decorative spots count
      glow: 0,              // bioluminescence 0-1
    };

    // Membrane deformation (makes it look organic)
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
    this.state = 'idle';    // idle, moving, eating, sleeping, curious
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
    this.expression = 'neutral'; // neutral, happy, surprised, sleepy, scared
  }

  /** Tick — call every frame */
  tick(dt, worldInfo) {
    this.age += dt * 0.001;

    // Gravity
    this.vy += 0.00012 * dt;

    // Water drag
    if (worldInfo.inWater) {
      this.vx *= 0.95;
      this.vy *= 0.95;
      this.vy -= 0.00005 * dt; // buoyancy
    }

    // Friction on ground
    if (worldInfo.onGround) {
      this.vx *= 0.88;
      this.vy = Math.min(0, this.vy);
    } else {
      this.vx *= 0.99;
    }

    // Autonomous movement
    this._updateBehavior(dt, worldInfo);

    // Move
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Boundaries
    if (this.x < 0.05) { this.x = 0.05; this.vx = Math.abs(this.vx) * 0.5; }
    if (this.x > 0.95) { this.x = 0.95; this.vx = -Math.abs(this.vx) * 0.5; }
    if (this.y < 0.05) { this.y = 0.05; this.vy = Math.abs(this.vy) * 0.3; }
    if (this.y > worldInfo.groundY) {
      if (this.vy > 0.003) {
        // Bounce
        this.vy = -this.vy * 0.3;
        this.squish = 0.3;
      } else {
        this.y = worldInfo.groundY;
        this.vy = 0;
      }
    }

    // Facing
    if (Math.abs(this.vx) > 0.0002) this.facing = this.vx > 0 ? 1 : -1;

    // Energy decay
    this.energy -= 0.003 * dt;
    this.energy = Math.max(0, Math.min(this.maxEnergy, this.energy));

    // Sleepiness
    this.sleepy += 0.0001 * dt;
    if (this.state === 'sleeping') this.sleepy -= 0.0005 * dt;
    this.sleepy = Math.max(0, Math.min(1, this.sleepy));

    // Squish decay
    this.squish *= 0.9;

    // Blinking
    this.blinkTimer += dt;
    if (!this.blinking && Math.random() < (this.state === 'sleeping' ? 0.001 : 0.003)) {
      this.blinking = true;
      setTimeout(() => this.blinking = false, this.state === 'sleeping' ? 1500 : 120);
    }

    // Mouth
    this.mouthOpen *= 0.9;

    // Growth!
    this._grow(dt);

    // Update expression
    this._updateExpression();

    // Scared decay
    this.scared *= 0.995;
  }

  /** Feed the cell */
  feed(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
    this.totalFed += amount;
    this.mouthOpen = 1;
    this.happy = Math.min(1, this.happy + 0.1);
    this.expression = 'happy';
    this.expressionTimer = 60;
  }

  /** Poke the cell */
  poke(forceX, forceY) {
    this.vx += forceX;
    this.vy += forceY;
    this.squish = 0.4;
    this.scared = Math.min(1, this.scared + 0.3);
    this.expression = 'surprised';
    this.expressionTimer = 30;
    // Wake up if sleeping
    if (this.state === 'sleeping') {
      this.state = 'idle';
      this.sleepy = 0.3;
    }
  }

  // === Growth ===
  _grow(dt) {
    const rate = this.dna.growthRate * 0.00001 * dt;
    const fed = this.totalFed;

    // Eyes develop based on light + age
    if (fed > 20) {
      this.features.eyeSize = Math.min(1, this.features.eyeSize + rate * this.dna.eyeGenes);
    }

    // Mouth develops from eating
    if (fed > 10) {
      this.features.mouthSize = Math.min(1, this.features.mouthSize + rate * 0.5);
    }

    // Body grows from feeding
    this.radius = 12 + Math.min(fed * 0.1, 20);
    this.maxEnergy = 50 + fed * 0.5;

    // Stage progression
    if (fed > 30 && this.stage < 2) {
      this.stage = 2;
      this.features.spots = Math.floor(this.dna.bodyPlan * 5);
    }
    if (fed > 100 && this.stage < 3) {
      this.stage = 3;
      this.features.limbCount = Math.floor(this.dna.limbGenes * 4) + 2;
    }
    if (fed > 250 && this.stage < 4) {
      this.stage = 4;
      this.features.glow = this.dna.hue > 0.5 ? 0.5 : 0;
      this.features.brainSize = this.dna.eyeGenes * 0.5;
    }

    // Continuous growth
    if (this.stage >= 3) {
      this.features.limbLength = Math.min(1, this.features.limbLength + rate * this.dna.limbGenes);
      this.features.tailLength = Math.min(1, this.features.tailLength + rate * (1 - this.dna.limbGenes));
    }
    if (this.stage >= 2) {
      this.features.glow = Math.min(1, this.features.glow + rate * 0.1);
    }
  }

  // === Behavior ===
  _updateBehavior(dt, worldInfo) {
    this.stateTimer -= dt;

    // Sleepy → sleep
    if (this.sleepy > 0.8 && this.state !== 'sleeping') {
      this.state = 'sleeping';
      this.stateTimer = 200;
      return;
    }

    // Sleeping
    if (this.state === 'sleeping') {
      if (this.sleepy < 0.1) this.state = 'idle';
      return;
    }

    // See food?
    if (worldInfo.nearestFood && this.state !== 'eating') {
      this.state = 'eating';
      this.targetX = worldInfo.nearestFood.x;
      this.targetY = worldInfo.nearestFood.y;
      this.stateTimer = 100;
    }

    // Mouse nearby and not scared
    if (worldInfo.mouseNear && this.scared < 0.3 && this.state === 'idle') {
      this.state = 'curious';
      this.targetX = worldInfo.mouseX;
      this.targetY = worldInfo.mouseY;
      this.stateTimer = 50;
    }

    // Scared — move away from mouse
    if (this.scared > 0.5) {
      this.state = 'moving';
      this.targetX = this.x + (this.x > 0.5 ? 0.3 : -0.3);
      this.stateTimer = 40;
    }

    // Timer up — new behavior
    if (this.stateTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.5) {
        this.state = 'idle';
        this.stateTimer = 60 + Math.random() * 100;
      } else {
        this.state = 'moving';
        this.targetX = 0.1 + Math.random() * 0.8;
        this.stateTimer = 50 + Math.random() * 80;
      }
    }

    // Apply movement force
    const speed = 0.000005 * (1 + this.stage * 0.3);
    if (this.state === 'moving' || this.state === 'eating' || this.state === 'curious') {
      const dx = this.targetX - this.x;
      if (Math.abs(dx) > 0.02) {
        this.vx += Math.sign(dx) * speed * dt;
      }
    }
  }

  _updateExpression() {
    this.expressionTimer--;
    if (this.expressionTimer > 0) return;

    if (this.state === 'sleeping') this.expression = 'sleepy';
    else if (this.scared > 0.4) this.expression = 'scared';
    else if (this.happy > 0.6) this.expression = 'happy';
    else if (this.energy < 20) this.expression = 'sad';
    else this.expression = 'neutral';
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
