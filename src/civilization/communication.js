/**
 * Communication — n-gram speech engine. Zero hardcoded responses.
 *
 * The creature learns by absorbing everything it hears — mic, desktop audio,
 * window titles, vision descriptions. It builds n-gram chains (1 through 5-grams)
 * and stores full phrases with emotional context.
 *
 * Speech = walking n-gram chains, preferring the longest match at each step.
 * Health gates speech OUTPUT (how many words, how coherent), not learning.
 * Intelligence emerges from vocab breadth + chain depth + pattern count.
 *
 * No LLM needed for speech generation. Pure recombination of absorbed input.
 */

class Communication {
  constructor() {
    // Word → emotional state associations (kept for emotional matching)
    this.associations = new Map(); // word → Float32Array(7)

    // N-gram tables: key = "w1|w2|...|wN", value = { next: Map<word, count>, total: count }
    // We track 1-grams through 5-grams
    this.ngrams = [
      null,           // index 0 unused
      new Map(),      // 1-grams: word → { count, next: Map }
      new Map(),      // 2-grams
      new Map(),      // 3-grams
      new Map(),      // 4-grams
      new Map(),      // 5-grams
    ];

    // Full phrase memory — complete sentences heard with context
    this.phrases = [];          // [{ text, words[], mood, source, count, lastSeen }]
    this.maxPhrases = 500;

    // Topic clusters — words that co-occur frequently
    this.topics = new Map();    // topic-id → Set<word>

    // Stats
    this.exposure = 0;          // total words heard
    this.attempts = 0;
    this.recentWords = [];
    this.maxRecent = 30;

    // Learning rate (always full — health doesn't affect learning)
    this.learnRate = 0.15;

    this._loadState();
  }

  // === Intelligence Stats ===

  /** Compute intelligence metrics from learned data. */
  getIntelligence() {
    const vocabSize = this.associations.size;
    const bigramCount = this.ngrams[2].size;
    const trigramCount = this.ngrams[3].size;
    const quadgramCount = this.ngrams[4].size;
    const phraseCount = this.phrases.length;

    // Vocab breadth: unique words (log scale, unbounded)
    const breadth = Math.log1p(vocabSize) / 4;

    // Chain depth: how long the chains get (higher n-grams = deeper understanding)
    const depth = (
      Math.min(1, bigramCount / 500) * 0.3 +
      Math.min(1, trigramCount / 200) * 0.3 +
      Math.min(1, quadgramCount / 50) * 0.25 +
      Math.min(1, this.ngrams[5].size / 20) * 0.15
    );

    // Pattern recognition: bigram + trigram density relative to vocab
    const patternDensity = vocabSize > 10
      ? Math.min(1, (bigramCount + trigramCount) / (vocabSize * 2))
      : 0;

    // Overall intelligence (0-100 scale for display)
    const raw = breadth * 30 + depth * 40 + patternDensity * 20 + Math.min(1, phraseCount / 100) * 10;
    const score = Math.floor(Math.min(100, raw));

    return {
      score,
      vocabSize,
      breadth: Math.floor(breadth * 100),
      chainDepth: Math.floor(depth * 100),
      patterns: bigramCount + trigramCount + quadgramCount,
      phrases: phraseCount,
    };
  }

  // === Learning (always full rate — health doesn't affect this) ===

  /**
   * Hear text — absorb into n-gram tables, phrase memory, and associations.
   * stateVector: [energy, happiness, fear, sleepiness, pain, reward, punishment]
   * health: passed but NOT used for learning rate (creature always absorbs fully)
   */
  hear(text, stateVector, health) {
    if (!text || !stateVector) return;

    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && w.length < 20);

    if (words.length === 0) return;

    // Update word associations (emotional context)
    for (const word of words) {
      this.exposure++;
      if (this.associations.has(word)) {
        const assoc = this.associations.get(word);
        for (let i = 0; i < 7; i++) {
          assoc[i] += (stateVector[i] - assoc[i]) * this.learnRate;
        }
        assoc.count = (assoc.count || 0) + 1;
      } else {
        const assoc = new Float32Array(7);
        for (let i = 0; i < 7; i++) assoc[i] = stateVector[i];
        assoc.count = 1;
        this.associations.set(word, assoc);
      }
    }

