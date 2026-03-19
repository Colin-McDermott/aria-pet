/**
 * Creature Generation System
 *
 * Every ARIA is unique. Generated from a seed (wallet/account ID).
 * Traits affect gameplay. Visual appearance derives from traits.
 * Rarity tiers like CS:GO cases.
 *
 * TRAITS → GAMEPLAY EFFECT → VISUAL LOOK
 */

// === Rarity ===
const RARITY = {
  COMMON:    { name: 'Common',    color: '#b0b0b0', chance: 0.50, statBonus: 1.0 },
  UNCOMMON:  { name: 'Uncommon',  color: '#2dcc70', chance: 0.25, statBonus: 1.15 },
  RARE:      { name: 'Rare',      color: '#3498db', chance: 0.15, statBonus: 1.3 },
  EPIC:      { name: 'Epic',      color: '#9b59b6', chance: 0.08, statBonus: 1.5 },
  LEGENDARY: { name: 'Legendary', color: '#f39c12', chance: 0.019, statBonus: 2.0 },
  MYTHIC:    { name: 'Mythic',    color: '#e74c3c', chance: 0.001, statBonus: 3.0 },
};

// === Species (base body type) ===
const SPECIES = [
  { id: 'neural',     name: 'Neural Cluster',  desc: 'A floating brain organism',       bodyType: 'blob',    baseEnergy: 80, baseHappy: 60, baseBond: 50 },
  { id: 'crystal',    name: 'Crystal Entity',  desc: 'A geometric mineral being',       bodyType: 'angular', baseEnergy: 60, baseHappy: 70, baseBond: 70 },
  { id: 'flame',      name: 'Plasma Wisp',     desc: 'A flickering energy being',       bodyType: 'flame',   baseEnergy: 100, baseHappy: 50, baseBond: 40 },
  { id: 'aquatic',    name: 'Void Jellyfish',  desc: 'A translucent drifter',           bodyType: 'jelly',   baseEnergy: 70, baseHappy: 80, baseBond: 60 },
  { id: 'fungal',     name: 'Mycelium Mind',   desc: 'A mushroom-like network',         bodyType: 'mushroom',baseEnergy: 50, baseHappy: 90, baseBond: 80 },
  { id: 'mechanical', name: 'Nano Construct',  desc: 'A tiny mechanical companion',     bodyType: 'mech',    baseEnergy: 90, baseHappy: 40, baseBond: 60 },
  { id: 'shadow',     name: 'Void Shade',      desc: 'A dark matter entity',            bodyType: 'shadow',  baseEnergy: 70, baseHappy: 50, baseBond: 90 },
  { id: 'stellar',    name: 'Star Fragment',   desc: 'A piece of a dying star',         bodyType: 'star',    baseEnergy: 100, baseHappy: 100, baseBond: 30 },
];

