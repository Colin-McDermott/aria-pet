/**
 * Embeddings — sentence embedding engine for semantic speech.
 *
 * Uses all-MiniLM-L6-v2 via @xenova/transformers to embed utterances.
 * Stores everything the creature hears as (text, embedding, context) tuples.
 * Response = find most similar stored utterance → return what FOLLOWED it.
 *
 * This runs in the MAIN process (Node.js). The model is ~23MB, runs on CPU.
 */

const fs = require('fs');
const path = require('path');

let _pipeline = null;
let _embedder = null;
let _ready = false;
let _loading = false;

/** Initialize the embedding model. Call once at startup. */
async function initEmbeddings() {
  if (_ready || _loading) return _ready;
  _loading = true;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = path.join(process.env.HOME || process.env.APPDATA || '/tmp', '.cache', 'transformers');
    _embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    _ready = true;
    console.log('[Embeddings] Model loaded');
  } catch (e) {
    console.error('[Embeddings] Failed to load model:', e.message);
    _ready = false;
  }
  _loading = false;
  return _ready;
}

/** Embed a text string. Returns Float32Array(384) or null. */
async function embed(text) {
  if (!_ready || !_embedder) return null;
  try {
    const result = await _embedder(text, { pooling: 'mean', normalize: true });
    return new Float32Array(result.data);
  } catch { return null; }
}

/** Cosine similarity between two embedding vectors. */
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // already normalized
}

/**
 * UtteranceStore — stores everything the creature hears with embeddings.
 * Tracks conversation pairs (what was said → what followed).
 */
class UtteranceStore {
  constructor() {
    this.utterances = [];  // [{ text, embedding, timestamp, score }]
    this.pairs = [];       // [{ prompt, response, promptEmb, responseEmb, score, count }]
    this.maxUtterances = 5000;
    this.maxPairs = 2000;
    this._pendingUtterance = null; // last heard, waiting for what follows
    this._pendingTime = 0;
    this._pairTimeout = 10000;     // 10s — if next utterance within 10s, it's a response
  }

  /**
   * Store a new utterance. If a previous utterance is pending,
   * create a conversation pair (prev → this).
   */
  async add(text, source) {
    if (!text || text.length < 3) return;

    const emb = await embed(text);
    if (!emb) return;

    const now = Date.now();
    const entry = { text, embedding: emb, timestamp: now, source: source || 'unknown', score: 0 };

    // If there's a pending utterance and this arrived within timeout, create a pair
    if (this._pendingUtterance && now - this._pendingTime < this._pairTimeout) {
      const existing = this.pairs.find(p =>
        p.prompt === this._pendingUtterance.text && p.response === text
      );
      if (existing) {
        existing.count++;
      } else {
        this.pairs.push({
          prompt: this._pendingUtterance.text,
          response: text,
          promptEmb: this._pendingUtterance.embedding,
          responseEmb: emb,
          score: 0,
          count: 1,
        });
        if (this.pairs.length > this.maxPairs) {
          // Remove lowest scored infrequent pairs
          this.pairs.sort((a, b) => (b.count + b.score) - (a.count + a.score));
          this.pairs = this.pairs.slice(0, this.maxPairs);
        }
      }
    }

    // This becomes the pending utterance
    this._pendingUtterance = entry;
    this._pendingTime = now;

    // Store the utterance
    this.utterances.push(entry);
    if (this.utterances.length > this.maxUtterances) {
      // Remove oldest low-score utterances
      this.utterances.sort((a, b) => (b.score + b.timestamp / 1e15) - (a.score + a.timestamp / 1e15));
      this.utterances = this.utterances.slice(0, this.maxUtterances);
    }
  }

  /**
   * Find the best response to user input.
   * Searches conversation pairs for a prompt similar to input,
   * then returns the associated response.
   */
  async findResponse(inputText, maxResults) {
    maxResults = maxResults || 5;
    const inputEmb = await embed(inputText);
    if (!inputEmb) return [];

    // Score all pairs by prompt similarity to input
    const scored = [];
    for (const pair of this.pairs) {
      const sim = cosineSim(inputEmb, pair.promptEmb);
      const freqBoost = Math.log1p(pair.count) * 0.1;
      const scoreBoost = pair.score * 0.05;
      // Recency penalty for recently used responses
      const recency = pair._lastUsed ? Math.max(0.2, 1 - 1 / (1 + (Date.now() - pair._lastUsed) / 60000)) : 1;
      const total = (sim + freqBoost + scoreBoost) * recency;
      if (sim > 0.2) scored.push({ pair, sim, total });
    }

    scored.sort((a, b) => b.total - a.total);
    return scored.slice(0, maxResults).map(s => {
      s.pair._lastUsed = Date.now();
      return { text: s.pair.response, similarity: s.sim, score: s.total };
    });
  }

