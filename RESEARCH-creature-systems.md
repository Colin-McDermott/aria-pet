# Research: Procedural Creature Generation & Evolution Systems

## 1. Procedural Creature Generation Systems in Games

### Digimon: Care-Based Evolution Branching

The Digimon virtual pet system is the gold standard for "same base creature, different outcomes based on care." The core mechanics from the Digital Monster Ver. 20th:

**Decision variables for each evolution:**
- **Care Mistakes** (0-2 = good path, 3+ = alternate path) -- a care mistake happens when you ignore a hunger/strength call for 10+ minutes
- **Training count** (0-15 low, 16+ high)
- **Overfeed count** (0-2 normal, 3+ overfed)
- **Battles and victories** (15 battles with 12-15 wins needed for Perfect stage; 100+ battles for ultimate forms)

**Example:** Agumon evolves to Greymon with 0-2 care mistakes + 16+ training, but becomes Tyranomon with 3+ care mistakes + 5-15 training + 3+ overfeeding.

All counters (care mistakes, effort hearts, injuries) reset on evolution -- each stage is a clean slate.

**Key design insight:** The system feels personal because your specific pattern of care (not just grinding) determines the outcome. Neglect creates different but still viable creatures, not just "bad" ones.

### Pokemon: Genetics/Inheritance System

Pokemon's breeding system uses layered hidden values:

- **IVs (Individual Values):** 0-31 per stat, set at birth, never change. These are the creature's "genes."
- **EVs (Effort Values):** 0-252 per stat, gained from battling. These are "nurture." Newly hatched have 0 EVs.
- **Nature:** 25 options, +10% one stat / -10% another. 100% inherited if parent holds Everstone.
- **Ability inheritance:** Hidden abilities pass from parent with 60% chance.
- **Form inheritance:** Visual forms (e.g., Burmy's cloak) inherit from mother.

**Breeding mechanics:**
- Offspring inherits 3 IVs from parents randomly (5 if Destiny Knot held)
- Remaining IVs are random 0-31
- Species determined by mother

**Coromon's improvement:** Fuses stats + rarity into one system called "Potency." Higher potency = better stats AND different color palette. Perfect Coromon (1/3194 chance) are both the strongest AND visually distinct. This elegantly solves the problem of shinies being purely cosmetic.

### Steve Grand's Creatures: Neural Network Genetics

The deepest genetics-to-appearance system in any game:

- Each Norn has a **modular recurrent neural network** brain with Hebbian learning
- A **simulated biochemistry** with hormonal systems modulates neural activity
- Both the neural network architecture AND biochemistry details are **genetically specified** via variable-length genetic encoding
- Breeding uses sexual reproduction -- offspring get genes from both parents
- Senses include simulated sight, hearing, and touch
- Visual appearance has some genetic variation but is limited to bipedal Norn templates

**Key lesson:** Creatures proved that deep genetics create emergent behavior that players find genuinely compelling. But visual variety was limited because the appearance system was separate from the genetics.

### Spore: Parameter-to-Morphology Mapping

Spore has ~400 creature parts across 7 categories, with 228 functional parts. The key technical insight:

- Creatures have a **malleable body with an underlying spine**
- Parts attach anywhere on the body and can be stretched/resized
- **Algorithms interpret the morphology to create behaviors** -- the form determines how the creature moves, fights, and interacts
- Procedural animation adapts to whatever body plan the player creates
- Social parts give social abilities; weapon parts give combat abilities

**Architecture:** Rather than pre-programming thousands of animations, Spore's team developed algorithms that analyze a creature's body plan and generate appropriate locomotion/behavior. This is the key innovation -- form drives function.

### Monster Rancher: External Data as Seed

Monster Rancher reads **CD Table of Contents (TOC) data** -- specifically the minutes/seconds of the 2nd and last tracks, plus track count:

- **Primary monster type** = total disc minutes + number of tracks
- **Sub-breed** = derived from disc seconds
- **Stat seeds** = derived from additional timing values
- Values map to a master table of every monster variant
- Some CDs are hardcoded to specific thematic monsters (Christmas albums -> Santa monsters)
- The complete algorithm was reverse-engineered by SmilingFaces in 2020

**Key insight for your project:** Any deterministic data source can seed a creature. A wallet address, username hash, or timestamp works the same way. The mapping from seed to creature parameters just needs to feel meaningful.

### No Man's Sky: Blueprint + Accessory System

NMS uses the most practical approach for mass creature generation:

- **Process:** Template -> Accessories -> Layering -> Scaling
- **Templates** based on real animal skeletons (horse/deer share a skeleton; shark/dolphin share one)
- **Hundreds of base templates** with shared rigs to reduce complexity
- **Accessories** added to template (snout type, horns, etc.)
- Each geometric part has a **descriptor** classifying what body region it belongs to
- Descriptors are "mashed together" from pools to assemble valid creatures
- **Scaling system:** as height changes, weight/proportions/animations/bone thickness/voice all adapt
- The animation system understands that bigger creatures move differently

**Key numbers:** 18 quintillion planets, all creatures derive from a single 64-bit seed per planet.


## 2. Evolution Systems That Feel Meaningful

### Branching vs Linear

**Digimon approach (branching):** Same baby can become 3-5 different adults depending on care pattern. Each adult branches to 2-3 ultimates. Creates a tree where your specific journey matters.

**Pokemon approach (linear):** Evolution is mostly predetermined by species. A Charmander always becomes Charmeleon then Charizard. Branching exists but is item/condition gated (Eevee).

**Recommended hybrid:** Use Digimon's branching philosophy where care/environment determines path, but with Pokemon's clarity about what triggers each path. Players should be able to influence but not fully control the outcome.

### How Stats Should Affect Evolution Path

Based on Digimon's actual thresholds:

```
Evolution Decision Tree:
  IF strength > threshold AND care_mistakes < 2:
    -> Power evolution path
  ELIF speed > threshold AND battles > 15:
    -> Agile evolution path
  ELIF intelligence > threshold AND care_mistakes < 1:
    -> Mystic evolution path
  ELIF care_mistakes > 5:
    -> Dark/corrupt evolution path (still viable, not punishment)
  ELSE:
    -> Balanced/default evolution path
```

### Care/Environment Affecting Evolution

From Digimon virtual pets:
- **Hunger management** (not just "feed constantly" -- overfeeding leads to different evolutions)
- **Training consistency** (regular training vs neglect)
- **Sleep schedule** (putting to bed on time vs letting it cry)
- **Battle experience** (number of fights AND win ratio)

**Tamagotchi additions:**
- Weight affects stats (99G = stat penalty)
- Each care mistake during hunger/strength calls counts separately
- 20+ care mistakes or injuries = death/devolution

### Visual Transition: Morph vs Dramatic Change

**Smooth morph (morph targets):** WebGL vertex shaders can interpolate between two meshes using smoothstep. Each vertex blends from base position to target position. Three.js supports this natively with `mesh.morphTargetInfluences`.

**Dramatic change (Digimon/Pokemon style):** Flash of light, particle effect, swap model. More impactful emotionally. Easier to implement -- just swap the GLTF.

**Recommended:** Dramatic change for stage transitions (baby -> child -> adult) with smooth morphs for within-stage growth (getting bigger, features becoming more defined).


## 3. Creature Abilities and Moves

### Procedural Ability Generation from Stats

Rather than hardcoded move lists, abilities can be composed from parameters:

**Ability as data structure:**
```javascript
{
  type: "projectile" | "aoe" | "buff" | "debuff" | "heal",
  element: derived_from_creature_type,
  power: base_stat * multiplier,
  cost: energy_cost,
  range: based_on_speed_stat,
  duration: based_on_intelligence,
  cooldown: inversely_proportional_to_speed,
  effects: [{ stat: "health", amount: -power, target: "enemy" }]
}
```

**Stat-to-ability mapping:**
- High STR -> physical attacks, higher damage, shorter range
- High SPD -> fast attacks, dodge abilities, movement skills
- High INT -> AoE effects, status effects, longer duration
- Mixed stats -> hybrid abilities

**Threshold unlocks:** As a stat reaches certain thresholds, new ability types become available (Fire affinity at 10 = Ember; at 20 = Fireball with more damage and less cost; at 30 = Inferno with AoE).

### Type System from Genetics

Rather than assigning types manually, derive type from the creature's dominant stats and environment:
- Raised in water + high speed = Water/Swift type
- Raised in heat + high strength = Fire/Power type
- Raised in dark + high intelligence = Shadow/Mystic type

### Ability Discovery Through Gameplay

**Cassette Beasts approach:** Creatures learn moves by witnessing them. If your creature sees an enemy use a fire attack, it might learn a counter-fire ability.

**Activity-based learning:** Creature repeatedly does an action -> develops ability related to it. Runs a lot -> gets Sprint. Fights a lot -> gets Counter. Eats everything -> gets Devour.


## 4. 3D Procedural Creatures for WebGL/Three.js

### Modular Body Part Systems

**No Man's Sky approach (recommended for 3D):**
- Pre-made GLTF parts organized by slot: head, body, arms, legs, tail, accessories
- Shared skeleton across all parts (65-joint Mixamo standard works well)
- Parts tagged by slot type to prevent invalid combinations
- Seed number deterministically selects one part per slot

**Pudgy Pals approach (fully procedural, SDF-based):**
- Raymarched signed distance functions -- no pre-made models
- Spine = 4 control points -> De Casteljau spline -> 8 metaballs along curve
- Up to 4 limb pairs, distributed along spine
- Random joint counts per limb, spheres at joints, cylinders connecting them
- 3 head types, scaled to body
- 4 random colors + 2 textures via triplanar mapping
- Legs constrained to y=0, arms mirror legs with negated x

**Cassette Beasts approach (2D but applicable pattern):**
- Every creature designed as both a "complete" version and a "Lego" version
- Modular parts: body, head, helmet front/back, arms, tail, legs
- All animations exactly 6 frames (3 for hurt) to keep parts in sync
- Round-headed designs favored for better part compatibility
- 120 base creatures -> 14,000+ possible fusions

### Cuteness Constraints (Baby Schema / Kindchenschema)

Research-backed rules for making procedural creatures NOT look terrifying:

**Proportions:**
- Head-to-body ratio: **2:1 to 3:1** (2-3 heads tall total). Babies in anime = 2 heads tall.
- Eyes should sit **below center of head** (lower = cuter)
- Eyes should be **large relative to face** (30-50% of face width)
- Forehead should be **high and domed**
- Limbs should be **short and thick** relative to body
- Body should be **round/plump**, not angular

**Specific ratios from research:**
- Large head relative to body
- High protruding forehead
- Large eyes positioned low on face
- Chubby cheeks, small nose and mouth
- Short thick extremities
- Plump body shape

**Color palettes for cuteness:**
- Soft, pastel colors
- High saturation but not neon
- Warm tones (pinks, peaches, soft yellows)
- Avoid dark/muddy colors for baby stages
- Evolution stages can introduce bolder/darker colors

### Low-Poly Stylized Look

For WebGL performance and aesthetic:
- **Toon shading** (THREE.MeshToonMaterial) with 2-3 step gradient
- **Outlines** via inverted hull method or post-processing
- Keep poly count under 2000 per creature for smooth WebGL
- Use vertex colors instead of textures where possible (smaller files)
- Morph targets for expression (happy, sad, angry, sleeping) -- 4-6 targets

### Variation Math

How many parts do you need for creatures to feel unique?

```
With modular parts:
  5 head types x 4 body types x 4 arm types x 4 leg types x 3 tail types
  = 960 combinations

Add:
  8 color palettes x 3 pattern types x 2 eye types
  = 48 visual modifiers

Total: 960 x 48 = 46,080 visually distinct creatures

With continuous parameters (size scaling, color interpolation):
  -> Effectively infinite visual variation
```

**Important caveat:** After players see ~200-300 combinations, the human brain starts recognizing the modular pieces. Mitigate this with:
- Continuous parameter variation (not just discrete part swaps)
- Color/pattern randomization
- Size scaling per part
- Accessory system (hats, scarves, markings)


## 5. Mini-Games for Creatures

### Battle System Options

**Turn-based (Pokemon-like):**
- 4 moves selected from ability pool
- Type effectiveness matrix
- Stats determine damage/speed
- Works well with strategic evolution choices
- Easiest to implement, most proven

**Auto-battle (Idle/Gacha-like):**
- Creature fights on its own using AI
- Player influence through training/evolution choices
- Stats + AI behavior = emergent strategy
- Good for mobile/casual

**Real-time arena:**
- Direct creature control
- Speed/agility directly affects movement
- Strength affects knockback/damage
- Most skill-based, hardest to balance with stat variation

### Stats Mapping to Game Types

Design ONE stat system that works across multiple games:

| Stat | Battle | Race | Puzzle | Exploration |
|------|--------|------|--------|-------------|
| STR | Damage | Obstacle break | N/A | Move heavy objects |
| SPD | Turn order | Movement speed | Time bonus | Cover ground faster |
| INT | Ability power | Route finding | Puzzle solve rate | Find hidden items |
| VIT | HP pool | Stamina | Attempts allowed | Time before rest |
| LCK | Crit rate | Item drops | Hint chance | Rare find chance |

### Creature Crafter Reference (Steam game)

Creature Crafter demonstrates: BUILD (customize shape + body parts -> stats/abilities) -> PAINT (colors/patterns) -> BATTLE (creatures procedurally animate based on body plan). Also includes minigame challenges between friends.

### Feeding/Care Games

Stats like hunger, happiness, and health are maintained through care:
- Well-fed creature performs better in all games
- Happiness affects willingness to train/battle
- Health affects max performance
- Creates daily engagement loop (Tamagotchi model)


## 6. Technical: 3D Creature with Swappable Parts in Three.js

### GLTF Modular Architecture

**Recommended approach based on Three.js community patterns:**

1. **One master skeleton file** containing the shared rig (65 Mixamo joints)
2. **Separate GLTF files per body part** -- each skinned to the same skeleton
3. **At runtime:**
   - Load master skeleton
   - Load selected body part GLTFs
   - Use `SkinnedMesh.bind()` with `DetachedBindMode` to share skeleton
   - Play animations from AnimationMixer on the shared skeleton

**Key Three.js classes:**
- `THREE.Skeleton` -- shared bone hierarchy
- `THREE.SkinnedMesh` -- each body part is one
- `THREE.AnimationMixer` -- drives skeleton, all parts follow
- `DetachedBindMode` -- allows meshes in different world spaces to share a skeleton

**gltf-avatar-threejs reference implementation:**
- Uses standard 65-joint Mixamo skeleton
- Skeleton file = base rig + main mesh
- Skin files = clothing/parts that reference parent skeleton by name
- Visibility control via body-id lookup texture (red channel = part ID 0-255)
- Can export merged GLB files for standard viewers

### Morph Targets for Evolution Transitions

```javascript
// Evolution transition using morph targets
creature.morphTargetInfluences[0] = 0; // baby form
// Animate to 1.0 over time for smooth transition
gsap.to(creature.morphTargetInfluences, {
  0: 1, // adult form
  duration: 2,
  ease: "power2.inOut"
});
```

Each evolution stage can be a morph target on the base mesh. Intermediate values show the creature "growing" between stages. Combine with particle effects for dramatic flair.

### Bone-Based Animation Across Body Types

- All body parts must be rigged to the SAME skeleton with the SAME bone names
- Animations are stored separately from meshes
- One walk cycle, one idle, one attack animation works across all body combinations
- The skeleton drives the animation; meshes just follow their bound bones
- Mixamo provides a huge library of animations all using the same 65-joint rig

### File Size Optimization

- **GLTF binary (.glb)** format with Draco compression
- Each body part: 500-2000 triangles = ~5-20KB compressed per part
- Shared animations: ~10-50KB per animation clip
- Skeleton: ~5KB
- **Total per creature: ~50-100KB** (very manageable)
- Texture atlases: one 512x512 atlas for all color palettes = 50KB
- With 50 unique parts + 10 animations + palettes: **~2MB total download** for entire creature system

### Client-Side Creature Generation from Seed

```javascript
import seedrandom from 'seedrandom';

function generateCreature(seed) {
  const rng = seedrandom(seed);

  return {
    head: HEADS[Math.floor(rng() * HEADS.length)],
    body: BODIES[Math.floor(rng() * BODIES.length)],
    arms: ARMS[Math.floor(rng() * ARMS.length)],
    legs: LEGS[Math.floor(rng() * LEGS.length)],
    tail: TAILS[Math.floor(rng() * TAILS.length)],
    palette: {
      primary: hslFromSeed(rng),
      secondary: hslFromSeed(rng),
      accent: hslFromSeed(rng),
    },
    pattern: PATTERNS[Math.floor(rng() * PATTERNS.length)],
    scale: 0.8 + rng() * 0.4, // 0.8 to 1.2
    eyeSize: 0.3 + rng() * 0.2, // always big for cuteness
    stats: {
      str: Math.floor(rng() * 10) + 5,
      spd: Math.floor(rng() * 10) + 5,
      int: Math.floor(rng() * 10) + 5,
      vit: Math.floor(rng() * 10) + 5,
      lck: Math.floor(rng() * 10) + 5,
    }
  };
}
```

**Libraries:**
- `seedrandom` (davidbau/seedrandom) -- most popular seeded PRNG for JS
- `prando` (zeh/prando) -- TypeScript-first alternative
- For hashing strings to seeds: djb2 hash or MurmurHash3


## 7. Key GitHub Repos & References

| Project | What It Is | Why It Matters |
|---------|-----------|----------------|
| [daniellochner/creature-creator](https://github.com/daniellochner/creature-creator) | Spore-like creature creator in Unity, full source | Complete implementation of spine-based body + procedural animation |
| [nmagarino/Pudgy-Pals](https://github.com/nmagarino/Pudgy-Pals-Procedural-Creature-Generator) | WebGL SDF creature generator | Fully procedural 3D creatures in browser, no pre-made models |
| [shrekshao/gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs) | Modular GLTF avatar system for Three.js | Production pattern for swappable skinned meshes with shared skeleton |
| [kestrelm/Creature_WebGL](https://github.com/kestrelm/Creature_WebGL) | 2D skeletal animation WebGL runtimes | Morph target + skeletal animation for PixiJS/Three.js |
| [davidbau/seedrandom](https://github.com/davidbau/seedrandom) | Seeded PRNG for JavaScript | Deterministic creature generation from any seed |
| [Bingroc/EvolutionGame](https://github.com/Bingroc/EvolutionGame) | Physics-based creature evolution in Godot 4 | Natural selection simulation with procedural bodies |
| [zeh/prando](https://github.com/zeh/prando) | Deterministic PRNG for TypeScript | Alternative to seedrandom with cleaner API |


## 8. Recommended Architecture for Aria Pet

Based on all research, here's what fits your existing DESIGN.md best:

### DNA System
```
Seed (player ID hash) -> Seeded RNG -> DNA object
DNA object = {
  body_genes: [head_type, body_type, limb_type, tail_type],
  color_genes: [hue, saturation, pattern],
  stat_genes: [str_base, spd_base, int_base, vit_base],
  personality_genes: [curiosity, aggression, sociability],
  hidden_genes: [evolution_affinity, mutation_rate, growth_speed]
}
```

### Evolution Stages
```
Blob (Lv 1-5) -> Baby (Lv 5-10) -> Child (Lv 10-20) -> Adult (Lv 20-35) -> Evolved (Lv 35+)

Each transition checks:
  - Dominant stat (determines evolution branch)
  - Care quality (mistakes, feeding, training)
  - Environment exposure (biome time spent)
  - Battle experience
```

### 3D Rendering
1. Pre-make 5-8 variations per body slot in Blender, all on same 20-30 joint skeleton
2. Export as separate .glb files with Draco compression
3. Load master skeleton + selected parts at runtime
4. Use DetachedBindMode for shared skeleton animation
5. Morph targets for within-stage growth
6. Model swap + particles for stage evolution transitions
7. Toon shader + outline for consistent cute aesthetic

### Ability System
- Abilities = composable data objects, not hardcoded
- Stats determine which ability pool is available
- New abilities unlock at stat thresholds
- Activity-based discovery (creature does thing repeatedly -> learns ability)
- Each ability has: type, element, power, cost, range, duration, cooldown, effects[]

### Mini-Game Integration
- One stat system, multiple game modes
- STR/SPD/INT/VIT/LCK map differently per game type
- Care quality affects all performance (Tamagotchi engagement loop)
- Evolution choices have gameplay consequences (speed creature excels at races but weak in puzzles)