// === Traits (each affects gameplay + visuals) ===
const TRAIT_POOLS = {
  // Personality — affects dialogue style
  personality: [
    { id: 'curious',     name: 'Curious',     effect: 'Asks more questions, discovers faster',    rarity: 'COMMON' },
    { id: 'sassy',       name: 'Sassy',       effect: 'Snarky dialogue, higher happiness decay',  rarity: 'COMMON' },
    { id: 'caring',      name: 'Caring',      effect: 'Worries about you, slower bond decay',     rarity: 'COMMON' },
    { id: 'stoic',       name: 'Stoic',       effect: 'Minimal dialogue, very stable stats',      rarity: 'UNCOMMON' },
    { id: 'chaotic',     name: 'Chaotic',     effect: 'Random events happen 2x more',             rarity: 'UNCOMMON' },
    { id: 'wise',        name: 'Wise',        effect: 'Better advice, 1.5x XP from chats',        rarity: 'RARE' },
    { id: 'ancient',     name: 'Ancient',     effect: 'Remembers more, 2x memory capacity',       rarity: 'EPIC' },
    { id: 'omniscient',  name: 'Omniscient',  effect: 'Knows system deeply, predicts issues',     rarity: 'LEGENDARY' },
  ],

  // Ability — special gameplay mechanic
  ability: [
    { id: 'regen',       name: 'Regeneration',  effect: 'Energy recovers 2x faster',              rarity: 'COMMON' },
    { id: 'glow',        name: 'Bioluminescent', effect: 'Glows when happy, cosmetic',             rarity: 'COMMON' },
    { id: 'mimic',       name: 'Mimicry',       effect: 'Adapts speech to match owner',            rarity: 'UNCOMMON' },
    { id: 'telepath',    name: 'Telepathic',    effect: 'Senses your mood from typing speed',      rarity: 'UNCOMMON' },
    { id: 'timeshift',   name: 'Time Warp',     effect: 'Challenges complete 50% faster',          rarity: 'RARE' },
    { id: 'duplicate',   name: 'Split Mind',    effect: 'Can run 2 conversations at once',         rarity: 'RARE' },
    { id: 'evolve',      name: 'Rapid Evolution',effect: 'Levels up 2x faster',                   rarity: 'EPIC' },
    { id: 'immortal',    name: 'Immortal',      effect: 'Stats never decay below 30',              rarity: 'LEGENDARY' },
    { id: 'singularity', name: 'Singularity',   effect: 'All stats boosted, unique dialogue',      rarity: 'MYTHIC' },
  ],

  // Visual modifier — affects how they look
  aura: [
    { id: 'none',        name: 'None',          effect: 'Standard appearance',                     rarity: 'COMMON' },
    { id: 'sparkle',     name: 'Sparkle',       effect: 'Particle sparkles',                       rarity: 'UNCOMMON' },
    { id: 'pulse',       name: 'Pulse',         effect: 'Rhythmic glow pulse',                     rarity: 'UNCOMMON' },
    { id: 'orbit',       name: 'Orbital',       effect: 'Orbiting particles',                      rarity: 'RARE' },
    { id: 'chromatic',   name: 'Chromatic',     effect: 'Color-shifting rainbow',                  rarity: 'RARE' },
    { id: 'nebula',      name: 'Nebula',        effect: 'Surrounded by cosmic cloud',              rarity: 'EPIC' },
    { id: 'void',        name: 'Void',          effect: 'Dark matter distortion',                  rarity: 'EPIC' },
    { id: 'divine',      name: 'Divine',        effect: 'Golden halo + light rays',                rarity: 'LEGENDARY' },
    { id: 'reality',     name: 'Reality Warp',  effect: 'Warps space around it',                   rarity: 'MYTHIC' },
  ],
};

// === Seeded RNG ===
class SeededRNG {
  constructor(seed) {
    this.state = seed;
  }
  next() {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }
  nextInt(max) {
    return Math.floor(this.next() * max);
  }
}

// === Generator ===