    // Build n-grams (1 through 5)
    for (let n = 1; n <= 5; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const key = words.slice(i, i + n).join('|');
        const table = this.ngrams[n];
        if (!table.has(key)) {
          table.set(key, { count: 0, next: new Map() });
        }
        const entry = table.get(key);
        entry.count++;

        // Track what word follows this n-gram
        if (i + n < words.length) {
          const nextWord = words[i + n];
          entry.next.set(nextWord, (entry.next.get(nextWord) || 0) + 1);
        }
      }
    }

    // Store as phrase if it's a meaningful length (3+ words)
    if (words.length >= 3) {
      const phraseText = words.join(' ');
      const existing = this.phrases.find(p => p.text === phraseText);
      if (existing) {
        existing.count++;
        existing.lastSeen = Date.now();
        // Update mood toward current state
        for (let i = 0; i < 7; i++) {
          existing.mood[i] += (stateVector[i] - existing.mood[i]) * 0.2;
        }
      } else {
        this.phrases.push({
          text: phraseText,
          words,
          mood: Array.from(stateVector),
          count: 1,
          lastSeen: Date.now(),
        });
        // Prune oldest low-count phrases if over limit
        if (this.phrases.length > this.maxPhrases) {
          this.phrases.sort((a, b) => (b.count * 2 + b.lastSeen / 1e12) - (a.count * 2 + a.lastSeen / 1e12));
          this.phrases = this.phrases.slice(0, this.maxPhrases);
        }
      }
    }

    // Track recent words
    for (const w of words) {
      this.recentWords.push(w);
      if (this.recentWords.length > this.maxRecent) this.recentWords.shift();
    }
  }

  // === Speech (gated by health) ===

  /**
   * Generate speech — returns a single recalled phrase.
   * For autonomous speech (not chat). Health gates max phrase length.
   */
  speak(stateVector, health) {
    if (this.phrases.length < 3) return null;

    this.attempts++;
    const h = health != null ? health : 0.5;
    const maxWords = Math.max(2, Math.floor(2 + h * 10));

    const phrase = this._findMatchingPhrase(stateVector, maxWords);
    return phrase;
  }

  /**
   * Find phrases relevant to input text. Returns top matches as whole sentences.
   * Used by chat handler to give the LLM real material to work with.
   */
  findRelevantPhrases(inputText, maxResults, maxWords) {
    maxResults = maxResults || 8;
    maxWords = maxWords || 15;

    const inputWords = inputText.toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1);

    if (inputWords.length === 0 || this.phrases.length === 0) return [];

    // Score each phrase by word overlap with input
    const scored = [];
    for (const p of this.phrases) {
      if (p.words.length > maxWords) continue;
      if (p.words.length < 2) continue;

      // Count overlapping words
      let overlap = 0;
      for (const w of inputWords) {
        if (p.words.includes(w)) overlap++;
      }

      // Score = overlap * frequency, with recency penalty
      const now = Date.now();
      const recency = p._lastSpoken ? Math.max(0.2, 1 - 1 / (1 + (now - p._lastSpoken) / 30000)) : 1;
      const score = (overlap * 3 + Math.sqrt(p.count)) * recency;

      if (score > 0.5) scored.push({ phrase: p, score });
    }

    scored.sort((a, b) => b.score - a.score);

    // If no overlap matches, fall back to most frequent phrases
    if (scored.length === 0) {
      const fallback = this.phrases
        .filter(p => p.words.length >= 2 && p.words.length <= maxWords && p.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, maxResults);
      return fallback.map(p => p.text);
    }

    return scored.slice(0, maxResults).map(e => {
      e.phrase._lastSpoken = Date.now();
      return e.phrase.text;
    });
  }

  /**
   * Find phrases relevant to a context string (for thoughts).
   * Returns a single phrase or null.
   */
  findContextPhrase(contextText, maxWords) {
    maxWords = maxWords || 10;
    const phrases = this.findRelevantPhrases(contextText, 5, maxWords);
    if (phrases.length === 0) return null;

    // Pick randomly from top matches for variety
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /** Find a stored phrase to recall, weighted by frequency with recency penalty. */
  _findMatchingPhrase(stateVector, maxWords) {
    // Filter to phrases that fit the health-gated word limit and heard 2+ times
    const viable = this.phrases.filter(p => p.words.length <= maxWords && p.count >= 2);
    if (viable.length === 0) return null;

    // Penalize recently spoken phrases
    const now = Date.now();
    const scored = viable.map(p => {
      const recencyPenalty = p._lastSpoken ? Math.max(0.1, 1 - 1 / (1 + (now - p._lastSpoken) / 60000)) : 1;
      return { phrase: p, score: p.count * recencyPenalty };
    });

    const total = scored.reduce((s, e) => s + e.score, 0);
    let r = Math.random() * total;
    for (const e of scored) {
      r -= e.score;
      if (r <= 0) {
        e.phrase._lastSpoken = now;
        return e.phrase.text;
      }
    }
    scored[0].phrase._lastSpoken = now;
    return scored[0].phrase.text;
  }

  /**
   * Walk n-gram chains to generate speech.
   * If seedWord is provided, starts from that word. Otherwise picks randomly.
   */
  _chainWalk(stateVector, maxWords, seedWord) {
    const seed = seedWord && this.associations.has(seedWord) ? seedWord : this._pickSeedWord();
    if (!seed) return null;

    const result = [seed];

    for (let step = 0; step < maxWords - 1; step++) {
      const next = this._predictNext(result);
      if (!next) break;
      result.push(next);
    }

    if (result.length === 0) return null;
    return result.join(' ');
  }

  /**
   * Generate fragments seeded from specific words (from user input).
   * Walks chains starting from each input word that exists in vocab.
   */
  generateSeeded(inputText, health) {
    const h = health != null ? health : 0.5;
    const maxWords = Math.max(3, Math.floor(3 + h * 9));

    const inputWords = inputText.toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && this.associations.has(w));

    const fragments = [];

    // Walk chains from each input word
    for (const word of inputWords) {
      const frag = this._chainWalk(null, maxWords, word);
      if (frag && frag.split(' ').length >= 2 && !fragments.includes(frag)) {
        fragments.push(frag);
      }
    }

    // Also find phrases containing any input word
    for (const phrase of this.phrases) {
      if (phrase.count < 2) continue;
      if (phrase.words.length > maxWords) continue;
      const hasOverlap = inputWords.some(w => phrase.words.includes(w));
      if (hasOverlap && !fragments.includes(phrase.text)) {
        fragments.push(phrase.text);
      }
      if (fragments.length >= 10) break;
    }

    // Fill remaining slots with random chain walks if needed
    let attempts = 0;
    while (fragments.length < 4 && attempts < 10) {
      const frag = this._chainWalk(null, maxWords);
      if (frag && !fragments.includes(frag)) fragments.push(frag);
      attempts++;
    }

    return fragments;
  }

  /** Pick a seed word. Sqrt-weighted so common words don't totally dominate. */
  _pickSeedWord() {
    const candidates = [];
    for (const [word, assoc] of this.associations) {
      const count = assoc.count || 0;
      if (count < 2) continue; // skip noise
      candidates.push({ word, weight: Math.sqrt(count) });
    }

    if (candidates.length === 0) return null;

    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.word;
    }
    return candidates[0].word;
  }

  /**
   * Predict next word using highest-order n-gram available.
   * Tries 5-gram context first, falls back to 4, 3, 2, 1.
   */
  _predictNext(words) {
    // Try longest context first (backoff model)
    for (let n = Math.min(5, words.length); n >= 1; n--) {
      const context = words.slice(-n).join('|');
      const table = this.ngrams[n];
      const entry = table.get(context);

      if (entry && entry.next.size > 0) {
        // Weighted random pick from next-word distribution
        const total = [...entry.next.values()].reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [word, count] of entry.next) {
          r -= count;
          if (r <= 0) return word;
        }
      }
    }
    return null;
  }

  // === Thought + React ===

  /**
   * Generate a thought — recalls a phrase related to what it's currently observing.
   * context: recent audio transcript + window title + vision description
   */
  think(stateVector, health, context) {
    if (this.phrases.length < 5) return null;
    const h = health != null ? health : 0.5;
    if (h < 0.2) return null; // too sick to think

    const maxWords = Math.max(3, Math.floor(3 + h * 8));

    // Find a phrase related to current context
    if (context) {
      const phrase = this.findContextPhrase(context, maxWords);
      if (phrase) return phrase + '...';
    }

    // No context match — pick a random frequent phrase
    const viable = this.phrases.filter(p => p.words.length >= 2 && p.words.length <= maxWords && p.count >= 2);
    if (viable.length === 0) return null;
    const pick = viable[Math.floor(Math.random() * viable.length)];
    return pick.text + '...';
  }

  react(type, stateVector, health) {
    if (this.associations.size < 5) return null;
    return this.speak(stateVector, health);
  }

  // === LLM constraint (optional, only for chat at very high intelligence) ===

  getLLMConstraint() {
    // LLM as grammar assist — only at high vocab
    const intel = this.getIntelligence();
    if (intel.vocabSize < 1000) return null;

    const topWords = [...this.associations.entries()]
      .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
      .slice(0, 80)
      .map(([w]) => w);

    // Get top phrases
    const topPhrases = this.phrases
      .filter(p => p.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => p.text);

    return `You are a creature that learned to speak by listening. ` +
      `Speak using ONLY these words: ${topWords.join(', ')}. ` +
      `Phrases you know well: ${topPhrases.join('; ')}. ` +
      `Max 12 words. No asterisks, no actions, no roleplay. Plain words only. ` +
      `Combine your known phrases naturally.`;
  }

  // === Sleep Consolidation ===

  consolidate() {
    if (this.associations.size < 5) return null;

    let strengthened = 0, pruned = 0;

    // Sharpen frequent word associations
    for (const [word, assoc] of this.associations) {
      if ((assoc.count || 0) >= 5) {
        for (let i = 0; i < 7; i++) {
          const diff = assoc[i] - 0.5;
          assoc[i] = Math.max(0, Math.min(1, 0.5 + diff * 1.05));
        }
        strengthened++;
      }
    }

    // Prune very rare single n-grams (noise reduction)
    for (let n = 3; n <= 5; n++) {
      const table = this.ngrams[n];
      if (table.size > 5000) {
        for (const [key, entry] of table) {
          if (entry.count <= 1) { table.delete(key); pruned++; }
        }
      }
    }

    console.log(`[Communication] Consolidation: ${strengthened} strengthened, ${pruned} n-grams pruned`);
    return { strengthened, pruned };
  }

  // === Persistence ===

  toJSON() {
    const assocObj = {};
    for (const [word, arr] of this.associations) {
      assocObj[word] = { v: Array.from(arr), c: arr.count || 0 };
    }

    // Serialize n-grams (only save count >= 2 for n >= 3)
    const ngramData = {};
    for (let n = 1; n <= 5; n++) {
      const entries = {};
      for (const [key, entry] of this.ngrams[n]) {
        if (n >= 3 && entry.count < 2) continue;
        const nextObj = {};
        for (const [w, c] of entry.next) {
          if (c >= 2 || n <= 2) nextObj[w] = c;
        }
        entries[key] = { c: entry.count, n: nextObj };
      }
      ngramData[n] = entries;
    }

    // Serialize phrases (top 200 by score)
    const savedPhrases = this.phrases
      .sort((a, b) => (b.count * 2 + b.lastSeen / 1e12) - (a.count * 2 + a.lastSeen / 1e12))
      .slice(0, 200)
      .map(p => ({ t: p.text, m: p.mood, c: p.count, s: p.lastSeen }));

    return {
      associations: assocObj,
      ngrams: ngramData,
      phrases: savedPhrases,
      exposure: this.exposure,
      attempts: this.attempts,
      recentWords: this.recentWords,
    };
  }

  static fromJSON(data) {
    const c = new Communication();
    if (data.exposure) c.exposure = data.exposure;
    if (data.attempts) c.attempts = data.attempts;
    if (data.recentWords) c.recentWords = data.recentWords;
    if (data.associations) {
      for (const [word, entry] of Object.entries(data.associations)) {
        const arr = new Float32Array(entry.v || [0, 0, 0, 0, 0, 0, 0]);
        arr.count = entry.c || 0;
        c.associations.set(word, arr);
      }
    }
    if (data.ngrams) {
      for (const [n, entries] of Object.entries(data.ngrams)) {
        const ni = parseInt(n);
        if (ni < 1 || ni > 5) continue;
        for (const [key, entry] of Object.entries(entries)) {
          const nextMap = new Map();
          if (entry.n) {
            for (const [w, count] of Object.entries(entry.n)) nextMap.set(w, count);
          }
          c.ngrams[ni].set(key, { count: entry.c || 0, next: nextMap });
        }
      }
    }
    if (data.phrases) {
      c.phrases = data.phrases.map(p => ({
        text: p.t, words: p.t.split(' '), mood: p.m || [0.5,0.5,0,0,0,0,0],
        count: p.c || 1, lastSeen: p.s || 0,
      }));
    }
    // Migrate old bigram data
    if (data.bigrams && !data.ngrams) {
      for (const [key, count] of Object.entries(data.bigrams)) {
        const parts = key.split('|');
        if (parts.length === 2) {
          const nextMap = new Map();
          nextMap.set(parts[1], typeof count === 'number' ? count : count.count || 1);
          c.ngrams[1].set(parts[0], { count: typeof count === 'number' ? count : count.count || 1, next: nextMap });
          c.ngrams[2].set(key, { count: typeof count === 'number' ? count : count.count || 1, next: new Map() });
        }
      }
    }
    return c;
  }

  _loadState() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'communication.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.exposure) this.exposure = data.exposure;
        if (data.attempts) this.attempts = data.attempts;
        if (data.recentWords) this.recentWords = data.recentWords;
        if (data.associations) {
          for (const [word, entry] of Object.entries(data.associations)) {
            const arr = new Float32Array(entry.v || [0, 0, 0, 0, 0, 0, 0]);
            arr.count = entry.c || 0;
            this.associations.set(word, arr);
          }
        }
        if (data.ngrams) {
          for (const [n, entries] of Object.entries(data.ngrams)) {
            const ni = parseInt(n);
            if (ni < 1 || ni > 5) continue;
            for (const [key, entry] of Object.entries(entries)) {
              const nextMap = new Map();
              if (entry.n) {
                for (const [w, count] of Object.entries(entry.n)) nextMap.set(w, count);
              }
              this.ngrams[ni].set(key, { count: entry.c || 0, next: nextMap });
            }
          }
        }
        if (data.phrases) {
          this.phrases = data.phrases.map(p => ({
            text: p.t, words: p.t.split(' '), mood: p.m || [0.5,0.5,0,0,0,0,0],
            count: p.c || 1, lastSeen: p.s || 0,
          }));
        }
        // Migrate old bigram-only data
        if (data.bigrams && !data.ngrams) {
          for (const [key, count] of Object.entries(data.bigrams)) {
            const parts = key.split('|');
            if (parts.length === 2) {
              const cnt = typeof count === 'number' ? count : count.count || 1;
              const nextMap = new Map(); nextMap.set(parts[1], cnt);
              this.ngrams[1].set(parts[0], { count: cnt, next: nextMap });
              this.ngrams[2].set(key, { count: cnt, next: new Map() });
            }
          }
        }
      }
    } catch (e) {
      console.error('[Communication] Load error:', e.message);
    }
  }

  save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.env.APPDATA || process.env.HOME, '.aria');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'communication.json'), JSON.stringify(this.toJSON(), null, 2));
    } catch (e) {
      console.error('[Communication] Save error:', e.message);
    }
  }
}

if (typeof module !== 'undefined') module.exports = { Communication };
