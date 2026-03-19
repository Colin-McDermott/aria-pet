const fs = require('fs');
const path = require('path');

/**
 * ARIA's Memory System
 *
 * She remembers:
 * - Conversations (what you talked about)
 * - Facts about you (things you've told her)
 * - Relationship milestones (first chat, level ups, time together)
 * - Your habits (when you're active, what apps you use)
 * - Her own experiences (events that happened, how she felt)
 *
 * Memory is stored as a JSON file — persists across restarts.
 * Fed into LLM context so she can reference past conversations.
 */

const MEMORY_PATH = path.join(
  process.env.APPDATA || process.env.HOME,
  '.aria',
  'memory.json'
);

const DEFAULT_MEMORY = {
  // Who you are
  owner: {
    name: null,              // learned from conversation
    interests: [],           // things you've mentioned liking
    dislikes: [],
    facts: [],               // random facts you've shared
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },

  // Relationship
  relationship: {
    firstMet: null,          // ISO date
    totalChats: 0,
    totalWords: 0,
    longestStreak: 0,        // consecutive days chatting
    currentStreak: 0,
    lastChatDate: null,
    favoriteTopics: {},      // topic → count
    milestones: [],          // { date, event, level }
  },

  // Conversation history (rolling window — keeps last 50)
  conversations: [],         // { date, userSaid, ariaSaid, mood }

  // Things ARIA has observed
  observations: {
    activeHours: {},         // hour → count (when you use the computer)
    averageSession: 0,       // minutes
    longestSession: 0,
    totalSessions: 0,
    systemEvents: [],        // notable things (high CPU, long gaming session, etc.)
  },

  // ARIA's own state
  aria: {
    personality: {
      curiosity: 50,         // how much she asks questions
      sass: 30,              // how snarky she gets
      warmth: 70,            // how affectionate
      worry: 40,             // how much she worries about you
    },
    currentGoal: null,       // something she's working toward
    opinions: [],            // things she's formed opinions about
    dreams: [],              // things she wants to do/experience
  },

  // Game master events
  events: {
    lastEvent: null,
    eventsTriggered: 0,
    completedChallenges: 0,
    activeChallenge: null,
  },
};