  /**
   * Find utterances similar to a context (for thoughts).
   */
  async findSimilar(contextText, maxResults) {
    maxResults = maxResults || 5;
    const contextEmb = await embed(contextText);
    if (!contextEmb) return [];

    const scored = [];
    for (const utt of this.utterances) {
      const sim = cosineSim(contextEmb, utt.embedding);
      if (sim > 0.25) scored.push({ text: utt.text, sim });
    }

    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, maxResults);
  }

  /** Apply user feedback (+/-) to a response. */
  feedback(responseText, amount) {
    for (const pair of this.pairs) {
      if (pair.response === responseText) {
        pair.score += amount;
        return;
      }
    }
  }

  /** Get stats. */
  getStats() {
    return {
      utterances: this.utterances.length,
      pairs: this.pairs.length,
      topPairs: this.pairs
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(p => `"${p.prompt.slice(0, 30)}" → "${p.response.slice(0, 30)}" (${p.count}x)`),
    };
  }

  // === Persistence ===

  toJSON() {
    // Save utterances without embeddings (we'll re-embed on load if needed)
    // But save pairs with text only — re-embed on load
    return {
      utterances: this.utterances.slice(-2000).map(u => ({
        t: u.text, ts: u.timestamp, src: u.source, s: u.score,
      })),
      pairs: this.pairs.map(p => ({
        p: p.prompt, r: p.response, s: p.score, c: p.count,
      })),
    };
  }

  static fromJSON(data) {
    const store = new UtteranceStore();
    // Pairs and utterances loaded without embeddings — they'll be re-embedded lazily
    if (data.pairs) {
      store.pairs = data.pairs.map(p => ({
        prompt: p.p, response: p.r, promptEmb: null, responseEmb: null,
        score: p.s || 0, count: p.c || 1,
      }));
    }
    if (data.utterances) {
      store.utterances = data.utterances.map(u => ({
        text: u.t, embedding: null, timestamp: u.ts || 0,
        source: u.src || 'unknown', score: u.s || 0,
      }));
    }
    return store;
  }

  /** Re-embed all entries that lack embeddings (after loading from JSON). */
  async reembed() {
    if (!_ready) return;
    let count = 0;
    // Re-embed pairs (priority — these are used for responses)
    for (const pair of this.pairs) {
      if (!pair.promptEmb) {
        pair.promptEmb = await embed(pair.prompt);
        count++;
      }
      if (!pair.responseEmb) {
        pair.responseEmb = await embed(pair.response);
        count++;
      }
    }
    // Re-embed recent utterances (for thought similarity)
    const recent = this.utterances.slice(-500);
    for (const utt of recent) {
      if (!utt.embedding) {
        utt.embedding = await embed(utt.text);
        count++;
      }
    }
    if (count > 0) console.log(`[Embeddings] Re-embedded ${count} entries`);
  }

  save() {
    try {
      const dir = path.join(process.env.APPDATA || process.env.HOME, '.aria');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'utterances.json'), JSON.stringify(this.toJSON()));
    } catch (e) {
      console.error('[Embeddings] Save error:', e.message);
    }
  }

  load() {
    try {
      const file = path.join(process.env.APPDATA || process.env.HOME, '.aria', 'utterances.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const loaded = UtteranceStore.fromJSON(data);
        this.utterances = loaded.utterances;
        this.pairs = loaded.pairs;
        console.log(`[Embeddings] Loaded ${this.utterances.length} utterances, ${this.pairs.length} pairs`);
      }
    } catch (e) {
      console.error('[Embeddings] Load error:', e.message);
    }
  }
}

function isReady() { return _ready; }

module.exports = { initEmbeddings, embed, cosineSim, UtteranceStore, isReady };
