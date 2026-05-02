# Research: Cute 3D Pet Creatures in Three.js/WebGL

## 1. What Makes Creatures Cute (The Science)

### Neoteny / Baby Schema
The scientific basis for cuteness is **neoteny** -- retention of juvenile features. Research identifies specific proportional triggers:

- **Large head-to-body ratio** (1:2 or 1:3, not the adult human 1:7)
- **Large eyes** positioned low on the face (more forehead = cuter)
- **Round, soft forms** -- circles and spheres, no sharp angles
- **Short limbs** relative to body
- **Small nose and mouth** positioned low
- **Soft, smooth surfaces** (no hard edges, spikes, or angular geometry)

These are hardwired responses -- humans find these proportions nurturing across species and even in inanimate objects.

### Five Styles of Cute (from research)
Studies identified distinct cuteness archetypes:
1. **Energetic cute** -- agile, long limbs, bouncy (Pikachu)
2. **Ridiculous cute** -- absurd proportions, humor-based (Psyduck, Slime Rancher slimes)
3. **Helpless cute** -- tiny, round, needs protection (Kirby)
4. **Elegant cute** -- graceful, pretty, slightly mature (Eevee evolutions)
5. **Cool cute** -- edgy but still appealing (Mewtwo, Absol)

### What Reads Well at Small Sizes (360x640)
From Pokemon's 30 years of design for tiny screens:
- **Silhouette is king** -- fill the creature solid black; if it's still recognizable, the design works
- **2-3 colors max** for the main body, plus accent
- **Exaggerated key features** -- if it has ears, make them BIG
- **Simple shapes with one unique element** -- a blob with a distinctive tail, horn, or marking
- **High contrast** between body color and eye/feature color
- **Test at 64x64 pixels** -- if it reads, it works at any size
- Pokemon sprites were designed at 32x32 and still recognizable

### What Makes Gacha/Collectible Creatures Appealing
- **Personality through design** -- each creature needs a "vibe" (shy, brave, silly)
- **Color as identity** -- each creature strongly associated with 1-2 colors
- **Rarity through visual complexity** -- common = simple, rare = more detail/effects
- **Emotional investment** -- backstory, personality quirks, growth potential
- **Display value** -- players want others to see their creatures

---

## 2. Successful Indie Creature Designs (Reference Games)

### Slime Rancher
- Creatures are simple spheres with faces
- Eyes are dots or simple lines; bean-shaped mouths
- Bold, vivid, saturated colors (alien but appealing)
- Personality comes entirely from face expression + bounce animation
- **Key lesson**: A sphere with eyes and good animation IS a creature

### Ooblets
- Small, plant-based creatures with 2-3 body segments
- Pastel color palette, very soft
- Each has a unique silhouette (leaf shape, flower type)
- Simple geometry, personality through idle animations
- **Key lesson**: Minimal geometry + strong silhouette + animation = character

### Bugsnax
- Food + bug mashups with immediately readable designs
- Strong shape language (strawberry body, pizza wings)
- 2-3 colors per creature, high saturation
- **Key lesson**: One strong concept per creature, not kitchen-sink design

### Pokemon Design Principles
- **Silhouette first** -- must be identifiable as a black shape
- **Shape hierarchy** -- primary shape (body) + secondary (head feature) + tertiary (details)
- **2-3 color limit** on main body, with complementary accent
- **One biological inspiration** + one elemental/concept inspiration
- **Evolution = additive complexity** -- add detail, don't redesign
- Designs work at 32x32 sprites up to billboard size
- **Key lesson**: Constraint creates recognizability. Fewer elements = more iconic.

### Temtem
- Anime-influenced, slightly more complex than Pokemon
- Stronger use of gradients and secondary colors
- Smooth organic forms, no hard edges on cute creatures
- **Key lesson**: Gradient color transitions add perceived quality cheaply

---

## 3. Three.js Rendering Approaches

### Polygon Budget
For a 360x640 Electron window with one primary creature:
- **500-2000 triangles** per creature is the sweet spot
- Low-poly with smooth shading looks better than high-poly at small sizes
- At this screen size, detail beyond ~2000 tris is invisible
- Keep total scene under 10k tris for consistent 60fps
- Smooth normals are more important than polygon count

### Material Approaches

