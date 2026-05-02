/**
 * CreatureSkeleton — renders creature at all stages.
 *
 * Stage 1: Glowing embryo inside translucent egg
 * Stage 2: Forming shape inside egg, head visible
 * Stage 3+: Physics ragdoll rendered as capsules/spheres
 */

const CANNON = require('cannon-es');

class CreatureSkeleton {
  constructor() {
    this.group = null;
    this.meshes = [];   // { mesh, body }
    this.built = false;
    this._time = 0;
    this._stage = 1;
    this._eggShell = null;
    this._embryo = null;
    this._particles = [];
    this._skinMeshes = [];  // { mesh, body } for sphere-cluster skin
    this._skinGroup = null;
    this._boneGroup = null;
    this.showBones = false; // debug toggle
  }

  /**
   * Build incubation visual for stages 1-2.
   * Stage 1: small glowing sphere pulsing inside a translucent egg
   * Stage 2: elongated form with head bump, egg starting to crack
   */
  buildIncubation(T, dna, stage) {
    this.dispose();
    this.group = new T.Group();
    this._stage = stage;

    const hue = (dna.hue || 0.33) * 360;
    const sat = (dna.saturation || 0.6) * 100;
    const creatureColor = new T.Color(`hsl(${hue}, ${sat}%, 60%)`);
    const glowColor = new T.Color(`hsl(${hue}, ${sat}%, 80%)`);

    // Egg shell
    const eggR = stage === 1 ? 0.18 : 0.22;
    const eggGeo = new T.SphereGeometry(eggR, 24, 16);
    // Squash vertically for egg shape
    eggGeo.scale(0.85, 1.1, 0.85);
    const eggMat = new T.MeshPhysicalMaterial({
      color: 0xd0d8e0,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.6,
      thickness: 0.05,
    });
    this._eggShell = new T.Mesh(eggGeo, eggMat);
    this._eggShell.position.y = eggR * 1.1;
    this.group.add(this._eggShell);

    // Embryo inside
    if (stage === 1) {
      // Small glowing orb
      const embryoGeo = new T.SphereGeometry(0.06, 12, 8);
      const embryoMat = new T.MeshStandardMaterial({
        color: creatureColor,
        emissive: glowColor,
        emissiveIntensity: 0.5,
        roughness: 0.3,
      });
      this._embryo = new T.Mesh(embryoGeo, embryoMat);
      this._embryo.position.y = eggR * 1.0;
      this.group.add(this._embryo);
    } else {
      // Stage 2: forming body — head blob + body blob
      const bodyGroup = new T.Group();
      bodyGroup.position.y = eggR * 0.95;

      // Body
      const bodyGeo = new T.SphereGeometry(0.07, 12, 8);
      bodyGeo.scale(1, 1.3, 0.9);
      const bodyMat = new T.MeshStandardMaterial({
        color: creatureColor,
        emissive: glowColor,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      });
      const body = new T.Mesh(bodyGeo, bodyMat);
      bodyGroup.add(body);

      // Head bump
      const headGeo = new T.SphereGeometry(0.055, 12, 8);
      const headMat = new T.MeshStandardMaterial({
        color: creatureColor,
        emissive: glowColor,
        emissiveIntensity: 0.4,
        roughness: 0.3,
      });
      const head = new T.Mesh(headGeo, headMat);
      head.position.y = 0.09;
      bodyGroup.add(head);

      // Tiny limb nubs
      for (let side = -1; side <= 1; side += 2) {
        const nubGeo = new T.SphereGeometry(0.02, 8, 6);
        const nub = new T.Mesh(nubGeo, bodyMat);
        nub.position.set(side * 0.06, -0.03, 0);
        bodyGroup.add(nub);
      }

      this._embryo = bodyGroup;
      this.group.add(bodyGroup);
    }

    // Floating particles inside egg
    const particleMat = new T.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 8; i++) {
      const pGeo = new T.SphereGeometry(0.008, 4, 4);
      const p = new T.Mesh(pGeo, particleMat);
      const angle = (i / 8) * Math.PI * 2;
      const r = 0.06 + Math.random() * 0.06;
      p.position.set(Math.cos(angle) * r, eggR * 1.0 + (Math.random() - 0.5) * 0.1, Math.sin(angle) * r);
      p.userData = { angle, r, speed: 0.5 + Math.random(), yBase: p.position.y };
      this.group.add(p);
      this._particles.push(p);
    }

