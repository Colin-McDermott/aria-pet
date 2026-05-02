/**
 * World3D — stripped scene: ground + lighting + creature skeleton + orbit camera.
 *
 * Runs cannon-es physics world for the creature in the terrarium.
 * Motor genome (from gym training) drives joint motors.
 * Manual orbit controls: drag to rotate, scroll to zoom.
 */

const CANNON = require('cannon-es');
const { CreatureBody } = require('../training/creature-body');
const { CreatureSkeleton } = require('./creature-skeleton');
const { CPGController } = require('../training/cpg');

class World3D {
  constructor(container) {
    this.container = container;
    this.active = false;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.stage = 1;

    // Physics
    this.physicsWorld = null;
    this.creatureBody = null;

    // Visuals
    this.skeleton = null;

    // Motor CPG (trained in gym)
    this.motorCPG = null;
    this._cpgTime = 0;

    // Environment
    this._envTime = 0;        // accumulated time for day/night
    this._timeOfDay = 0.5;    // 0=midnight, 0.5=noon, 1=midnight
    this._keyLight = null;
    this._ambientLight = null;
    this._fireflies = [];
    this._plants = [];

    // Stage transition
    this._transitioning = false;
    this._transitionTime = 0;
    this._transitionDuration = 2.0;
    this._transitionOldGroup = null;
    this._transitionGlow = null;

    // Orbit camera state
    this._isDragging = false;
    this._prevMouse = { x: 0, y: 0 };
    this._orbitAngle = 0;
    this._orbitPitch = 0.35;
    this._orbitDist = 3;
    this._orbitTarget = { x: 0, y: 0.5, z: 0 };

    // Gym replay
    this._gymMode = false;
    this._replaySkeleton = null;
    this._replayFrames = null;
    this._replayIndex = 0;
    this._replayTimer = 0;
  }

  init(width, height) {
    const T = window.THREE;
    if (!T) return false;

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x0a0e14);

    // Camera
    this.camera = new T.PerspectiveCamera(50, width / height, 0.01, 100);
    this._updateCamera();

    // Renderer
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0e14, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '0';
    this.renderer.domElement.id = 'world-canvas';
    this.container.appendChild(this.renderer.domElement);

    // Lighting — stored for day/night cycle
    this._ambientLight = new T.AmbientLight(0x445566, 0.8);
    this.scene.add(this._ambientLight);
    this._keyLight = new T.DirectionalLight(0xccddee, 1.0);
    this._keyLight.position.set(3, 5, 4);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.width = 1024;
    this._keyLight.shadow.mapSize.height = 1024;
    this.scene.add(this._keyLight);
    const fill = new T.PointLight(0x667788, 0.4, 10);
    fill.position.set(-2, 2, 3);
    this.scene.add(fill);