#### MeshToonMaterial (Built-in)
- Simplest path to cartoon look
- Uses a gradient map texture to create discrete shading bands
- Set `gradientMap` texture with `NearestFilter` for crisp bands
- Supports color, emissive, normal maps
- **Limitation**: No outline, no custom rim lighting, limited control
- **Best for**: Quick prototyping, "good enough" toon look

#### Custom Toon Shader (Recommended)
A custom `ShaderMaterial` gives full control over the creature's look:

**Five visual layers for a cute creature shader:**
1. **Flat base color** -- uniform color per body region
2. **Core shadow** -- dot(normal, lightDir) with smoothstep for crisp cutoff
3. **Specular highlight** -- Blinn-Phong half-vector, pow() for glossiness (makes eyes/skin look alive)
4. **Rim lighting** -- `1.0 - dot(viewDir, normal)` for backlit glow (critical for "alive" feeling)
5. **Outline** -- inverted-hull method (scale mesh along normals, render backfaces only in black) or post-process

**Rim lighting shader core:**
```glsl
// Fragment shader
uniform vec3 rimColor;
uniform float rimPower;    // 1-10, higher = thinner rim
uniform float rimIntensity; // 0.5-2.0

float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition)));
rim = pow(rim, rimPower) * rimIntensity;
vec3 finalColor = baseColor + rimColor * rim;
```

#### Making a Blob Look Alive
- **Rim lighting** (Fresnel effect) -- edges glow, creates sense of translucency
- **Subsurface scattering** (fast SSS) -- light passes through, creature looks organic not plastic
- **Gentle vertex animation** -- breathing motion via sine wave on scale.y
- **Eye highlights** -- small white specular dot on eyes is critical for "life"
- **Subtle color shift** -- slightly warm on light side, cool on shadow side
- Three.js has a built-in fast SSS demo: `webgl_materials_subsurface_scattering.html`

### Outline Methods
1. **Inverted hull** -- duplicate mesh, scale outward along normals, flip face culling, render black. Simple, effective, ~2x geometry cost
2. **Post-process** -- render normals/depth to buffer, edge-detect with Sobel filter. Screen-space, consistent width, more GPU cost
3. **Shader-based** -- detect edges in fragment shader via normal discontinuity. No extra geometry, but less control

For a single creature in a small window, **inverted hull** is simplest and most effective.

---

## 4. Procedural Creature Variation

### Architecture: Constrained DNA System

The key insight from Spore, Pokemon, and research: **strongly regulated randomness produces meaningful variation; unguided randomness produces garbage.**

#### Body Generation Approach
Based on Spore's metaball system and Pudgy Pals:

```
DNA Parameters (all 0.0 - 1.0):
├── Body Shape
│   ├── bodyRoundness    -- sphere vs pill vs blob
│   ├── bodyWidth        -- thin vs wide
│   ├── bodyHeight       -- short vs tall
│   └── bodySegments     -- 1 (blob) to 3 (head+torso+base)
├── Head
│   ├── headSize         -- relative to body (0.3-0.6 of body, never smaller)
│   ├── headShape        -- round, oval, slightly angular
│   └── headPosition     -- how far above body
├── Features
│   ├── earType          -- none, round, pointed, floppy, long
│   ├── earSize          -- small to large
│   ├── tailType         -- none, stub, long, curly, fluffy
│   ├── tailSize         -- relative size
│   ├── hornType         -- none, small nub, single, pair
│   └── wingType         -- none, tiny decorative, bat-like, feathered
├── Face
│   ├── eyeSize          -- small dots to big round (0.5-1.0 range, never tiny)
│   ├── eyeShape         -- round, oval, angular
│   ├── eyeSpacing       -- close to wide
│   ├── mouthType        -- line, smile, bean, small circle
│   └── cheekMarks       -- none, blush circles, stripes
├── Limbs
│   ├── limbCount        -- 0, 2, 4 (constrained to even numbers)
│   ├── limbLength       -- stubby to medium (never long -- breaks cute)
│   └── limbThickness    -- thin to chunky
└── Colors (see Color System below)
```

**Critical constraints to maintain cuteness:**
- Head is ALWAYS at least 30% of body size (neoteny)
- Eyes are ALWAYS large relative to head (minimum 15% of head width)
- Limbs are ALWAYS short relative to body (max 40% of body height)
- Body is ALWAYS rounded (minimum roundness threshold)
- No sharp angles on body/head (angular features only on ears/horns)
- Mouth is ALWAYS small relative to face