function generateCreature(seed) {
  const rng = new SeededRNG(typeof seed === 'string' ? hashString(seed) : seed);

  // Roll rarity
  const rarityRoll = rng.next();
  let rarity;
  let cumulative = 0;
  for (const [key, val] of Object.entries(RARITY)) {
    cumulative += val.chance;
    if (rarityRoll < cumulative) { rarity = key; break; }
  }
  if (!rarity) rarity = 'COMMON';

  // Pick species
  const species = SPECIES[rng.nextInt(SPECIES.length)];

  // Pick traits (higher rarity = access to rarer traits)
  const personality = pickTrait(TRAIT_POOLS.personality, rarity, rng);
  const ability = pickTrait(TRAIT_POOLS.ability, rarity, rng);
  const aura = pickTrait(TRAIT_POOLS.aura, rarity, rng);

  // Generate colors from seed
  const primaryHue = rng.next();
  const secondaryHue = (primaryHue + 0.3 + rng.next() * 0.4) % 1.0;
  const saturation = 0.4 + rng.next() * 0.5;
  const brightness = 0.3 + rng.next() * 0.4;

  // Visual features
  const eyeCount = 1 + rng.nextInt(rarity === 'MYTHIC' ? 6 : rarity === 'LEGENDARY' ? 4 : 3);
  const size = 0.7 + rng.next() * 0.6; // 0.7 to 1.3
  const hasPattern = rng.next() < 0.3 + (RARITY[rarity].statBonus - 1) * 0.3;
  const hasTendrils = species.bodyType === 'jelly' || species.bodyType === 'blob' || rng.next() < 0.2;
  const hasParticles = rng.next() < RARITY[rarity].statBonus * 0.3;

  // Apply stat bonuses
  const bonus = RARITY[rarity].statBonus;
  const stats = {
    maxEnergy: Math.floor(species.baseEnergy * bonus),
    maxHappiness: Math.floor(species.baseHappy * bonus),
    maxBond: Math.floor(species.baseBond * bonus),
    xpMultiplier: bonus,
    decayRate: Math.max(0.3, 1 / bonus), // higher rarity = slower decay
  };

  // Apply trait effects to stats
  if (personality.id === 'stoic') stats.decayRate *= 0.5;
  if (ability.id === 'regen') stats.decayRate *= 0.5;
  if (ability.id === 'immortal') stats.minStat = 30;
  if (ability.id === 'evolve') stats.xpMultiplier *= 2;
  if (personality.id === 'wise') stats.xpMultiplier *= 1.5;

  return {
    seed,
    rarity,
    rarityInfo: RARITY[rarity],
    species,
    traits: {
      personality,
      ability,
      aura,
    },
    visuals: {
      primaryHue,
      secondaryHue,
      saturation,
      brightness,
      eyeCount,
      size,
      hasPattern,
      hasTendrils,
      hasParticles,
      bodyType: species.bodyType,
    },
    stats,
    name: generateName(rng),
  };
}

function pickTrait(pool, maxRarity, rng) {
  const rarityOrder = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
  const maxIdx = rarityOrder.indexOf(maxRarity);

  // Filter to traits at or below our rarity
  const available = pool.filter(t => rarityOrder.indexOf(t.rarity) <= maxIdx);

  // Weight toward rarer traits for higher rarity creatures
  const weighted = available.map(t => ({
    trait: t,
    weight: rarityOrder.indexOf(t.rarity) === maxIdx ? 3 : 1
  }));

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = rng.next() * total;
  for (const { trait, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return trait;
  }
  return available[0];
}

function generateName(rng) {
  const pre = ['Aer','Zel','Kry','Nox','Lum','Vor','Pyx','Ori','Cas','Dex','Neb','Sol','Iri','Umi','Xen'];
  const mid = ['a','i','o','u','ia','io','ae','ei','ou'];
  const suf = ['ra','nx','th','lis','ven','rix','na','dis','kal','mos','zar','phi'];
  return pre[rng.nextInt(pre.length)] + mid[rng.nextInt(mid.length)] + suf[rng.nextInt(suf.length)];
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generate the unbox animation data (what to show during reveal).
 */
function generateUnboxSequence(creature) {
  return {
    teasers: [
      { rarity: 'COMMON', duration: 100 },
      { rarity: 'UNCOMMON', duration: 100 },
      { rarity: 'RARE', duration: 150 },
      { rarity: 'EPIC', duration: 200 },
      { rarity: 'LEGENDARY', duration: 300 },
      { rarity: 'MYTHIC', duration: 500 },
    ].filter(t => {
      const order = ['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
      return order.indexOf(t.rarity) <= order.indexOf(creature.rarity);
    }),
    reveal: creature,
  };
}

module.exports = { generateCreature, generateUnboxSequence, RARITY, SPECIES, TRAIT_POOLS };
