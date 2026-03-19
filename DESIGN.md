# ARIA — Living Ecosystem Desktop Pet

## Core Concept
You are the god of a tiny world. Your creature lives in an ecosystem you build and maintain. The creature adapts and evolves based on the environment you create. The ecosystem is alive — things grow, die, eat each other, and change while you're away.

## Two Layers

### Layer 1: Terrarium (the world you manage)
- Grid-based biome (16x12 tiles minimum)
- Tile types: empty, soil, water, rock, lava, ice, sand, organic
- Global controls: temperature, light, humidity
- Place objects: food sources, plants, decorations, shelters
- Weather: rain (adds water), heat waves, storms, snow
- Day/night cycle affects growth and creature behavior
- Plants grow on valid tiles based on conditions
- Small organisms spawn naturally (bacteria, insects, fish)
- Ecosystem health meter — balanced = thriving

### Layer 2: Creature (adapts to your world)
- Starts as a single cell blob
- Body plan emerges from environment:
  - Water heavy → fins, streamlined
  - Vertical terrain → legs, climbing hooks
  - Hot → heat plates, smaller body
  - Cold → fur, fat layer, larger body
  - Dark → big eyes, bioluminescence
  - Lots of prey → speed, claws
  - Lots of plants → grinding mouth, slow metabolism
- Neural network brain (visible, nodes light up):
  - Input nodes: see food, see danger, feel temperature, sense mouse
  - Hidden nodes: form through learning
  - Output nodes: move left/right/up/down, eat, flee, sleep, vocalize
  - Connections strengthen with use, weaken without
  - You can literally watch it learn
- DNA system:
  - Genes control: body size, speed, metabolism, sense range, color, limb count
  - Mutations happen each generation
  - Breeding combines two creatures' DNA
  - Evolution is visible across generations

## Progression (complexity unlocks over time)

### Stage 1: Single Cell (Lv 1-5)
- Just a blob in a simple environment
- Player learns: feed it, adjust temperature, watch it move
- Creature: moves randomly, eats food near it
- Environment: basic tiles, food placement
- This IS the simple version, works immediately

### Stage 2: Multicellular (Lv 5-15)
- Creature develops visible organs (eyes, mouth, limbs)
- Player unlocks: plant placement, water tiles, weather
- Creature: follows food, avoids danger, reacts to mouse
- Neural net becomes visible — see connections forming
- Body parts grow based on environment

### Stage 3: Complex Organism (Lv 15-30)
- Full creature with unique body plan from evolution
- Player unlocks: other organisms (prey, companions), terrain tools
- Creature: hunts, explores, has preferences, sleeps
- Ecosystem has food chains
- Creature has personality from neural net patterns

### Stage 4: Intelligent Being (Lv 30+)
- Neural net is complex enough for emergent behavior
- LLM integration: creature can "speak" through its neural net
- Player unlocks: breeding, offspring, generational evolution
- Creature: forms opinions, remembers, predicts
- Ecosystem is a full simulation

## Technical Architecture

### Grid World
```
class World {
  tiles: Tile[][]          // 16x12 grid
  temperature: number      // global temp
  light: number            // global light
  humidity: number         // affects plant growth
  time: number             // day/night cycle
  organisms: Organism[]    // all living things
  particles: Particle[]    // visual effects (rain, spores, sparks)
}
```

### Creature Brain (Neural Net)
```
class Brain {
  inputs: Node[]           // sensory (8-12 inputs)
  hidden: Node[]           // grows with learning (start 0, max ~50)
  outputs: Node[]          // actions (6-8 outputs)
  connections: Connection[] // weighted links

  tick(worldState) → action
  learn(reward)            // strengthen recent connections
  mutate()                 // for offspring
}
```

### DNA / Genetics
```
class DNA {
  genes: {
    bodySize: [0-1],
    speed: [0-1],
    metabolism: [0-1],
    senseRange: [0-1],
    limbCount: [0-1],
    colorHue: [0-1],
    temperaturePref: [0-1],
    aggression: [0-1],
    intelligence: [0-1],     // affects max hidden nodes
    resilience: [0-1],
  }

  static breed(a, b) → DNA   // crossover + mutation
  express(environment) → BodyPlan  // DNA + environment = appearance
}
```

### Rendering
- Canvas-based (existing renderer, extended)
- World rendered as tile grid behind creature
- Organisms rendered as tiny sprites
- Neural net rendered as node graph (optional overlay)
- Particles for weather, eating, evolution effects
- Smooth creature morphing as body adapts

## UI Layout
```
┌──────────────────────────────────────┐
│ ARIA    Species    Rarity    Lv.12   │
│                                      │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │     TERRARIUM VIEW           │    │
│  │     (creature + ecosystem)   │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  🌡️ Temp ═══════○═══  ☀️ Light ════○ │
│                                      │
│  Tools: [🪨][💧][🌱][🍖][🏠][⛈️]    │
│                                      │
│  "I found something tasty!" 💚       │
│  [Talk to creature...]               │
│                                      │
│  ⚡72  ☺88  ♥65  ✦Lv.12            │
│  CPU 21% | RAM 28%                   │
└──────────────────────────────────────┘
```

## What Makes This Different From Anything Else
1. The creature ACTUALLY evolves — not scripted stages, real genetic algorithms
2. You can SEE its brain learn — neural net is visual
3. Your environment choices directly shape evolution
4. Ecosystem is alive — not just a backdrop
5. AI personality emerges from neural net + LLM
6. It runs on your desktop, reacts to your computer
7. Every player's creature is genuinely unique
8. Idle progression — evolution happens while you're away