### Color Palette Generation

**Never use random RGB.** Use HSL with harmonic constraints:

#### Algorithm: Creature Color from DNA
```
1. Pick base hue (0-360) from DNA
2. Pick saturation (50-85%) -- never desaturated, never neon
3. Pick lightness (45-70%) -- never dark, never washed out
4. Generate palette:
   - Primary: base HSL
   - Secondary: analogous (hue +/- 20-40 degrees), slightly lighter
   - Accent: complementary (hue + 150-210), higher saturation, used sparingly
   - Highlight: same hue, very light (85-95% lightness) for eye shine, belly
5. Apply constraints:
   - Belly/underside is always lighter than back
   - Eyes are always high-contrast against face
   - Markings use secondary or accent color, never primary
```

**Palette archetypes that always work:**
- Warm body + cool accent (orange creature, blue eyes)
- Pastel body + saturated accent (light pink body, deep red ear tips)
- Monochromatic + one pop color (all blues + gold horn)
- Earth tones + bright feature (brown body, green leaf ears)

### Feature Variation System
From Spore's approach -- use **modular parts from a library**, not pure procedural generation:

- Define 4-6 ear shapes as simple geometries (half-sphere, triangle, floppy curve, long cone)
- Define 3-4 tail shapes (stub sphere, cone, curl, fluffy cluster)
- Define 3-4 eye shapes (circle, oval, slightly angular)
- DNA selects which template + size/rotation parameters
- This keeps everything looking designed while allowing billions of combinations

**Spore's key insight**: Metaballs for organic body, pre-designed "rigblocks" for specific parts. The body adapts to parts, not the other way around. Spore used a DNA points budget (2000 points) to prevent over-complexity.

### Math: How Many Unique Creatures?
With the parameter space above:
- 5 ear types x 5 tail types x 4 eye shapes x 3 mouth types x 4 limb configs = 1,200 structural combos
- x 360 hue values x 3 saturation bands x 3 lightness bands = ~3.9 million visually distinct creatures
- x body shape variation = effectively infinite uniqueness

---

## 5. Creature Animation System

### Required Animations for Mini-Games

**Core set (must have):**
| Animation | Technique | Use |
|-----------|-----------|-----|
| Idle/breathe | Sine wave on scale.y (1.0 to 1.05) | Always playing |
| Bounce/walk | Sine on position.y + squash/stretch | Movement |
| Jump | Parabolic position.y + stretch up, squash on land | Platforming |
| Run | Faster bounce + lean forward (rotate.z) | Racing |
| Attack | Quick scale stretch toward target + snap back | Battle |
| Hurt | Flash red + bounce backward + brief flatten | Battle |
| Happy | Vertical bounce + scale pulse + spin | Win/reward |
| Sad | Droop (scale.y compress, lean forward) | Loss |
| Sleep | Gentle scale pulse (slow breathing) + eyes close (morph target) | Idle |
| Eat | Open mouth (morph target) + chomp motion | Feeding |

### Procedural Animation (No Hand-Animation Needed)

For a blob/simple creature, ALL animations can be procedural:

**Spring Physics System:**
```javascript
class SpringValue {
  value = 0;
  target = 0;
  velocity = 0;
  stiffness = 180;  // spring force
  damping = 12;     // friction

  update(dt) {
    const force = (this.target - this.value) * this.stiffness;
    this.velocity += force * dt;
    this.velocity *= Math.max(0, 1 - this.damping * dt);
    this.value += this.velocity * dt;
  }
}
```

Apply springs to: position.y (bounce), scale.x/y/z (squash/stretch), rotation (wobble), color (flash).

**Squash and Stretch (the most important animation principle for blobs):**
```javascript
// Conservation of volume: when Y stretches, X and Z compress
const stretchY = 1.0 + bounceAmount;
const squashXZ = 1.0 / Math.sqrt(stretchY); // preserve volume
creature.scale.set(squashXZ, stretchY, squashXZ);
```

**Emotion through deformation:**
- Happy: scale.y > 1, bouncy springs (high stiffness, low damping)
- Sad: scale.y < 1, droopy springs (low stiffness, high damping)
- Angry: slight lean forward, faster breathing, higher saturation color
- Scared: squash down, tremble (noise on position), big eyes (morph target)
- Sleepy: very slow scale pulse, eyes narrow (morph target)

