/**
 * Terrarium Renderer — draws the cell and its world.
 * Simple, clean, smooth. No old creature system baggage.
 */

class Terrarium {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = null;
    this.time = 0;
    this.food = [];       // { x, y, vy, size, color, energy, grounded }
    this.plants = [];     // { x, y, size, hue, age }

    // Ground height (normalized)
    this.groundY = 0.78;
    this.waterLevel = null; // set to y value for water
    this.waterLeft = 0;
    this.waterRight = 0.25;

    // Mouse
    this.mouseX = 0.5;
    this.mouseY = 0.5;
    this.mouseIn = false;
    this.mouseDown = false;

    // Input handlers
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = (e.clientY - r.top) / r.height;
      this.mouseIn = true;
    });
    canvas.addEventListener('mouseleave', () => { this.mouseIn = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      if (this.cell) {
        const dx = this.mouseX - this.cell.x;
        const dy = this.mouseY - this.cell.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 0.15) {
          this.cell.poke(-dx * 0.01, -dy * 0.01 - 0.003);
          if (this.onPoke) this.onPoke('poke');
        }
      }
    });
    canvas.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('dblclick', () => {
      if (this.cell) {
        this.cell.poke((Math.random()-0.5) * 0.01, -0.006);
        if (this.onPoke) this.onPoke('tickle');
      }
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.dropFood(this.mouseX, this.mouseY);
      if (this.onPoke) this.onPoke('feed');
    });

    this.onPoke = null;
    this.running = false;
  }

  setCell(cell) {
    this.cell = cell;
    if (!this.running) {
      this.running = true;
      this._loop();
    }
  }

  dropFood(x, y) {
    this.food.push({
      x, y, vy: 0, size: 3 + Math.random() * 2,
      color: `hsl(${25 + Math.random() * 30}, 75%, 50%)`,
      energy: 10 + Math.random() * 10,
      grounded: false,
    });
  }

  _loop() {
    this.time += 0.03;

    // Update food physics
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      if (!f.grounded) {
        f.vy += 0.0002;
        f.y += f.vy;
        if (f.y > this.groundY - 0.02) {
          f.y = this.groundY - 0.02;
          f.vy = 0;
          f.grounded = true;
        }
      }
      // Cell eats food when close
      if (this.cell) {
        const dist = Math.abs(f.x - this.cell.x) + Math.abs(f.y - this.cell.y);
        if (dist < 0.06) {
          this.cell.feed(f.energy);
          this.food.splice(i, 1);
        }
      }
    }

    // Spawn plants slowly
    if (Math.random() < 0.001 && this.plants.length < 8) {
      this.plants.push({
        x: 0.05 + Math.random() * 0.9,
        y: this.groundY,
        size: 0.5 + Math.random() * 1,
        hue: 90 + Math.random() * 50,
        age: 0,
      });
    }
    for (const p of this.plants) {
      p.age += 0.001;
      p.size = Math.min(3, p.size + 0.0001);
    }

    // Find nearest food for cell AI
    let nearestFood = null;
    if (this.cell && this.food.length > 0) {
      let minD = 999;
      for (const f of this.food) {
        const d = Math.abs(f.x - this.cell.x) + Math.abs(f.y - this.cell.y);
        if (d < minD) { minD = d; nearestFood = f; }
      }
      if (minD > 0.4) nearestFood = null;
    }

    // Tick cell
    if (this.cell) {
      const inWater = this.cell.x > this.waterLeft && this.cell.x < this.waterRight && this.cell.y > this.groundY - 0.15;
      this.cell.tick(1, {
        groundY: this.groundY - 0.01,
        onGround: this.cell.y >= this.groundY - 0.02,
        inWater,
        nearestFood,
        mouseNear: this.mouseIn,
        mouseX: this.mouseX,
        mouseY: this.mouseY,
      });
    }

    // Auto-spawn food if cell is hungry
    if (this.cell && this.cell.energy < 20 && this.food.length === 0 && Math.random() < 0.005) {
      this.dropFood(0.1 + Math.random() * 0.8, 0.1);
    }

    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#040610');
    grad.addColorStop(0.6, '#060a15');
    grad.addColorStop(1, '#080e18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Stars
    for (let i = 0; i < 8; i++) {
      const sx = (i * 31 + 7) % w;
      const sy = (i * 19 + 3) % (h * 0.5);
      ctx.fillStyle = `rgba(180, 200, 255, ${0.15 + Math.sin(this.time + i) * 0.1})`;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Ground
    const gy = this.groundY * h;
    ctx.fillStyle = '#151210';
    ctx.fillRect(0, gy, w, h - gy);
    // Ground surface detail
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    for (let x = 0; x < w; x += 4) {
      ctx.lineTo(x, gy + Math.sin(x * 0.05 + this.time * 0.5) * 1.5);
    }
    ctx.stroke();

    // Water pool
    if (this.waterLeft !== null) {
      const wl = this.waterLeft * w;
      const wr = this.waterRight * w;
      const wy = (this.groundY - 0.12) * h;
      ctx.fillStyle = 'rgba(15, 40, 80, 0.4)';
      ctx.fillRect(wl, wy, wr - wl, gy - wy + 10);
      // Water surface
      ctx.strokeStyle = 'rgba(60, 120, 200, 0.2)';
      ctx.beginPath();
      ctx.moveTo(wl, wy);
      for (let x = wl; x < wr; x += 3) {
        ctx.lineTo(x, wy + Math.sin(x * 0.08 + this.time * 2) * 1.5);
      }
      ctx.stroke();
    }

    // Plants
    for (const p of this.plants) {
      const px = p.x * w;
      const py = p.y * h;
      const sz = p.size * 8;
      // Stem
      ctx.strokeStyle = `hsla(${p.hue - 20}, 40%, 20%, 0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.sin(this.time * 1.5 + p.x * 5) * 2, py - sz);
      ctx.stroke();
      // Top
      ctx.beginPath();
      ctx.arc(px + Math.sin(this.time * 1.5 + p.x * 5) * 2, py - sz, sz * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 45%, 25%, 0.6)`;
      ctx.fill();
    }

    // Food
    for (const f of this.food) {
      const fx = f.x * w;
      const fy = f.y * h;
      ctx.beginPath();
      ctx.arc(fx, fy, f.size, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
      // Glow
      ctx.beginPath();
      ctx.arc(fx, fy, f.size + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 50, 0.08)';
      ctx.fill();
    }

    // Mouse cursor indicator when hovering
    if (this.mouseIn) {
      ctx.beginPath();
      ctx.arc(this.mouseX * w, this.mouseY * h, 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(45, 204, 112, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // === Draw Cell ===
    if (this.cell) this._drawCell(ctx, w, h);
  }

  _drawCell(ctx, w, h) {
    const c = this.cell;
    const cx = c.x * w;
    const cy = c.y * h;
    const r = c.radius;

    const hue = c.dna.hue * 360;
    const sat = c.dna.saturation * 100;
    const bri = c.dna.brightness * 100;

    ctx.save();
    ctx.translate(cx, cy);

    // Squish
    const sx = 1 + c.squish * 0.3;
    const sy = 1 - c.squish * 0.2;
    ctx.scale(c.facing, 1);
    ctx.scale(sx, sy);

    // === Body (membrane) ===
    const breathe = Math.sin(this.time * 2) * 0.03;
    ctx.beginPath();
    for (let i = 0; i < c.membrane.length; i++) {
      const m = c.membrane[i];
      const a = (i / c.membrane.length) * Math.PI * 2;
      m.offset = Math.sin(this.time * m.speed + m.phase) * 2;
      const mr = (r + m.offset) * (1 + breathe);
      const px = Math.cos(a) * mr;
      const py = Math.sin(a) * mr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Body gradient
    const bodyGrad = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r * 1.2);
    bodyGrad.addColorStop(0, `hsla(${hue}, ${sat}%, ${bri + 20}%, 0.9)`);
    bodyGrad.addColorStop(0.6, `hsla(${hue}, ${sat}%, ${bri}%, 0.8)`);
    bodyGrad.addColorStop(1, `hsla(${hue + 20}, ${sat}%, ${bri - 5}%, 0.7)`);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Membrane outline
    ctx.strokeStyle = `hsla(${hue}, ${sat * 0.7}%, ${bri + 10}%, 0.3)`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // === Glow (bioluminescence) ===
    if (c.features.glow > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.5);
      glow.addColorStop(0, `hsla(${hue}, 80%, 60%, ${c.features.glow * 0.15 * (0.8 + Math.sin(this.time * 2) * 0.2)})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // === Spots (stage 2+) ===
    if (c.features.spots > 0) {
      const spotRng = c._rng(c.dna.bodyPlan * 10000);
      for (let i = 0; i < c.features.spots; i++) {
        const sa = spotRng() * Math.PI * 2;
        const sr = spotRng() * r * 0.5;
        const ss = 2 + spotRng() * 3;
        ctx.beginPath();
        ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, ss, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue + 30}, ${sat}%, ${bri + 15}%, 0.3)`;
        ctx.fill();
      }
    }

    // === Eye(s) ===
    if (c.features.eyeSize > 0) {
      const eyeS = c.features.eyeSize * 4 + 2;
      const eyeCount = c.stage >= 3 ? Math.ceil(c.dna.eyeGenes * 3) + 1 : 1;
      const eyeSpread = r * 0.3;

      for (let i = 0; i < eyeCount; i++) {
        let ex, ey;
        if (eyeCount === 1) {
          ex = r * 0.2; ey = -r * 0.2;
        } else {
          const ea = -0.3 + (i / (eyeCount - 1)) * 0.6;
          ex = r * 0.3; ey = ea * eyeSpread - r * 0.1;
        }

        // Eye white
        ctx.beginPath();
        ctx.ellipse(ex, ey, eyeS, c.blinking ? 0.5 : eyeS * 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Pupil (follows mouse)
        if (!c.blinking) {
          const lookX = this.mouseIn ? (this.mouseX - c.x) * 2 : Math.sin(this.time * 0.3);
          const lookY = this.mouseIn ? (this.mouseY - c.y) * 2 : 0;
          ctx.beginPath();
          ctx.arc(ex + lookX * 1.5, ey + lookY * 1.5, eyeS * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${hue + 120}, 80%, 55%)`;
          ctx.fill();
        }
      }
    } else {
      // Stage 1: just an eye spot (light-sensitive dot)
      ctx.beginPath();
      ctx.arc(r * 0.3, -r * 0.15, 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue + 120}, 60%, 40%, 0.5)`;
      ctx.fill();
    }

    // === Mouth ===
    if (c.features.mouthSize > 0) {
      const mw = c.features.mouthSize * 4 + 1;
      const mOpen = c.mouthOpen * 3;
      ctx.beginPath();
      if (c.expression === 'happy') {
        ctx.arc(r * 0.25, r * 0.15, mw, 0, Math.PI);
      } else if (c.expression === 'surprised') {
        ctx.ellipse(r * 0.25, r * 0.15, mw * 0.5, mw * 0.5 + mOpen, 0, 0, Math.PI * 2);
      } else {
        ctx.moveTo(r * 0.25 - mw, r * 0.15);
        ctx.lineTo(r * 0.25 + mw, r * 0.15);
      }
      ctx.strokeStyle = `hsla(${hue + 180}, 40%, 30%, 0.5)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // === Limbs (stage 3+) ===
    if (c.features.limbCount > 0 && c.features.limbLength > 0) {
      const limbLen = c.features.limbLength * r * 0.8;
      for (let i = 0; i < c.features.limbCount; i++) {
        const la = (i / c.features.limbCount) * Math.PI + Math.PI * 0.5;
        const lx = Math.cos(la) * r * 0.8;
        const ly = Math.sin(la) * r * 0.5;
        const wave = Math.sin(this.time * 3 + i * 1.5) * 5;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + wave, ly + limbLen * 0.5, lx + wave * 0.5, ly + limbLen);
        ctx.strokeStyle = `hsla(${hue}, ${sat * 0.6}%, ${bri}%, 0.5)`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // === Tail (stage 3+) ===
    if (c.features.tailLength > 0) {
      const tl = c.features.tailLength * r * 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, 0);
      const tw = Math.sin(this.time * 4) * 8;
      ctx.quadraticCurveTo(-r - tl * 0.5 + tw, -tl * 0.2, -r - tl + tw * 1.5, tw * 0.3);
      ctx.strokeStyle = `hsla(${hue}, ${sat * 0.5}%, ${bri}%, 0.4)`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();

    // === Sleep ZZZ ===
    if (c.state === 'sleeping') {
      for (let i = 0; i < 3; i++) {
        const zx = cx + 10 + i * 6;
        const zy = cy - r - 8 - i * 8 + Math.sin(this.time * 2 + i) * 3;
        ctx.font = `${8 + i * 3}px Rajdhani`;
        ctx.fillStyle = `rgba(150, 180, 220, ${0.4 - i * 0.1})`;
        ctx.fillText('z', zx, zy);
      }
    }

    // === Expression particles ===
    if (c.expression === 'happy' && c.expressionTimer > 0) {
      for (let i = 0; i < 3; i++) {
        const hx = cx + (Math.random() - 0.5) * r * 2;
        const hy = cy - r - Math.random() * 10;
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(255, 200, 200, 0.5)';
        ctx.fillText('♥', hx, hy);
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { Terrarium };