    this.built = true;
    return this.group;
  }

  /** Animate incubation (call each frame). */
  animateIncubation(dt) {
    this._time += dt;
    const t = this._time;

    // Embryo pulse
    if (this._embryo) {
      const pulse = 1 + Math.sin(t * 2) * 0.05;
      this._embryo.scale.set(pulse, pulse, pulse);
      // Gentle float
      if (this._embryo.position) {
        this._embryo.position.y += Math.sin(t * 1.5) * 0.0003;
      }
    }

    // Egg shell subtle rotation
    if (this._eggShell) {
      this._eggShell.rotation.y = Math.sin(t * 0.3) * 0.05;
    }

    // Particles orbit
    for (const p of this._particles) {
      const d = p.userData;
      const a = d.angle + t * d.speed * 0.5;
      p.position.x = Math.cos(a) * d.r;
      p.position.z = Math.sin(a) * d.r;
      p.position.y = d.yBase + Math.sin(t * d.speed + d.angle) * 0.03;
    }
  }

  /**
   * Build creature visuals from a CreatureBody (stages 3-4).
   * Stage 3 (baby): blobby sphere-cluster — just hatched, still forming.
   * Stage 4 (adult): skeleton bones — fully defined creature.
   */
  build(T, creatureBody, dna, stage) {
    this.dispose();
    this.group = new T.Group();
    this.meshes = [];
    this._bones = [];
    this._skinMeshes = [];
    this._stage = stage;

    if (stage <= 3) {
      // Baby: blobby sphere-cluster skin (embryo becoming creature)
      this._buildSkin(T, creatureBody, dna, stage);
      this._skinGroup.visible = true;
    } else {
      // Adult: defined skeleton with bones
      this._buildBones(T, creatureBody, dna);
      this._boneGroup.visible = true;
    }

    this.built = true;
    return this.group;
  }

  /**
   * Sphere-cluster skin: each physics body gets a soft sphere 1.3x physics size.
   * Overlapping spheres naturally blend into a blobby creature shape.
   * Head gets 1.5x with simple dot eyes. Stage 3 = puffy, Stage 4 = more defined.
   */
  _buildSkin(T, creatureBody, dna, stage) {
    this._skinGroup = new T.Group();
    this.group.add(this._skinGroup);

    const hue = (dna.hue || 0.33) * 360;
    const sat = (dna.saturation || 0.6) * 100;
    const light = stage <= 3 ? 62 : 55;

    const bodyColor = new T.Color(`hsl(${hue}, ${sat}%, ${light}%)`);
    const headColor = new T.Color(`hsl(${hue}, ${Math.min(100, sat + 10)}%, ${light + 5}%)`);
    const bellyColor = new T.Color(`hsl(${hue}, ${Math.max(15, sat - 15)}%, ${light + 10}%)`);
    const glowColor = new T.Color(`hsl(${hue}, ${sat}%, 80%)`);

    // Organic material — slight subsurface look
    const skinMat = new T.MeshPhysicalMaterial({
      color: bodyColor,
      roughness: stage <= 3 ? 0.6 : 0.5,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
    });
    const headMat = new T.MeshPhysicalMaterial({
      color: headColor,
      roughness: stage <= 3 ? 0.55 : 0.45,
      metalness: 0.02,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      emissive: glowColor,
      emissiveIntensity: stage <= 3 ? 0.08 : 0.03,
    });

    const bodies = creatureBody.bodies;
    const spineMotorCount = creatureBody.motorJoints.length - creatureBody.groundContacts.length * 2;
    const spineCount = Math.max(1, spineMotorCount + 1);

    // Scale factors: baby = puffy (1.5x), adult = tighter (1.3x)
    const skinScale = stage <= 3 ? 1.5 : 1.3;
    const headSkinScale = stage <= 3 ? 1.8 : 1.5;

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const shape = body.shapes[0];
      const he = shape.halfExtents;
      const isHead = (i === 0);
      const isSpine = (i > 0 && i < spineCount);

      // Sphere radius based on physics body size
      let r;
      if (isHead) {
        r = Math.max(he.x, he.y, he.z) * headSkinScale;
      } else if (isSpine) {
        r = Math.max(he.x, he.y, he.z) * skinScale;
      } else {
        // Limb segments: slightly smaller spheres
        r = Math.max(he.x, he.z) * skinScale * 1.5;
      }

      const geo = new T.SphereGeometry(r, 12, 10);
      const mat = isHead ? headMat : skinMat;
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true;
      this._skinGroup.add(mesh);
      this._skinMeshes.push({ mesh, body });

      // Head: add dot eyes
      if (isHead) {
        const eyeR = r * 0.18;
        const eyeGeo = new T.SphereGeometry(eyeR, 8, 6);
        const eyeMat = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
        const pupilGeo = new T.SphereGeometry(eyeR * 0.5, 6, 4);
        const pupilMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.3 });

        for (let side = -1; side <= 1; side += 2) {
          const eye = new T.Mesh(eyeGeo, eyeMat);
          eye.position.set(r * 0.5, r * 0.25, side * r * 0.4);
          mesh.add(eye);

          const pupil = new T.Mesh(pupilGeo, pupilMat);
          pupil.position.set(eyeR * 0.4, 0, 0);
          eye.add(pupil);
        }
      }
    }
  }

  /**
   * Bone debug renderer: thin cylinders + joint dots (original skeleton view).
   */
  _buildBones(T, creatureBody, dna) {
    this._boneGroup = new T.Group();
    this.group.add(this._boneGroup);

    const hue = (dna.hue || 0.33) * 360;
    const sat = (dna.saturation || 0.6) * 100;

    const boneColor = new T.Color(`hsl(${hue}, ${Math.max(10, sat * 0.3)}%, 75%)`);
    const jointColor = new T.Color(`hsl(${hue}, ${sat}%, 55%)`);
    const headColor = new T.Color(`hsl(${hue}, ${Math.min(100, sat + 10)}%, 65%)`);

    const boneMat = new T.MeshStandardMaterial({ color: boneColor, roughness: 0.4, metalness: 0.15 });
    const jointMat = new T.MeshStandardMaterial({ color: jointColor, roughness: 0.3, metalness: 0.1 });
    const headMat = new T.MeshStandardMaterial({ color: headColor, roughness: 0.3, metalness: 0.1 });

    const bodies = creatureBody.bodies;
    const spineMotorCount = creatureBody.motorJoints.length - creatureBody.groundContacts.length * 2;
    const spineCount = Math.max(1, spineMotorCount + 1);

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const shape = body.shapes[0];
      const isHead = (i === 0);
      const isSpine = (i > 0 && i < spineCount);

      let geo, mat;
      if (isHead) {
        const he = shape.halfExtents;
        const headR = Math.max(he.x, he.y, he.z);
        geo = new T.SphereGeometry(headR, 16, 12);
        mat = headMat;
      } else if (isSpine) {
        const he = shape.halfExtents;
        geo = new T.BoxGeometry(he.x * 2, he.y * 2, he.z * 2);
        mat = jointMat;
      } else {
        const he = shape.halfExtents;
        geo = new T.CapsuleGeometry(Math.min(he.x, he.z), he.y * 2, 4, 8);
        mat = jointMat;
      }

      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true;
      this._boneGroup.add(mesh);
      this.meshes.push({ mesh, body });
    }

    const boneGeo = new T.CylinderGeometry(0.012, 0.008, 1, 6, 1);
    boneGeo.translate(0, 0.5, 0);
    boneGeo.rotateX(Math.PI / 2);

    for (const joint of creatureBody.joints) {
      const mesh = new T.Mesh(boneGeo, boneMat);
      mesh.castShadow = true;
      this._boneGroup.add(mesh);
      this._bones.push({ mesh, bodyA: joint.bodyA, bodyB: joint.bodyB });
    }
  }

  /** Toggle between skin and bone debug view. */
  toggleBones() {
    this.showBones = !this.showBones;
    if (this._skinGroup) this._skinGroup.visible = !this.showBones;
    if (this._boneGroup) this._boneGroup.visible = this.showBones;
  }

  /** Build replay meshes from frame data. Joint spheres + bones between consecutive parts. */
  buildFromReplay(T, frameData, dna) {
    this.dispose();
    this.group = new T.Group();
    this.meshes = [];
    this._replayBones = [];
    if (!frameData || frameData.length === 0) return this.group;

    const hue = (dna.hue || 0.33) * 360;
    const sat = (dna.saturation || 0.6) * 100;

    const boneColor = new T.Color(`hsl(${hue}, ${Math.max(10, sat * 0.3)}%, 75%)`);
    const jointColor = new T.Color(`hsl(${hue}, ${sat}%, 55%)`);
    const headColor = new T.Color(`hsl(${hue}, ${Math.min(100, sat + 10)}%, 65%)`);
    const boneMat = new T.MeshStandardMaterial({ color: boneColor, roughness: 0.4, metalness: 0.15 });
    const jointMat = new T.MeshStandardMaterial({ color: jointColor, roughness: 0.3, metalness: 0.1 });

    // Joint spheres
    for (let i = 0; i < frameData.length; i++) {
      const part = frameData[i];
      const isHead = (i === 0 && part.shape === 'sphere');
      const r = part.shape === 'sphere'
        ? (isHead ? part.size.r : part.size.r * 0.5)
        : 0.015;
      const geo = new T.SphereGeometry(r, 8, 6);
      const mat = isHead ? new T.MeshStandardMaterial({ color: headColor, roughness: 0.3, metalness: 0.1 }) : jointMat;
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.meshes.push({ mesh, body: null });
    }

    // Bone cylinders: connect spine segments (consecutive spheres) and limbs to their parent
    // For replay we approximate: draw bones between bodies that are close in the first frame
    const boneGeo = new T.CylinderGeometry(0.012, 0.008, 1, 6, 1);
    boneGeo.translate(0, 0.5, 0);
    boneGeo.rotateX(Math.PI / 2);

    // Build connectivity from first frame positions (closest neighbor heuristic)
    const positions = frameData.map(p => p.pos);
    const connected = new Set();
    for (let i = 0; i < positions.length; i++) {
      // Find nearest unconnected neighbor
      let bestJ = -1, bestDist = 0.5; // max bone length
      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        const key = Math.min(i, j) + ',' + Math.max(i, j);
        if (connected.has(key)) continue;
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dz = positions[i].z - positions[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < bestDist) { bestDist = dist; bestJ = j; }
      }
      if (bestJ >= 0) {
        const key = Math.min(i, bestJ) + ',' + Math.max(i, bestJ);
        connected.add(key);
        const mesh = new T.Mesh(boneGeo, boneMat);
        mesh.castShadow = true;
        this.group.add(mesh);
        this._replayBones.push({ mesh, idxA: i, idxB: bestJ });
      }
    }

    this.built = true;
    return this.group;
  }

  applyFrame(frame) {
    // Joint spheres
    for (let i = 0; i < this.meshes.length && i < frame.length; i++) {
      const { mesh } = this.meshes[i];
      const part = frame[i];
      mesh.position.set(part.pos.x, part.pos.y, part.pos.z);
      mesh.quaternion.set(part.quat.x, part.quat.y, part.quat.z, part.quat.w);
    }
    // Replay bones
    if (this._replayBones) {
      for (const { mesh, idxA, idxB } of this._replayBones) {
        if (idxA >= frame.length || idxB >= frame.length) continue;
        const a = frame[idxA].pos, b = frame[idxB].pos;
        mesh.position.set(a.x, a.y, a.z);
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0.001) {
          mesh.lookAt(b.x, b.y, b.z);
          mesh.scale.set(1, 1, dist);
        }
      }
    }
  }

  sync() {
    // Update skin sphere positions
    for (const { mesh, body } of this._skinMeshes) {
      if (!body) continue;
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }

    // Update bone debug positions
    for (const { mesh, body } of this.meshes) {
      if (!body) continue;
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }

    // Update bone cylinders: stretch between connected bodies
    if (this._bones) {
      for (const { mesh, bodyA, bodyB } of this._bones) {
        if (!bodyA || !bodyB) continue;
        const ax = bodyA.position.x, ay = bodyA.position.y, az = bodyA.position.z;
        const bx = bodyB.position.x, by = bodyB.position.y, bz = bodyB.position.z;

        mesh.position.set(ax, ay, az);

        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0.001) {
          mesh.lookAt(bx, by, bz);
          mesh.scale.set(1, 1, dist);
        }
      }
    }
  }

  dispose() {
    if (this.group) {
      while (this.group.children.length > 0) {
        const c = this.group.children[0];
        this.group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
    this.meshes = [];
    this._bones = [];
    this._skinMeshes = [];
    this._skinGroup = null;
    this._boneGroup = null;
    this._particles = [];
    this._eggShell = null;
    this._embryo = null;
    this.built = false;
  }
}

if (typeof module !== 'undefined') module.exports = { CreatureSkeleton };