### Three.js Animation System Integration

**For procedural animation (recommended for blobs):**
- No need for AnimationMixer/KeyframeTrack for simple creatures
- Update transforms directly in the render loop
- Use spring physics for all transitions (never lerp -- springs feel alive)

**For morph targets (face expressions):**
```javascript
// Define morph targets in geometry
const geometry = new THREE.SphereGeometry(1, 16, 12);
// Add morph target for "happy eyes" (squished vertically)
const happyPositions = new Float32Array(geometry.attributes.position.array.length);
// ... modify eye vertex positions ...
geometry.morphAttributes.position = [new THREE.BufferAttribute(happyPositions, 3)];

// Blend to expression
mesh.morphTargetInfluences[0] = 0.0; // neutral
mesh.morphTargetInfluences[0] = 1.0; // full happy
// Animate with spring for smooth transition
```

**For skeletal animation (if creatures get complex later):**
```javascript
// Create bones programmatically
const bones = [];
const rootBone = new THREE.Bone();
const bodyBone = new THREE.Bone();
rootBone.add(bodyBone);
// ... add limb bones ...

const skeleton = new THREE.Skeleton(bones);
const mesh = new THREE.SkinnedMesh(geometry, material);
mesh.add(rootBone);
mesh.bind(skeleton);

// Animate bones procedurally
bodyBone.rotation.x = Math.sin(time) * 0.1; // breathing
```

### react-spring/three for Spring Physics
If using React Three Fiber:
```javascript
import { useSpring, animated } from '@react-spring/three';

const { scale } = useSpring({
  scale: isHappy ? [1.1, 1.2, 1.1] : [1, 1, 1],
  config: { mass: 1, tension: 180, friction: 12 }
});

<animated.mesh scale={scale}>
  <sphereGeometry args={[1, 16, 12]} />
  <meshToonMaterial color="hotpink" />
</animated.mesh>
```

---

## 6. Mini-Game Genres for Small Windows

### Best Genres for 360x640 (Portrait)

| Genre | Example | Creature Stats Used | Complexity |
|-------|---------|-------------------|------------|
| **Endless Runner** | Creature runs, dodge/jump obstacles | Speed, reflexes | Low |
| **Rhythm/Timing** | Tap to music, creature dances | Intelligence, charm | Low |
| **Battle (turn-based)** | Rock-paper-scissors with stats | Attack, defense, HP | Medium |
| **Puzzle Match** | Match-3 or slide puzzle, creature helps | Intelligence, luck | Medium |
| **Racing** | Side-scroll or top-down race | Speed, stamina | Medium |
| **Feeding Frenzy** | Catch falling food, avoid bad items | Speed, metabolism | Low |
| **Obstacle Course** | Navigate platforms to goal | Agility, jump power | Medium |
| **Tug of War** | Tap rapidly, creature pulls rope | Strength, stamina | Low |

### How Stats Affect Gameplay

```
DNA Gene → Stat → Gameplay Effect
─────────────────────────────────
speed        → Move speed in runner/racer, dodge window in battle
bodySize     → HP pool in battle, hitbox size (bigger = easier to hit but more HP)
intelligence → Puzzle piece visibility, battle move selection AI assist
metabolism   → Stamina regen rate, how fast hunger depletes
aggression   → Attack power in battle, charge speed
resilience   → Defense in battle, recovery time after hit
senseRange   → Warning distance for obstacles, reveal hidden items
limbCount    → Jump height (more legs = higher), attack combo length
```

### Simplest Fun Mini-Games (Start Here)

**1. Dodge & Collect (easiest to implement)**
- Creature at bottom, move left/right
- Food falls from top (catch = points)
- Bad items fall too (hit = damage)
- Speed stat = movement speed, senseRange = see items earlier
- 10-30 second rounds

**2. Bounce Battle (simple but satisfying)**
- Two creatures face each other
- Tap to attack (creature bounces toward opponent)
- Timing matters (dodge by tapping at right moment)
- Stats determine damage, HP, dodge window
- Turn-based or real-time

**3. Rhythm Bounce (low dev effort, high charm)**
- Music plays, circles approach a hit zone
- Tap in time, creature bounces/dances
- Perfect timing = better score
- Intelligence stat = larger hit window
- Great for showing off creature animations