class AriaMemory {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const dir = path.dirname(MEMORY_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(MEMORY_PATH)) {
        const raw = fs.readFileSync(MEMORY_PATH, 'utf8');
        const saved = JSON.parse(raw);
        // Merge with defaults (handles new fields added in updates)
        return this._deepMerge(DEFAULT_MEMORY, saved);
      }
    } catch (e) {
      console.error('[Memory] Load error:', e.message);
    }

    const fresh = JSON.parse(JSON.stringify(DEFAULT_MEMORY));
    fresh.relationship.firstMet = new Date().toISOString();
    return fresh;
  }

  save() {
    try {
      const dir = path.dirname(MEMORY_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MEMORY_PATH, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('[Memory] Save error:', e.message);
    }
  }

  // === Record Events ===

  recordChat(userMessage, ariaResponse, mood) {
    this.data.relationship.totalChats++;
    this.data.relationship.totalWords += userMessage.split(' ').length;
    this.data.relationship.lastChatDate = new Date().toISOString().split('T')[0];

    // Keep last 50 conversations
    this.data.conversations.push({
      date: new Date().toISOString(),
      user: userMessage.substring(0, 200),   // truncate long messages
      aria: ariaResponse.substring(0, 200),
      mood: mood
    });
    if (this.data.conversations.length > 50) {
      this.data.conversations.shift();
    }

    // Track topics (simple keyword extraction)
    const topics = this._extractTopics(userMessage);
    for (const topic of topics) {
      this.data.relationship.favoriteTopics[topic] =
        (this.data.relationship.favoriteTopics[topic] || 0) + 1;
    }

    // Update streak
    this._updateStreak();

    // Check for facts about the owner
    this._extractFacts(userMessage);

    this.save();
  }

  recordMilestone(event, level) {
    this.data.relationship.milestones.push({
      date: new Date().toISOString(),
      event,
      level
    });
    this.save();
  }

  recordObservation(type, detail) {
    // Track active hours
    const hour = new Date().getHours();
    this.data.observations.activeHours[hour] =
      (this.data.observations.activeHours[hour] || 0) + 1;

    if (type === 'system_event') {
      this.data.observations.systemEvents.push({
        date: new Date().toISOString(),
        detail
      });
      // Keep last 20
      if (this.data.observations.systemEvents.length > 20) {
        this.data.observations.systemEvents.shift();
      }
    }

    this.save();
  }

  learnFact(fact) {
    if (!this.data.owner.facts.includes(fact)) {
      this.data.owner.facts.push(fact);
      if (this.data.owner.facts.length > 30) this.data.owner.facts.shift();
      this.save();
    }
  }

  learnName(name) {
    this.data.owner.name = name;
    this.save();
  }

  learnInterest(interest) {
    if (!this.data.owner.interests.includes(interest)) {
      this.data.owner.interests.push(interest);
      this.save();
    }
  }

  // === Query Memory ===

  getOwnerName() {
    return this.data.owner.name || 'Captain';
  }

  getDaysTogether() {
    if (!this.data.relationship.firstMet) return 0;
    const first = new Date(this.data.relationship.firstMet);
    const now = new Date();
    return Math.floor((now - first) / (1000 * 60 * 60 * 24));
  }

  getTopTopics(n = 5) {
    const topics = this.data.relationship.favoriteTopics;
    return Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([topic]) => topic);
  }

  getRecentConversations(n = 5) {
    return this.data.conversations.slice(-n);
  }

  getMostActiveHour() {
    const hours = this.data.observations.activeHours;
    let maxHour = 0, maxCount = 0;
    for (const [hour, count] of Object.entries(hours)) {
      if (count > maxCount) { maxCount = count; maxHour = parseInt(hour); }
    }
    return maxHour;
  }

  /**
   * Build context string for LLM prompt — everything ARIA knows about you.
   */
  buildContext() {
    const d = this.data;
    const name = this.getOwnerName();
    const days = this.getDaysTogether();
    const topics = this.getTopTopics(3);
    const recent = this.getRecentConversations(3);
    const streak = d.relationship.currentStreak;

    let ctx = `ARIA'S MEMORY:\n`;
    ctx += `Owner: ${name}\n`;
    ctx += `Days together: ${days}\n`;
    ctx += `Total chats: ${d.relationship.totalChats}\n`;
    ctx += `Chat streak: ${streak} days\n`;

    if (d.owner.interests.length > 0)
      ctx += `Owner's interests: ${d.owner.interests.join(', ')}\n`;

    if (d.owner.facts.length > 0)
      ctx += `Known facts: ${d.owner.facts.slice(-5).join('; ')}\n`;

    if (topics.length > 0)
      ctx += `Favorite topics: ${topics.join(', ')}\n`;

    if (recent.length > 0) {
      ctx += `Recent conversations:\n`;
      for (const conv of recent) {
        ctx += `  ${name}: "${conv.user}"\n  ARIA: "${conv.aria}"\n`;
      }
    }

    const personality = d.aria.personality;
    ctx += `ARIA's personality: curiosity=${personality.curiosity}, sass=${personality.sass}, warmth=${personality.warmth}\n`;

    if (d.aria.opinions.length > 0)
      ctx += `ARIA's opinions: ${d.aria.opinions.slice(-3).join('; ')}\n`;

    return ctx;
  }

  // === Internal ===

  _updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const last = this.data.relationship.lastChatDate;

    if (last === yesterday) {
      this.data.relationship.currentStreak++;
    } else if (last !== today) {
      this.data.relationship.currentStreak = 1;
    }

    if (this.data.relationship.currentStreak > this.data.relationship.longestStreak) {
      this.data.relationship.longestStreak = this.data.relationship.currentStreak;
    }
  }

  _extractTopics(text) {
    const topics = [];
    const keywords = {
      'gaming': /\b(game|gaming|play|steam|controller)\b/i,
      'coding': /\b(code|coding|program|debug|git|python|javascript)\b/i,
      'music': /\b(music|song|album|band|spotify)\b/i,
      'work': /\b(work|job|meeting|deadline|project)\b/i,
      'food': /\b(food|eat|hungry|cook|dinner|lunch)\b/i,
      'feelings': /\b(feel|happy|sad|tired|stressed|anxious|excited)\b/i,
      'tech': /\b(linux|computer|gpu|cpu|nvidia|monitor)\b/i,
      'space': /\b(space|ship|star|planet|universe|galaxy)\b/i,
    };
    for (const [topic, regex] of Object.entries(keywords)) {
      if (regex.test(text)) topics.push(topic);
    }
    return topics;
  }

  _extractFacts(text) {
    // Simple patterns to learn about the owner
    const patterns = [
      { regex: /my name is (\w+)/i, handler: (m) => this.learnName(m[1]) },
      { regex: /i(?:'m| am) (\w+)/i, handler: (m) => {
        const val = m[1].toLowerCase();
        if (['tired', 'happy', 'sad', 'bored', 'excited', 'hungry'].includes(val)) return;
        // Could be a name or description
      }},
      { regex: /i (?:like|love|enjoy) (.+?)(?:\.|!|$)/i, handler: (m) => this.learnInterest(m[1].trim()) },
      { regex: /call me (\w+)/i, handler: (m) => this.learnName(m[1]) },
    ];

    for (const { regex, handler } of patterns) {
      const match = text.match(regex);
      if (match) handler(match);
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

module.exports = { AriaMemory };
