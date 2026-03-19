/**
 * Procedural Creature Renderer
 *
 * Draws the creature on a Canvas element. Every creature looks different
 * based on its species, traits, colors, and features.
 * Animated — breathing, blinking, aura effects, particles.
 */

class CreatureRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.creature = null;
    this.time = 0;
    this.blinkTimer = 0;
    this.blinking = false;
    this.particles = [];
    this.animating = false;

    // === Reactive inputs — these drive the animation ===
    this.inputs = {
      mouseX: 0,          // 0-1, mouse position relative to canvas
      mouseY: 0,
      mouseNear: false,    // is mouse hovering over creature
      cpu: 0,              // 0-100
      gpu: 0,              // 0-100
      gpuTemp: 0,          // celsius
      ram: 0,              // 0-100
      energy: 80,          // pet stat
      happiness: 70,
      bond: 50,
      mood: 'neutral',     // happy/sad/alert/tired/neutral
      typing: false,       // is user typing right now
      typingSpeed: 0,      // chars per second
      musicPlaying: false,
      timeOfDay: 12,       // hour 0-23
    };

    // === Mouse interaction ===
    this.pokeForce = 0;        // how hard it was just poked
    this.pokeAngle = 0;        // direction of poke
    this.squish = 0;           // squish from click
    this.dragOffset = { x: 0, y: 0 }; // displacement from dragging
    this.isDragging = false;
    this.isHovering = false;
    this.jiggle = 0;           // residual jiggle from poke
    this.mouseTrail = [];      // recent mouse positions for momentum

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      this.inputs.mouseX = mx;
      this.inputs.mouseY = my;
      this.inputs.mouseNear = true;
      this.isHovering = true;

      // Track mouse trail for momentum
      this.mouseTrail.push({ x: mx, y: my, t: Date.now() });
      if (this.mouseTrail.length > 10) this.mouseTrail.shift();

      // If dragging, move the creature
      if (this.isDragging) {
        this.dragOffset.x = (mx - 0.5) * 40;
        this.dragOffset.y = (my - 0.5) * 40;
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.inputs.mouseNear = false;
      this.isHovering = false;
      this.isDragging = false;
      // Snap back with jiggle
      this.jiggle = Math.abs(this.dragOffset.x) + Math.abs(this.dragOffset.y);
      this.dragOffset = { x: 0, y: 0 };
    });

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;

      // Check if clicking on the creature (center area)
      const dx = mx - 0.5, dy = my - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.35) {
        // Poke!
        this.pokeForce = 15;
        this.pokeAngle = Math.atan2(dy, dx);
        this.squish = 0.3;
        this.isDragging = true;

        // Poke callback
        if (this.onPoke) this.onPoke('poke');
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (this.isDragging) {
        // Calculate throw momentum from mouse trail
        const trail = this.mouseTrail;
        if (trail.length >= 2) {
          const last = trail[trail.length - 1];
          const prev = trail[trail.length - 2];
          const throwX = (last.x - prev.x) * 200;
          const throwY = (last.y - prev.y) * 200;
          this.jiggle = Math.abs(throwX) + Math.abs(throwY);
        }
        this.isDragging = false;
        // Snap back
        this.dragOffset = { x: 0, y: 0 };

        if (this.onPoke) this.onPoke('release');
      }
    });

    // Double-click = tickle
    canvas.addEventListener('dblclick', () => {
      this.pokeForce = 25;
      this.jiggle = 30;
      this.squish = 0.5;
      if (this.onPoke) this.onPoke('tickle');
    });

    // Poke callback — set from outside
    this.onPoke = null;
  }

  setCreature(creature) {
    this.creature = creature;
    this.particles = [];
    if (creature.visuals.hasParticles) {
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: 1 + Math.random() * 3,
          alpha: 0.3 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    if (!this.animating) {
      this.animating = true;
      this.animate();
    }
  }

  animate() {
    if (!this.creature) return;
    this.time += 0.03;
    this.blinkTimer += 0.03;

    // Random blink
    if (!this.blinking && Math.random() < 0.005) {
      this.blinking = true;
      setTimeout(() => this.blinking = false, 150);
    }

    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const v = this.creature.visuals;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Colors from creature data
    const primary = this.hsl(v.primaryHue, v.saturation, v.brightness);
    const secondary = this.hsl(v.secondaryHue, v.saturation, v.brightness + 0.1);
    const glow = this.hsl(v.primaryHue, v.saturation, v.brightness + 0.3);
    const eyeColor = this.hsl(v.secondaryHue, 0.9, 0.6);

    // === Reactive animation ===
    const inp = this.inputs;

    // Breathing — faster when CPU is high, slower when tired
    const breathSpeed = 2 + (inp.cpu / 100) * 3;
    const breathAmount = 0.02 + (inp.cpu / 100) * 0.03;
    const breathe = 1 + Math.sin(this.time * breathSpeed) * breathAmount;

    // Bobbing — more erratic when alert, calm when happy
    const bobSpeed = inp.mood === 'alert' ? 3 : inp.mood === 'happy' ? 1 : 1.5;
    const bobAmount = inp.mood === 'alert' ? 5 : 3;
    const bob = Math.sin(this.time * bobSpeed) * bobAmount;

    // Scale pulses with GPU temp
    const heatPulse = inp.gpuTemp > 70 ? Math.sin(this.time * 4) * 0.02 * (inp.gpuTemp - 70) / 30 : 0;
    const scale = v.size * breathe + heatPulse;

    // Eyes follow mouse
    this._eyeLookX = inp.mouseNear ? (inp.mouseX - 0.5) * 4 : Math.sin(this.time * 0.3) * 1;
    this._eyeLookY = inp.mouseNear ? (inp.mouseY - 0.5) * 3 : Math.cos(this.time * 0.2) * 0.5;

    // Color shift based on mood/stats
    this._moodGlow = inp.mood === 'happy' ? 0.15 : inp.mood === 'alert' ? -0.1 : inp.mood === 'sad' ? -0.05 : 0;

    // Particle speed scales with system activity
    this._particleSpeed = 0.5 + (inp.cpu / 100) * 2;

    // Wobble intensity from RAM usage
    this._wobble = 1 + (inp.ram / 100) * 0.5;

    // Time of day affects brightness
    const nightDim = (inp.timeOfDay >= 22 || inp.timeOfDay < 6) ? 0.7 : 1.0;

    // === Poke / drag / jiggle physics ===
    // Decay poke force
    this.pokeForce *= 0.85;
    this.squish *= 0.9;
    this.jiggle *= 0.92;

    // Poke displacement
    const pokeX = Math.cos(this.pokeAngle) * this.pokeForce;
    const pokeY = Math.sin(this.pokeAngle) * this.pokeForce;

    // Jiggle (residual wobble after poke/release)
    const jigX = Math.sin(this.time * 15) * this.jiggle * 0.3;
    const jigY = Math.cos(this.time * 12) * this.jiggle * 0.2;

    // Drag offset (creature follows mouse when dragged)
    const dragX = this.dragOffset.x;
    const dragY = this.dragOffset.y;

    // Squish (flatten on click, stretch on release)
    const squishX = 1 + this.squish * 0.3;
    const squishY = 1 - this.squish * 0.2;

    // Hover — creature leans toward mouse slightly
    const leanX = this.isHovering && !this.isDragging ? (inp.mouseX - 0.5) * 8 : 0;
    const leanY = this.isHovering && !this.isDragging ? (inp.mouseY - 0.5) * 5 : 0;

    ctx.save();
    ctx.translate(cx + pokeX + jigX + dragX + leanX, cy + bob + pokeY + jigY + dragY + leanY);
    ctx.scale(scale * squishX, scale * squishY);

    // === Draw Aura ===
    this.drawAura(ctx, v, glow);

    // === Draw Body ===
    switch (v.bodyType) {
      case 'blob': this.drawBlob(ctx, primary, secondary, v); break;
      case 'angular': this.drawCrystal(ctx, primary, secondary, v); break;
      case 'flame': this.drawFlame(ctx, primary, secondary, v); break;
      case 'jelly': this.drawJelly(ctx, primary, secondary, v); break;
      case 'mushroom': this.drawMushroom(ctx, primary, secondary, v); break;
      case 'mech': this.drawMech(ctx, primary, secondary, v); break;
      case 'shadow': this.drawShadow(ctx, primary, secondary, v); break;
      case 'star': this.drawStar(ctx, primary, secondary, v); break;
      default: this.drawBlob(ctx, primary, secondary, v);
    }

    // === Draw Eyes ===
    this.drawEyes(ctx, v, eyeColor);

    // === Draw Pattern ===
    if (v.hasPattern) this.drawPattern(ctx, v, secondary);

    ctx.restore();

    // === Draw Particles ===
    if (v.hasParticles) this.drawParticles(ctx, glow);
  }

  // === Body Types ===

  drawBlob(ctx, primary, secondary, v) {
    const wobble = this._wobble || 1;
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = 40 + Math.sin(a * 3 + this.time * 2) * 5 * wobble + Math.sin(a * 5 + this.time) * 3 * wobble;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, -10, 5, 0, 0, 45);
    grad.addColorStop(0, secondary);
    grad.addColorStop(1, primary);
    ctx.fillStyle = grad;
    ctx.fill();

    if (v.hasTendrils) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI + Math.PI * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 35, Math.sin(a) * 35);
        const wave = Math.sin(this.time * 3 + i) * 10;
        ctx.quadraticCurveTo(
          Math.cos(a) * 55 + wave, Math.sin(a) * 55,
          Math.cos(a) * 45 + wave * 1.5, Math.sin(a) * 70
        );
        ctx.strokeStyle = primary;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }

  drawCrystal(ctx, primary, secondary, v) {
    const sides = 5 + Math.floor(v.primaryHue * 4);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const r = 35 + (i % 2) * 10;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner crystal
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + 0.3;
      const r = 15 + (i % 2) * 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawFlame(ctx, primary, secondary, v) {
    const intensity = 1 + (this.inputs.cpu || 0) / 100; // flames grow with CPU
    for (let layer = 3; layer >= 0; layer--) {
      ctx.beginPath();
      const r = (25 + layer * 8) * intensity;
      const topOffset = (-15 - layer * 10) * intensity + Math.sin(this.time * 5 + layer) * 8 * intensity;
      ctx.moveTo(-r, 20);
      ctx.quadraticCurveTo(-r * 0.7, topOffset, 0, topOffset - 15);
      ctx.quadraticCurveTo(r * 0.7, topOffset, r, 20);
      ctx.quadraticCurveTo(0, 10, -r, 20);
      ctx.fillStyle = layer === 0 ? secondary : primary;
      ctx.globalAlpha = layer === 0 ? 1 : 0.3 + layer * 0.1;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawJelly(ctx, primary, secondary, v) {
    // Bell
    ctx.beginPath();
    ctx.arc(0, -10, 35, Math.PI, 0);
    ctx.quadraticCurveTo(30, 5, 0, 10);
    ctx.quadraticCurveTo(-30, 5, -35, -10);
    const grad = ctx.createRadialGradient(0, -15, 5, 0, -5, 40);
    grad.addColorStop(0, secondary);
    grad.addColorStop(1, primary);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Tentacles
    for (let i = 0; i < 5; i++) {
      const x = -20 + i * 10;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      const wave1 = Math.sin(this.time * 2 + i) * 8;
      const wave2 = Math.sin(this.time * 3 + i * 1.5) * 5;
      ctx.bezierCurveTo(x + wave1, 30, x - wave2, 50, x + wave1, 65);
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawMushroom(ctx, primary, secondary, v) {
    // Stalk
    ctx.fillStyle = secondary;
    ctx.fillRect(-8, 0, 16, 35);

    // Cap
    ctx.beginPath();
    ctx.ellipse(0, 0, 35, 22, 0, Math.PI, 0);
    ctx.fillStyle = primary;
    ctx.fill();

    // Spots
    for (let i = 0; i < 4; i++) {
      const x = -20 + i * 13;
      const y = -8 + Math.sin(i * 2) * 5;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMech(ctx, primary, secondary, v) {
    // Body
    ctx.fillStyle = primary;
    ctx.fillRect(-25, -20, 50, 40);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1;
    ctx.strokeRect(-25, -20, 50, 40);

    // Screen
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-18, -14, 36, 16);
    ctx.globalAlpha = 1;

    // Antenna
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0 + Math.sin(this.time * 3) * 3, -35);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(Math.sin(this.time * 3) * 3, -35, 3, 0, Math.PI * 2);
    ctx.fillStyle = secondary;
    ctx.fill();

    // Legs
    for (const side of [-1, 1]) {
      ctx.fillStyle = primary;
      ctx.fillRect(side * 15, 20, 8, 12);
    }
  }

  drawShadow(ctx, primary, secondary, v) {
    // Wispy shadow form
    for (let layer = 4; layer >= 0; layer--) {
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const noise = Math.sin(a * 3 + this.time * 2 + layer) * (5 + layer * 3);
        const r = 30 - layer * 3 + noise;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = primary;
      ctx.globalAlpha = 0.15 + layer * 0.05;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawStar(ctx, primary, secondary, v) {
    // Star with rays
    const points = 5;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 35 : 15;
      const pulse = i % 2 === 0 ? Math.sin(this.time * 3 + i) * 3 : 0;
      ctx.lineTo(Math.cos(a) * (r + pulse), Math.sin(a) * (r + pulse));
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 35);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, secondary);
    grad.addColorStop(1, primary);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // === Eyes ===

  drawEyes(ctx, v, eyeColor) {
    const count = v.eyeCount;
    const eyeSize = 5 - Math.min(count, 4);
    const spread = Math.min(count * 8, 30);

    for (let i = 0; i < count; i++) {
      let ex, ey;
      if (count <= 2) {
        ex = (i === 0 ? -1 : 1) * 10;
        ey = -5;
      } else {
        const angle = Math.PI + (Math.PI * i / (count - 1));
        ex = Math.cos(angle) * spread;
        ey = Math.sin(angle) * 8 - 5;
      }

      // Eye white
      ctx.beginPath();
      ctx.ellipse(ex, ey, eyeSize, this.blinking ? 1 : eyeSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();

      // Pupil — follows mouse or looks around
      if (!this.blinking) {
        const lookX = this._eyeLookX || 0;
        const lookY = this._eyeLookY || 0;
        ctx.beginPath();
        ctx.arc(ex + lookX, ey + lookY, eyeSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.fill();
      }
    }
  }

  // === Aura ===

  drawAura(ctx, v, glow) {
    const aura = this.creature.traits.aura.id;
    if (aura === 'none') return;

    if (aura === 'pulse') {
      const r = 55 + Math.sin(this.time * 3) * 10;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = glow;
      ctx.globalAlpha = 0.2 + Math.sin(this.time * 3) * 0.1;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (aura === 'sparkle') {
      for (let i = 0; i < 5; i++) {
        const a = this.time * 0.5 + i * 1.2;
        const r = 50 + Math.sin(a * 2) * 10;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.5 + Math.sin(a * 3) * 0.3;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (aura === 'orbit') {
      for (let i = 0; i < 3; i++) {
        const a = this.time + i * (Math.PI * 2 / 3);
        const x = Math.cos(a) * 55;
        const y = Math.sin(a) * 30;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    }

    if (aura === 'chromatic') {
      const r = 50;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      const grad = ctx.createConicGradient(this.time, 0, 0);
      grad.addColorStop(0, 'rgba(255,0,0,0.15)');
      grad.addColorStop(0.33, 'rgba(0,255,0,0.15)');
      grad.addColorStop(0.66, 'rgba(0,0,255,0.15)');
      grad.addColorStop(1, 'rgba(255,0,0,0.15)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (aura === 'divine') {
      // Halo
      ctx.beginPath();
      ctx.ellipse(0, -50, 25, 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(this.time * 2) * 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // === Pattern ===

  drawPattern(ctx, v, color) {
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.time * 0.2;
      const r1 = 15;
      const r2 = 30;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // === Particles ===

  drawParticles(ctx, color) {
    const speed = this._particleSpeed || 1;
    for (const p of this.particles) {
      p.x += p.vx * speed;
      p.y += p.vy * speed;
      p.alpha = 0.3 + Math.sin(this.time * 2 + p.phase) * 0.3;

      if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // === Helpers ===

  hsl(h, s, l) {
    return `hsl(${Math.floor(h * 360)}, ${Math.floor(s * 100)}%, ${Math.floor(l * 100)}%)`;
  }

  /**
   * Update reactive inputs. Call this from your game loop / system monitor.
   */
  updateInputs(data) {
    Object.assign(this.inputs, data);
  }
}

if (typeof module !== 'undefined') module.exports = { CreatureRenderer };