**4. Obstacle Runner (most replayable)**
- Side-scrolling, creature runs automatically
- Tap to jump, swipe to duck
- Obstacles get faster over time
- Speed = scroll speed (faster = higher score potential but harder)
- Agility = jump height/duration

### Neopets/Tamagotchi Mini-Game Lessons
- **Keep rounds SHORT** (30-90 seconds max)
- **Currency reward** for playing (feed back into pet care loop)
- **Stat bonuses** from playing (your creature gets better at games it plays often)
- **No punishment for losing** (losing = less reward, not negative)
- **Daily variety** -- different mini-game each day keeps it fresh

---

## 7. Existing Three.js Projects & References

### Direct References

| Project | What It Does | Useful For |
|---------|-------------|------------|
| [Pudgy Pals](https://github.com/nmagarino/Pudgy-Pals-Procedural-Creature-Generator) | Raymarched SDF procedural creatures with metaball spine, limbs, color | Architecture reference for procedural creature generation |
| [threejs-procedural-animal](https://github.com/bunnybones1/threejs-procedural-animal) | Rigged animal mesh generation for procedural animation | How to create a skeleton programmatically in Three.js |
| [cconsta1/tamagotchi](https://github.com/cconsta1/tamagotchi) | Three.js 3D virtual pet with animations | Integration pattern for Three.js + pet mechanics |
| [Fresnel Shader Material](https://github.com/otanodesignco/Fresnel-Shader-Material) | Rim lighting shader for Three.js | Drop-in rim glow for creature |
| [maya-ndljk/toon-shader](https://github.com/mayacoda/toon-shader) | Complete toon shader with shadow, specular, rim, outline | Full shader reference |
| [hujiulong/toon-shading](https://github.com/hujiulong/toon-shading) | Three.js toon shading implementation | Alternative toon approach |
| [Three Low Poly](https://github.com/jasonsturges/three-low-poly) | Low-poly procedural generation toolkit | Utility functions for procedural geometry |

### Three.js Built-in Examples to Study
- `webgl_morphtargets.html` -- morph target animation
- `webgl_morphtargets_face.html` -- facial expression morph targets
- `webgl_animation_skinning_morph.html` -- skinned mesh with morph targets
- `webgl_materials_subsurface_scattering.html` -- fast SSS for organic look
- MeshToonMaterial examples in docs

### Runevision's Procedural Creature Research
Extensive multi-year project on procedural creature generation and animation:
- Reduced from 503 low-level parameters to 106 meaningful high-level parameters
- Key finding: PCA/automated parametrization fails; humans must define meaningful parameters
- Uses gradient descent + SDF comparison to match creature silhouettes to references
- Procedural locomotion via IK system (no keyframe animation)
- Blog: https://blog.runevision.com/2025/01/procedural-creature-progress-2021-2024.html

---

## 8. Recommended Architecture for Aria

### Rendering Pipeline
```
DNA (genes 0-1)
  → BodyPlan (select parts, calculate proportions)
    → Geometry (build mesh from primitives: spheres, cylinders, morph targets)
      → Material (toon shader with rim lighting + outline)
        → Animation (spring-based procedural animation)
```

### Creature Construction Pipeline
```
1. BODY: Start with sphere/ellipsoid, deform based on bodyRoundness/Width/Height
2. HEAD: Add sphere on top, scale based on headSize, position based on headPosition
3. FEATURES: Attach ear/tail/horn geometries from template library, transform by DNA
4. FACE: Position eye meshes on head, set morph targets for expressions
5. LIMBS: If limbCount > 0, attach stub limbs at body sides
6. COLOR: Generate palette from DNA hue, apply to material uniforms
7. OUTLINE: Add inverted-hull outline mesh
8. ANIMATE: Attach spring controllers for idle breathing
```

### Material Stack (per creature)
```
1. Base toon shader (custom ShaderMaterial)
   - Flat color with 2-band shadow
   - Specular highlight (eyes especially)
   - Rim lighting (Fresnel glow)
2. Outline mesh (inverted hull, black MeshBasicMaterial, BackSide)
3. Eye material (separate, with strong specular for "life" dot)
4. Optional: emissive spots for bioluminescence (later evolution stages)
```

### Animation State Machine
```
IDLE → (user interaction) → HAPPY/SAD/ANGRY
IDLE → (mini-game start) → READY
READY → (game running) → RUN/JUMP/ATTACK/DODGE
any → (take damage) → HURT → previous
any → (win) → CELEBRATE
any → (lose) → SAD
any → (no interaction for 5min) → SLEEPY → SLEEP
```

Each state just sets spring targets for position, scale, rotation, morph targets. Springs handle all interpolation -- no keyframe animations needed for the basic creature.

---

## Summary: Fastest Path to a Cute, Playable Creature

1. **Start with a blob** (sphere geometry, ~500 tris, smooth normals)
2. **Add a custom toon shader** with rim lighting (makes it look alive immediately)
3. **Add eyes** (two small spheres with strong white specular dot)
4. **Add spring-based breathing** (scale.y oscillation, squash/stretch)
5. **Add morph targets** for 3 expressions (happy, sad, neutral)
6. **Generate color from DNA** using HSL harmony (not random RGB)
7. **Add ear/tail templates** selected by DNA (4-5 options each)
8. **Implement one mini-game** (dodge & collect is simplest)
9. **Connect DNA stats to gameplay** (speed gene = movement speed)
10. **Iterate on cuteness** -- big eyes, round shapes, bouncy animation

The creature will already be appealing at step 5. Everything after is polish and variety.

---

## Sources

- [Neotenic Design Principles](https://aciiid.com/what-is-neotenic-design/)
- [Cute Character Proportions Research](https://www.sciencedirect.com/science/article/pii/S1875952123000411)
- [Game Character Proportion Tips](https://blog.kongregate.com/design-tips-for-in-game-character-proportions/)
- [Cute Indie Game Art Inspiration](https://blog.unvale.io/taking-inspiration-from-the-cutest-games/)
- [Slime Rancher Concept Art](https://slimerancher.fandom.com/wiki/Concept_Art)
- [Pokemon Design Lessons (30 Years)](https://www.creativebloq.com/art/digital-art/what-artists-can-learn-from-30-years-of-pokemon-character-design)
- [How Spore Creature Creator Works](https://remptongames.com/2022/08/07/how-the-spore-creature-creator-works/)
- [Procedural Color Algorithm](https://shahriyarshahrabi.medium.com/procedural-color-algorithm-a37739f6dc1)
- [Choosing Colors Procedurally](http://devmag.org.za/2012/07/29/how-to-choose-colours-procedurally-algorithms/)
- [Custom Toon Shader Tutorial (Three.js)](https://www.maya-ndljk.com/blog/threejs-basic-toon-shader)
- [Three.js Rim Lighting Shader](https://threejsroadmap.com/blog/rim-lighting-shader)
- [Three.js MeshToonMaterial Docs](https://threejs.org/docs/pages/MeshToonMaterial.html)
- [Fresnel Shader Material (GitHub)](https://github.com/otanodesignco/Fresnel-Shader-Material)
- [Three.js SSS Demo](https://threejs.org/examples/webgl_materials_subsurface_scattering.html)
- [Three.js Animation System Guide](https://discoverthreejs.com/book/first-steps/animation-system/)
- [Three.js Skeletal Animation Deep Wiki](https://deepwiki.com/mrdoob/three.js/5.2-skeletal-animation-and-skinning)
- [Spring Physics Animation in JS](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/)
- [React Spring + Three.js](https://react-spring.dev/docs/guides/react-three-fiber)
- [Pudgy Pals Creature Generator](https://github.com/nmagarino/Pudgy-Pals-Procedural-Creature-Generator)
- [threejs-procedural-animal](https://github.com/bunnybones1/threejs-procedural-animal)
- [Three.js Tamagotchi Project](https://github.com/cconsta1/tamagotchi)
- [Runevision Procedural Creatures 2021-2024](https://blog.runevision.com/2025/01/procedural-creature-progress-2021-2024.html)
- [Procedural Generation Game Design Guide](https://www.numberanalytics.com/blog/procedural-generation-game-designers-guide)
- [Three Low Poly Toolkit](https://github.com/jasonsturges/three-low-poly)
- [Low Poly Mesh Generator (Three.js)](https://joshuasalazar.net/blog/low-poly-mesh-generator/)
- [Tamagotchi Gameplay Mechanics](https://tamagotchi-official.com/gb/series/connection/howto/)
- [Three.js Morph Targets Face Example](https://threejs.org/examples/webgl_morphtargets_face.html)
