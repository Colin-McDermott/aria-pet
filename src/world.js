/**
 * World Simulation — the terrarium the creature lives in.
 * Grid-based with tile types, temperature, organisms, particles.
 */

const TILE = {
  EMPTY: 0, SOIL: 1, WATER: 2, ROCK: 3, LAVA: 4, ICE: 5, SAND: 6, ORGANIC: 7
};

const TILE_COLORS = {
  [TILE.EMPTY]: null,
  [TILE.SOIL]: '#1a1510',
  [TILE.WATER]: '#0a2040',
  [TILE.ROCK]: '#2a2520',
  [TILE.LAVA]: '#3a1505',
  [TILE.ICE]: '#1a2530',
  [TILE.SAND]: '#2a2515',
  [TILE.ORGANIC]: '#0a2010',
};

class World {
  constructor(width = 16, height = 12) {
    this.w = width;
    this.h = height;
    this.tiles = [];
    this.temperature = 20;  // celsius
    this.light = 0.7;       // 0-1
    this.humidity = 0.5;    // 0-1
    this.time = 0;
    this.dayLength = 600;   // ticks per day cycle
    this.organisms = [];    // food, plants, critters
    this.particles = [];    // rain, sparks, spores
    this.foodParticles = [];

    this._initTiles();
  }

  _initTiles() {
    for (let y = 0; y < this.h; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.w; x++) {
        // Ground at bottom 2 rows
        if (y >= this.h - 2) this.tiles[y][x] = TILE.SOIL;
        // Water pool in bottom-left
        else if (y >= this.h - 3 && x < 4) this.tiles[y][x] = TILE.WATER;
        // Some rocks
        else if (y === this.h - 3 && (x === 8 || x === 12)) this.tiles[y][x] = TILE.ROCK;
        else this.tiles[y][x] = TILE.EMPTY;
      }
    }
  }

  getTile(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return TILE.ROCK; // walls are solid
    return this.tiles[y][x];
  }

  setTile(x, y, type) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
      this.tiles[y][x] = type;
    }
  }

  isSolid(x, y) {
    const t = this.getTile(x, y);
    return t === TILE.SOIL || t === TILE.ROCK || t === TILE.ICE;
  }

  isLiquid(x, y) {
    const t = this.getTile(x, y);
    return t === TILE.WATER || t === TILE.LAVA;
  }

  /** Get time of day as 0-1 (0=midnight, 0.5=noon) */
  getDayPhase() {
    return (this.time % this.dayLength) / this.dayLength;
  }

  isNight() {
    const p = this.getDayPhase();
    return p < 0.25 || p > 0.75;
  }

  /** World tick — runs every frame */
  tick(dt) {
    this.time += dt;

    // Grow plants on organic tiles near light
    if (Math.random() < 0.005 * this.light) {
      this._tryGrowPlant();
    }

    // Spawn food occasionally
    if (Math.random() < 0.003 && this.foodParticles.length < 5) {
      this._spawnFood();
    }

    // Update organisms
    for (let i = this.organisms.length - 1; i >= 0; i--) {
      const org = this.organisms[i];
      org.age += dt;
      if (org.age > org.maxAge) {
        this.organisms.splice(i, 1);
        // Dead organism becomes organic tile
        const tx = Math.floor(org.x / (1 / this.w));
        const ty = Math.floor(org.y / (1 / this.h));
        if (this.getTile(tx, ty) === TILE.EMPTY) this.setTile(tx, ty, TILE.ORGANIC);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.0005 * dt; // gravity
      p.life -= dt;
      if (p.life <= 0 || p.y > 1) this.particles.splice(i, 1);
    }

    // Update food particles
    for (const f of this.foodParticles) {
      f.vy += 0.0003 * dt; // gravity
      f.y += f.vy * dt;
      // Stop on ground
      const ty = Math.floor(f.y * this.h);
      if (ty >= this.h - 2) {
        f.y = (this.h - 2.5) / this.h;
        f.vy = 0;
        f.grounded = true;
      }
      f.bobPhase = (f.bobPhase || 0) + dt * 0.05;
    }

    // Weather effects
    if (this.humidity > 0.7 && Math.random() < 0.02) {
      this._spawnRain();
    }
  }

  _tryGrowPlant() {
    // Find an organic or soil tile with light
    for (let attempts = 0; attempts < 5; attempts++) {
      const x = Math.floor(Math.random() * this.w);
      const y = Math.floor(Math.random() * this.h);
      if ((this.getTile(x, y) === TILE.SOIL || this.getTile(x, y) === TILE.ORGANIC) &&
          this.getTile(x, y - 1) === TILE.EMPTY) {
        this.organisms.push({
          type: 'plant',
          x: (x + 0.5) / this.w,
          y: (y - 0.5) / this.h,
          size: 0.1 + Math.random() * 0.3,
          color: `hsl(${100 + Math.random() * 40}, ${40 + Math.random() * 30}%, ${15 + Math.random() * 15}%)`,
          age: 0,
          maxAge: 500 + Math.random() * 500,
        });
        break;
      }
    }
  }

  _spawnFood() {
    this.foodParticles.push({
      x: 0.1 + Math.random() * 0.8,
      y: 0.1,
      vy: 0,
      size: 3 + Math.random() * 3,
      color: `hsl(${30 + Math.random() * 30}, 70%, 50%)`,
      energy: 10 + Math.random() * 20,
      grounded: false,
      bobPhase: 0,
    });
  }

  _spawnRain() {
    this.particles.push({
      x: Math.random(),
      y: 0,
      vx: -0.0002 + Math.random() * 0.0001,
      vy: 0.003 + Math.random() * 0.002,
      life: 200,
      color: 'rgba(100, 150, 200, 0.3)',
      size: 1,
    });
  }

  /** Drop food at a position (from mouse) */
  dropFood(nx, ny) {
    this.foodParticles.push({
      x: nx,
      y: ny,
      vy: 0,
      size: 4 + Math.random() * 2,
      color: `hsl(${20 + Math.random() * 40}, 80%, 55%)`,
      energy: 15 + Math.random() * 15,
      grounded: false,
      bobPhase: 0,
    });
  }
}

if (typeof module !== 'undefined') module.exports = { World, TILE, TILE_COLORS };
