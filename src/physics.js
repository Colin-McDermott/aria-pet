/**
 * Creature Physics — gravity, collision, autonomous movement.
 * The creature exists in the world grid and responds to it physically.
 */

class CreaturePhysics {
  constructor(world) {
    this.world = world;

    // Position (normalized 0-1)
    this.x = 0.5;
    this.y = 0.3;
    this.vx = 0;
    this.vy = 0;

    // Physical properties
    this.gravity = 0.00015;
    this.friction = 0.92;
    this.bounciness = 0.4;
    this.maxSpeed = 0.015;
    this.size = 0.15; // radius as fraction of world

    // State
    this.grounded = false;
    this.inWater = false;
    this.onWall = false;
    this.facing = 1; // 1=right, -1=left

    // Autonomous behavior
    this.behavior = 'idle';    // idle, wander, seek_food, flee, sleep, play
    this.behaviorTimer = 0;
    this.targetX = 0.5;
    this.targetY = 0.5;
    this.sleepTimer = 0;
    this.idleTimer = 0;
    this.excitement = 0;       // 0-1, affects movement speed
    this.tiredness = 0;        // 0-1, when high → sleep

    // External forces (from mouse interaction)
    this.pokeVx = 0;
    this.pokeVy = 0;

    // Trail (for visual effects)
    this.trail = [];
  }

  tick(dt, mouseState) {
    // Apply gravity (reduced in water)
    const gravMult = this.inWater ? 0.2 : 1;
    this.vy += this.gravity * dt * gravMult;

    // Apply poke forces
    this.vx += this.pokeVx;
    this.vy += this.pokeVy;
    this.pokeVx *= 0.8;
    this.pokeVy *= 0.8;

    // Autonomous movement
    this._updateBehavior(dt, mouseState);
    this._applyBehaviorForce(dt);

    // Apply friction
    const fric = this.inWater ? 0.85 : (this.grounded ? this.friction : 0.98);
    this.vx *= fric;
    this.vy *= fric;

    // Clamp speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.maxSpeed) {
      this.vx = (this.vx / speed) * this.maxSpeed;
      this.vy = (this.vy / speed) * this.maxSpeed;
    }

    // Move
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Facing direction
    if (Math.abs(this.vx) > 0.0001) this.facing = this.vx > 0 ? 1 : -1;

    // Collision with world boundaries
    this.grounded = false;
    this.onWall = false;

    // Floor
    const floorY = this._findFloor();
    if (this.y > floorY) {
      this.y = floorY;
      if (this.vy > 0.002) {
        this.vy = -this.vy * this.bounciness;
        this.excitement = Math.min(1, this.excitement + 0.2);
      } else {
        this.vy = 0;
      }
      this.grounded = true;
    }

    // Walls
    if (this.x < this.size) {
      this.x = this.size;
      this.vx = Math.abs(this.vx) * this.bounciness;
      this.onWall = true;
    }
    if (this.x > 1 - this.size) {
      this.x = 1 - this.size;
      this.vx = -Math.abs(this.vx) * this.bounciness;
      this.onWall = true;
    }

    // Ceiling
    if (this.y < this.size * 0.5) {
      this.y = this.size * 0.5;
      this.vy = Math.abs(this.vy) * 0.3;
    }

    // Check water
    const tx = Math.floor(this.x * this.world.w);
    const ty = Math.floor(this.y * this.world.h);
    this.inWater = this.world.isLiquid(tx, ty);

    // Trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 20) this.trail.shift();

