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

    // Breathing animation
    const breathe = 1 + Math.sin(this.time * 2) * 0.03;
    const bob = Math.sin(this.time * 1.5) * 3;
    const scale = v.size * breathe;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(scale, scale);

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
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = 40 + Math.sin(a * 3 + this.time * 2) * 5 + Math.sin(a * 5 + this.time) * 3;
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
    for (let layer = 3; layer >= 0; layer--) {
      ctx.beginPath();
      const r = 25 + layer * 8;
      const topOffset = -15 - layer * 10 + Math.sin(this.time * 5 + layer) * 8;
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

      // Pupil
      if (!this.blinking) {
        ctx.beginPath();
        ctx.arc(ex + 1, ey - 1, eyeSize * 0.4, 0, Math.PI * 2);
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
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
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
}

// Export for Node/Electron
if (typeof module !== 'undefined') module.exports = { CreatureRenderer };