    // Ground — gradient earth tones
    const groundGeo = new T.PlaneGeometry(20, 20, 1, 1);
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 256; groundCanvas.height = 256;
    const gctx = groundCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, '#2a261e');   // warm center
    grad.addColorStop(0.5, '#1e1c18'); // mid earth
    grad.addColorStop(1, '#141310');   // dark edges
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 256, 256);
    const groundTex = new T.CanvasTexture(groundCanvas);
    const groundMat = new T.MeshStandardMaterial({ map: groundTex, roughness: 0.92 });
    const ground = new T.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Subtle grid (dimmer than before)
    const grid = new T.GridHelper(10, 20, 0x1a1e14, 0x131510);
    grid.position.y = 0.001;
    this.scene.add(grid);

    // Ambient firefly particles
    this._buildFireflies(T);

    // Small procedural plants at edges
    this._buildPlants(T);

    // Orbit controls
    this._setupOrbitControls();

    this.active = true;
    return true;
  }

  /**
   * Build creature physics body + visual skeleton.
   * @param {Object} dna - creature DNA
   * @param {number} stage - creature stage (1-4)
   */
  buildCreature(dna, stage) {
    if (!this.active) return;
    const T = window.THREE;
    this.stage = stage;

    // Clean up old creature
    if (this.skeleton) {
      if (this.skeleton.group?.parent) this.scene.remove(this.skeleton.group);
      this.skeleton.dispose();
    }
    this.skin = null;
    this.physicsWorld = null;
    this.creatureBody = null;

    // Stages 1-2: incubation (no physics, egg visual)
    if (stage <= 2) {
      this.skeleton = new CreatureSkeleton();
      this.skeleton.buildIncubation(T, dna, stage);
      this.scene.add(this.skeleton.group);
      this._orbitDist = 1.5; // zoom in on the egg
      this._orbitTarget = { x: 0, y: 0.25, z: 0 };
      return;
    }

    // Stage 3+: build physics ragdoll with stage-dependent proportions
    this.physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.creatureBody = new CreatureBody(dna);
    this.creatureBody.build(this.physicsWorld, stage);

    // Build visual skeleton
    this.skeleton = new CreatureSkeleton();
    const group = this.skeleton.build(T, this.creatureBody, dna, stage);
    if (group) this.scene.add(group);

    // Camera distance based on creature size
    this._orbitDist = stage === 3 ? 1.8 : 2.5;
  }

  /** Set the motor CPG for terrarium locomotion. */
  setMotorCPG(cpg) {
    this.motorCPG = cpg;
    this._cpgTime = 0;
  }

  /**
   * Step physics, apply motor control, sync visuals.
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    if (!this.active) return;

    // Gym replay mode
    if (this._gymMode && this._replayFrames) {
      this._replayTimer += dt;
      if (this._replayTimer >= 1 / 20) { // 20fps replay
        this._replayTimer = 0;
        if (this._replayIndex < this._replayFrames.length) {
          this._replaySkeleton.applyFrame(this._replayFrames[this._replayIndex]);
          this._replayIndex++;
        }
      }
      return;
    }

    // Terrarium physics
    if (this.physicsWorld && this.creatureBody) {
      // Drive joints from trained CPG
      if (this.motorCPG && this.creatureBody.motorJoints.length > 0) {
        this._cpgTime += dt;
        const speeds = this.motorCPG.getMotorSpeeds(this._cpgTime);
        this.creatureBody.applyMotors(Array.from(speeds));
      }

      this.physicsWorld.step(1 / 60, dt, 3);
      if (this.creatureBody) this.creatureBody.constrainZ();

      // Sync skeleton meshes to physics
      if (this.skeleton?.built) {
        this.skeleton.sync();
      }

      // Track creature for camera
      if (this.creatureBody.torso) {
        const pos = this.creatureBody.torso.position;
        this._orbitTarget.x += (pos.x - this._orbitTarget.x) * 0.05;
        this._orbitTarget.y += (Math.max(0.3, pos.y) - this._orbitTarget.y) * 0.05;
        this._orbitTarget.z += (pos.z - this._orbitTarget.z) * 0.05;
      }
    }

    // Incubation animation (stages 1-2)
    if (!this.physicsWorld && this.skeleton?.built) {
      this.skeleton.animateIncubation(dt);
    }

    // Environment updates
    this._envTime += dt;
    this._updateFireflies(dt);
    this._updateLighting();

    // Stage transition animation
    if (this._transitioning) {
      this._updateTransition(dt);
    }

    this._updateCamera();
  }

  render() {
    if (!this.active || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  // === Gym Mode ===

  /** Enter gym mode — hide terrarium creature, prepare for replay. */
  startGymMode() {
    this._gymMode = true;
    // Hide terrarium creature
    if (this.skeleton?.group) this.skeleton.group.visible = false;
    // Reset camera to fixed gym view
    this._orbitTarget = { x: 2, y: 0.8, z: 0 };
    this._orbitAngle = 0;
    this._orbitPitch = 0.3;
    this._orbitDist = 4;
  }

  /** Play a training replay in the gym view. */
  playReplay(frames, dna) {
    if (!frames || frames.length === 0) return;
    const T = window.THREE;

    // Clean up old replay
    if (this._replaySkeleton) {
      if (this._replaySkeleton.group?.parent) this.scene.remove(this._replaySkeleton.group);
      this._replaySkeleton.dispose();
    }

    this._replaySkeleton = new CreatureSkeleton();
    this._replaySkeleton.buildFromReplay(T, frames[0], dna);
    this.scene.add(this._replaySkeleton.group);

    this._replayFrames = frames;
    this._replayIndex = 0;
    this._replayTimer = 0;
  }

  /** End gym mode — return to terrarium. */
  endGymMode() {
    this._gymMode = false;

    // Clean up replay
    if (this._replaySkeleton) {
      if (this._replaySkeleton.group?.parent) this.scene.remove(this._replaySkeleton.group);
      this._replaySkeleton.dispose();
      this._replaySkeleton = null;
    }
    this._replayFrames = null;

    // Show terrarium creature
    if (this.skeleton?.group) this.skeleton.group.visible = true;

    // Reset camera
    this._orbitTarget = { x: 0, y: 0.5, z: 0 };
    this._orbitDist = 3;
  }

  /** Check if gym replay is done playing. */
  isReplayDone() {
    return !this._replayFrames || this._replayIndex >= this._replayFrames.length;
  }

  // === Stage Transitions ===

  /**
   * Transition creature to a new stage with animation.
   * @param {Object} dna
   * @param {number} oldStage
   * @param {number} newStage
   */
  transitionToStage(dna, oldStage, newStage) {
    if (!this.active) return;
    const T = window.THREE;

    // Save reference to old visual
    if (this.skeleton?.group) {
      this._transitionOldGroup = this.skeleton.group;
    }

    // Create glow pulse overlay
    const glowGeo = new T.SphereGeometry(0.5, 16, 12);
    const glowMat = new T.MeshBasicMaterial({
      color: new T.Color(`hsl(${(dna.hue || 0.33) * 360}, 70%, 70%)`),
      transparent: true,
      opacity: 0,
    });
    this._transitionGlow = new T.Mesh(glowGeo, glowMat);
    const torsoPos = this.creatureBody?.torso?.position;
    if (torsoPos) {
      this._transitionGlow.position.set(torsoPos.x, torsoPos.y, torsoPos.z);
    } else {
      this._transitionGlow.position.set(0, 0.3, 0);
    }
    this.scene.add(this._transitionGlow);

    this._transitioning = true;
    this._transitionTime = 0;
    this._transitionDuration = 2.0;
    this._transitionNewStage = newStage;
    this._transitionDna = dna;
    this._transitionOldStage = oldStage;
  }

  _updateTransition(dt) {
    this._transitionTime += dt;
    const T = window.THREE;
    const progress = Math.min(1, this._transitionTime / this._transitionDuration);

    // Phase 1 (0-0.4): glow builds, old fades
    // Phase 2 (0.4-0.6): peak glow, swap creature
    // Phase 3 (0.6-1.0): glow fades, new appears

    if (this._transitionGlow) {
      if (progress < 0.4) {
        // Glow builds
        this._transitionGlow.material.opacity = progress / 0.4 * 0.7;
        const pulse = 1 + progress / 0.4 * 0.5;
        this._transitionGlow.scale.set(pulse, pulse, pulse);
      } else if (progress < 0.6) {
        // Peak glow
        this._transitionGlow.material.opacity = 0.7;
        const pulse = 1.5 + Math.sin(progress * 20) * 0.1;
        this._transitionGlow.scale.set(pulse, pulse, pulse);
      } else {
        // Glow fades
        const fadeP = (progress - 0.6) / 0.4;
        this._transitionGlow.material.opacity = 0.7 * (1 - fadeP);
        const pulse = 1.5 * (1 - fadeP) + fadeP;
        this._transitionGlow.scale.set(pulse, pulse, pulse);
      }
    }

    // Fade out old creature
    if (this._transitionOldGroup && progress < 0.5) {
      const fadeOut = 1 - progress / 0.5;
      this._transitionOldGroup.traverse(c => {
        if (c.material && c.material.transparent !== undefined) {
          c.material.transparent = true;
          c.material.opacity = fadeOut;
        }
      });
    }

    // At midpoint: swap creature
    if (progress >= 0.5 && this._transitionOldGroup) {
      if (this._transitionOldGroup.parent) {
        this.scene.remove(this._transitionOldGroup);
      }
      this._transitionOldGroup = null;

      // Build new creature
      this.buildCreature(this._transitionDna, this._transitionNewStage);

      // Start new creature invisible, scale up
      if (this.skeleton?.group) {
        this.skeleton.group.scale.set(0.01, 0.01, 0.01);
      }
    }

    // Scale in new creature (0.5-1.0)
    if (progress >= 0.5 && this.skeleton?.group && !this._transitionOldGroup) {
      const scaleP = (progress - 0.5) / 0.5;
      const eased = 1 - Math.pow(1 - scaleP, 3); // ease-out cubic
      this.skeleton.group.scale.set(eased, eased, eased);
    }

    // Egg crack particles for stage 2→3
    if (this._transitionOldStage === 2 && progress >= 0.35 && progress < 0.4 && !this._eggCrackDone) {
      this._eggCrackDone = true;
      this._spawnEggParticles(T);
    }

    // Done
    if (progress >= 1) {
      this._transitioning = false;
      if (this._transitionGlow?.parent) {
        this.scene.remove(this._transitionGlow);
        this._transitionGlow.geometry.dispose();
        this._transitionGlow.material.dispose();
      }
      this._transitionGlow = null;
      this._eggCrackDone = false;
      if (this.skeleton?.group) {
        this.skeleton.group.scale.set(1, 1, 1);
      }
    }
  }

  _spawnEggParticles(T) {
    const center = this._transitionGlow?.position || { x: 0, y: 0.3, z: 0 };
    const shellMat = new T.MeshBasicMaterial({ color: 0xd0d8e0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 8; i++) {
      const geo = new T.PlaneGeometry(0.03 + Math.random() * 0.03, 0.03 + Math.random() * 0.03);
      const shard = new T.Mesh(geo, shellMat.clone());
      shard.position.set(center.x, center.y, center.z);
      const angle = (i / 8) * Math.PI * 2;
      shard.userData = {
        vx: Math.cos(angle) * (0.5 + Math.random() * 0.5),
        vy: 1 + Math.random() * 1.5,
        vz: Math.sin(angle) * (0.5 + Math.random() * 0.5),
        life: 1.0,
      };
      this.scene.add(shard);

      // Simple animation: move outward and fade over 1 second
      const animate = () => {
        const d = shard.userData;
        d.life -= 0.02;
        if (d.life <= 0) {
          this.scene.remove(shard);
          shard.geometry.dispose();
          shard.material.dispose();
          return;
        }
        d.vy -= 0.05; // gravity
        shard.position.x += d.vx * 0.016;
        shard.position.y += d.vy * 0.016;
        shard.position.z += d.vz * 0.016;
        shard.material.opacity = d.life;
        shard.rotation.x += 0.1;
        shard.rotation.z += 0.05;
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }

  // === Camera ===

  resize(w, h) {
    if (!this.active) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _updateCamera() {
    if (!this.camera) return;
    const t = this._orbitTarget;
    const d = this._orbitDist;
    const pitch = this._orbitPitch;
    const angle = this._orbitAngle;

    this.camera.position.set(
      t.x + d * Math.cos(pitch) * Math.sin(angle),
      t.y + d * Math.sin(pitch),
      t.z + d * Math.cos(pitch) * Math.cos(angle)
    );
    this.camera.lookAt(t.x, t.y, t.z);
  }

  // === Environment ===

  _buildFireflies(T) {
    const glowMat = new T.MeshBasicMaterial({ color: 0xeeff88, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 4; i++) {
      const geo = new T.SphereGeometry(0.015, 4, 4);
      const mesh = new T.Mesh(geo, glowMat.clone());
      const angle = (i / 4) * Math.PI * 2;
      const r = 1.5 + Math.random() * 2;
      mesh.position.set(Math.cos(angle) * r, 0.5 + Math.random() * 1.5, Math.sin(angle) * r);
      mesh.userData = {
        baseY: mesh.position.y, angle, r,
        speed: 0.2 + Math.random() * 0.3,
        bobSpeed: 1 + Math.random(),
        phase: Math.random() * Math.PI * 2,
      };
      this.scene.add(mesh);
      this._fireflies.push(mesh);
    }
  }

  _buildPlants(T) {
    const plantPositions = [
      { x: -2.5, z: -1.8 }, { x: 3.2, z: 2.1 }, { x: -1.8, z: 2.8 },
    ];
    for (const pos of plantPositions) {
      const plant = this._makeProceduralPlant(T);
      plant.position.set(pos.x, 0, pos.z);
      plant.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(plant);
      this._plants.push(plant);
    }
  }

  _makeProceduralPlant(T) {
    const group = new T.Group();
    const stemColor = new T.Color().setHSL(0.28, 0.4, 0.25);
    const leafColor = new T.Color().setHSL(0.3 + Math.random() * 0.1, 0.5, 0.3);

    // Stem
    const stemGeo = new T.CylinderGeometry(0.01, 0.015, 0.3, 5);
    const stemMat = new T.MeshStandardMaterial({ color: stemColor, roughness: 0.8 });
    const stem = new T.Mesh(stemGeo, stemMat);
    stem.position.y = 0.15;
    group.add(stem);

    // 3-4 leaf blades
    const leafCount = 3 + Math.floor(Math.random() * 2);
    const leafMat = new T.MeshStandardMaterial({ color: leafColor, roughness: 0.7, side: T.DoubleSide });
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + Math.random() * 0.3;
      const len = 0.08 + Math.random() * 0.1;
      const leafGeo = new T.PlaneGeometry(len, len * 0.4);
      const leaf = new T.Mesh(leafGeo, leafMat);
      leaf.position.set(Math.cos(angle) * 0.03, 0.25 + Math.random() * 0.08, Math.sin(angle) * 0.03);
      leaf.rotation.set(-0.5 + Math.random() * 0.3, angle, 0);
      group.add(leaf);
    }

    return group;
  }

  /** Update day/night cycle lighting based on timeOfDay (0-1). */
  setTimeOfDay(t) {
    this._timeOfDay = t;
  }

  _updateLighting() {
    if (!this._keyLight) return;
    const T = window.THREE;
    // t: 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk, 1=midnight
    const t = this._timeOfDay;
    const sunAngle = t * Math.PI * 2 - Math.PI / 2;

    // Sun intensity: peaks at noon, zero at night
    const sunIntensity = Math.max(0, Math.sin(sunAngle));
    this._keyLight.intensity = 0.2 + sunIntensity * 0.9;

    // Ambient: warmer at dawn/dusk, cool at night, neutral at noon
    const ambIntensity = 0.3 + sunIntensity * 0.5;
    this._ambientLight.intensity = ambIntensity;

    // Key light color: warm at dawn/dusk, cool-white at noon, blue at night
    if (sunIntensity > 0.1) {
      const warmth = 1 - sunIntensity; // more warm when sun is low
      const r = 0.8 + warmth * 0.2;
      const g = 0.75 + sunIntensity * 0.12;
      const b = 0.7 + sunIntensity * 0.2;
      this._keyLight.color.setRGB(r, g, b);
    } else {
      this._keyLight.color.setRGB(0.3, 0.35, 0.5);
    }

    // Background color shifts
    if (this.scene) {
      const bgR = 0.04 + sunIntensity * 0.02;
      const bgG = 0.05 + sunIntensity * 0.03;
      const bgB = 0.08 + sunIntensity * 0.02;
      this.scene.background = new T.Color(bgR, bgG, bgB);
    }

    // Firefly visibility: brighter at night
    const fireflyOpacity = Math.max(0.1, 1 - sunIntensity * 1.5);
    for (const f of this._fireflies) {
      f.material.opacity = fireflyOpacity * (0.4 + Math.sin(this._envTime * f.userData.bobSpeed + f.userData.phase) * 0.3);
    }
  }

  _updateFireflies(dt) {
    for (const f of this._fireflies) {
      const d = f.userData;
      const t = this._envTime;
      d.angle += d.speed * dt;
      f.position.x = Math.cos(d.angle) * d.r;
      f.position.z = Math.sin(d.angle) * d.r;
      f.position.y = d.baseY + Math.sin(t * d.bobSpeed + d.phase) * 0.3;
    }
  }

  _setupOrbitControls() {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this._isDragging = true;
        this._prevMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._prevMouse.x;
      const dy = e.clientY - this._prevMouse.y;
      this._orbitAngle -= dx * 0.008;
      this._orbitPitch = Math.max(0.05, Math.min(1.4, this._orbitPitch + dy * 0.008));
      this._prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { this._isDragging = false; });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._orbitDist = Math.max(1, Math.min(12, this._orbitDist + e.deltaY * 0.005));
    }, { passive: false });
  }

  dispose() {
    this.active = false;
    if (this.skeleton) this.skeleton.dispose();
    if (this._replaySkeleton) this._replaySkeleton.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode)
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

if (typeof module !== 'undefined') module.exports = { World3D };