    // Tiredness
    this.tiredness += 0.00005 * dt;
    if (this.behavior !== 'sleep') this.tiredness = Math.min(0.95, this.tiredness);
    this.excitement *= 0.998;

    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      grounded: this.grounded,
      inWater: this.inWater,
      facing: this.facing,
      behavior: this.behavior,
      speed: speed,
      excitement: this.excitement,
      tiredness: this.tiredness,
    };
  }

  _findFloor() {
    // Check tile below creature
    const tx = Math.floor(this.x * this.world.w);
    for (let ty = Math.floor(this.y * this.world.h); ty < this.world.h; ty++) {
      if (this.world.isSolid(tx, ty)) {
        return ty / this.world.h - 0.01;
      }
    }
    return 1 - this.size; // bottom of world
  }

  _updateBehavior(dt, mouseState) {
    this.behaviorTimer -= dt;
    this.idleTimer += dt;

    // Tired → sleep
    if (this.tiredness > 0.8 && this.behavior !== 'sleep') {
      this.behavior = 'sleep';
      this.behaviorTimer = 200 + Math.random() * 300;
      return;
    }

    // Sleeping
    if (this.behavior === 'sleep') {
      this.tiredness -= 0.0003 * dt;
      if (this.tiredness < 0.2 || (mouseState && mouseState.poking)) {
        this.behavior = 'idle';
        this.tiredness = 0.1;
      }
      return;
    }

    // Mouse nearby — get curious or flee based on excitement
    if (mouseState && mouseState.near && !mouseState.dragging) {
      if (this.excitement > 0.5) {
        this.behavior = 'flee';
        this.targetX = this.x + (this.x > mouseState.x ? 0.3 : -0.3);
        this.behaviorTimer = 30;
        return;
      } else {
        // Curious — look at mouse
        this.targetX = mouseState.x;
        this.targetY = mouseState.y;
      }
    }

    // Being poked — react
    if (mouseState && mouseState.poking) {
      this.excitement = Math.min(1, this.excitement + 0.3);
      this.behavior = 'flee';
      this.targetX = this.x + (Math.random() - 0.5) * 0.4;
      this.behaviorTimer = 40;
      return;
    }

    // Check for nearby food
    const nearestFood = this._findNearestFood();
    if (nearestFood && this.behavior !== 'seek_food') {
      this.behavior = 'seek_food';
      this.targetX = nearestFood.x;
      this.targetY = nearestFood.y;
      this.behaviorTimer = 100;
      return;
    }

    // Timer expired — pick new behavior
    if (this.behaviorTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.4) {
        this.behavior = 'idle';
        this.behaviorTimer = 50 + Math.random() * 100;
      } else if (roll < 0.8) {
        this.behavior = 'wander';
        this.targetX = 0.1 + Math.random() * 0.8;
        this.behaviorTimer = 60 + Math.random() * 120;
      } else {
        this.behavior = 'play';
        this.behaviorTimer = 40 + Math.random() * 60;
      }
    }
  }

  _applyBehaviorForce(dt) {
    const moveForce = 0.000008 * (1 + this.excitement);

    switch (this.behavior) {
      case 'idle':
        // Subtle sway
        this.vx += Math.sin(this.idleTimer * 0.02) * 0.000001 * dt;
        break;

      case 'wander':
        // Move toward target
        const dx = this.targetX - this.x;
        this.vx += Math.sign(dx) * moveForce * dt;
        break;

      case 'seek_food':
        const fdx = this.targetX - this.x;
        this.vx += Math.sign(fdx) * moveForce * 1.5 * dt;
        // Check if reached food
        if (Math.abs(fdx) < 0.05) {
          this._eatNearestFood();
          this.behavior = 'idle';
          this.behaviorTimer = 30;
        }
        break;

      case 'flee':
        const flx = this.targetX - this.x;
        this.vx += Math.sign(flx) * moveForce * 2 * dt;
        // Small jump when fleeing
        if (this.grounded && Math.random() < 0.03) {
          this.vy = -0.003;
        }
        break;

      case 'play':
        // Bounce around randomly
        if (this.grounded && Math.random() < 0.05) {
          this.vy = -0.002 - Math.random() * 0.003;
          this.vx += (Math.random() - 0.5) * 0.003;
        }
        break;

      case 'sleep':
        // Settle down, stop moving
        this.vx *= 0.9;
        break;
    }
  }

  _findNearestFood() {
    let nearest = null;
    let minDist = 0.3; // detection range
    for (const f of this.world.foodParticles) {
      const dist = Math.abs(f.x - this.x) + Math.abs(f.y - this.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = f;
      }
    }
    return nearest;
  }

  _eatNearestFood() {
    let minDist = 0.1;
    let idx = -1;
    for (let i = 0; i < this.world.foodParticles.length; i++) {
      const f = this.world.foodParticles[i];
      const dist = Math.abs(f.x - this.x) + Math.abs(f.y - this.y);
      if (dist < minDist) { minDist = dist; idx = i; }
    }
    if (idx >= 0) {
      const food = this.world.foodParticles.splice(idx, 1)[0];
      return food.energy;
    }
    return 0;
  }

  /** Apply external force (from mouse poke/throw) */
  poke(forceX, forceY) {
    this.pokeVx += forceX;
    this.pokeVy += forceY;
    this.excitement = Math.min(1, this.excitement + 0.2);
  }

  /** Throw creature (from mouse release with momentum) */
  throw(vx, vy) {
    this.vx += vx;
    this.vy += vy;
    this.excitement = Math.min(1, this.excitement + 0.4);
  }
}

if (typeof module !== 'undefined') module.exports = { CreaturePhysics };
