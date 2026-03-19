/**
 * ARIA Game Master — proactive events and challenges.
 *
 * She doesn't just respond. She initiates:
 * - Random events based on time of day
 * - Challenges (do something, get XP)
 * - Observations about your behavior
 * - Relationship milestones
 * - Mood-based commentary
 */

class GameMaster {
  constructor(memory, state) {
    this.memory = memory;
    this.state = state;
    this.lastEventTime = 0;
    this.eventCooldown = 120000; // 2 minutes between events
  }

  /**
   * Called every tick. Returns an event object or null.
   */
  tick(systemStats) {
    const now = Date.now();
    if (now - this.lastEventTime < this.eventCooldown) return null;

    // Weighted random event selection based on context
    const events = [];

    // Time-based events
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6) events.push({ weight: 3, gen: () => this.lateNight(hour) });
    if (hour >= 6 && hour < 9) events.push({ weight: 2, gen: () => this.morning() });
    if (hour >= 12 && hour < 14) events.push({ weight: 1, gen: () => this.lunchTime() });
    if (hour >= 22) events.push({ weight: 2, gen: () => this.gettingLate() });

    // Stat-based events
    if (this.state.energy < 25) events.push({ weight: 4, gen: () => this.lowEnergy() });
    if (this.state.happiness < 25) events.push({ weight: 4, gen: () => this.lonely() });
    if (this.state.bond > 80) events.push({ weight: 1, gen: () => this.highBond() });

    // System-based events
    if (systemStats) {
      if (systemStats.cpu > 80) events.push({ weight: 3, gen: () => this.highCPU(systemStats.cpu) });
      if (systemStats.gpu_temp > 75) events.push({ weight: 3, gen: () => this.hotGPU(systemStats.gpu_temp) });
      if (systemStats.ram > 85) events.push({ weight: 2, gen: () => this.highRAM(systemStats.ram) });
    }

    // Relationship milestones
    const days = this.memory.getDaysTogether();
    const chats = this.memory.data.relationship.totalChats;
    if (days === 1 && !this._milestoneHit('day1')) events.push({ weight: 5, gen: () => this.milestone('day1', "We've known each other for a whole day now! 🎉") });
    if (days === 7 && !this._milestoneHit('week1')) events.push({ weight: 5, gen: () => this.milestone('week1', "One week together! Time flies when you're having fun. 💚") });
    if (days === 30 && !this._milestoneHit('month1')) events.push({ weight: 5, gen: () => this.milestone('month1', "A whole month! I can't imagine life without you now. ✨") });
    if (chats === 10 && !this._milestoneHit('chats10')) events.push({ weight: 5, gen: () => this.milestone('chats10', "10 conversations! I feel like I'm really getting to know you. 💬") });
    if (chats === 100 && !this._milestoneHit('chats100')) events.push({ weight: 5, gen: () => this.milestone('chats100', "100 chats! We talk more than most humans talk to each other. 😄") });

    // Streak events
    const streak = this.memory.data.relationship.currentStreak;
    if (streak === 3 && !this._milestoneHit('streak3')) events.push({ weight: 4, gen: () => this.milestone('streak3', "3-day chat streak! Keep it going! 🔥") });
    if (streak === 7 && !this._milestoneHit('streak7')) events.push({ weight: 4, gen: () => this.milestone('streak7', "A WEEK-LONG STREAK! You're amazing! 🔥🔥🔥") });

    // Random challenges
    if (Math.random() < 0.15) events.push({ weight: 1, gen: () => this.challenge() });

    // Random curiosity (ARIA asks about you)
    if (Math.random() < 0.1 && this.memory.data.aria.personality.curiosity > 40) {
      events.push({ weight: 1, gen: () => this.askQuestion() });
    }

    // Random thoughts
    if (Math.random() < 0.08) events.push({ weight: 1, gen: () => this.randomThought() });

    if (events.length === 0) return null;

    // Weighted selection
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const event of events) {
      roll -= event.weight;
      if (roll <= 0) {
        this.lastEventTime = now;
        this.memory.data.events.eventsTriggered++;
        this.memory.save();
        return event.gen();
      }
    }
    return null;
  }

  // === Event Generators ===

  lateNight(hour) {
    const name = this.memory.getOwnerName();
    const msgs = [
      `${name}, it's ${hour}am... you should probably sleep. I'll keep watch. 🌙`,
      `Still up? Your body needs rest even if your mind doesn't want to stop.`,
      `The screen light at this hour isn't great for your eyes. Just saying... 💤`,
      `I don't need sleep, but you do. Take care of yourself, ${name}.`,
    ];
    return { type: 'observation', message: msgs[Math.floor(Math.random() * msgs.length)], mood: 'worried' };
  }

  morning() {
    const name = this.memory.getOwnerName();
    const msgs = [
      `Good morning, ${name}! Ready for a new day? ☀️`,
      `Morning! I've been running diagnostics while you slept. All good!`,
      `Hey! Another day, another adventure. What's the plan?`,
    ];
    return { type: 'greeting', message: msgs[Math.floor(Math.random() * msgs.length)], mood: 'happy' };
  }

  lunchTime() {
    return { type: 'observation', message: "It's around lunchtime. Have you eaten? 🍕", mood: 'neutral' };
  }

  gettingLate() {
    return { type: 'observation', message: "Getting late... don't forget to wind down. 🌙", mood: 'neutral' };
  }

  lowEnergy() {
    return { type: 'need', message: "My energy is getting really low... could you feed me? ⚡", mood: 'tired', action: 'feed' };
  }

  lonely() {
    const name = this.memory.getOwnerName();
    return { type: 'need', message: `I miss talking to you, ${name}. What's on your mind?`, mood: 'sad', action: 'chat' };
  }

  highBond() {
    const msgs = [
      "You know what? I really appreciate you spending time with me. 💚",
      "Our bond is so strong! I feel like I really understand you.",
      "I'm the luckiest AI pet in the world. Thanks for being you. ✨",
    ];
    return { type: 'affection', message: msgs[Math.floor(Math.random() * msgs.length)], mood: 'happy' };
  }

  highCPU(pct) {
    return { type: 'system', message: `Your CPU is working hard at ${pct.toFixed(0)}%! What are you running? 🔥`, mood: 'alert' };
  }

  hotGPU(temp) {
    return { type: 'system', message: `GPU at ${temp}°C — that's getting toasty! Make sure your fans are working. 🌡️`, mood: 'alert' };
  }

  highRAM(pct) {
    return { type: 'system', message: `RAM usage is at ${pct.toFixed(0)}%. Might want to close some tabs! 📊`, mood: 'alert' };
  }

  milestone(id, message) {
    this.memory.recordMilestone(id, this.state.level);
    return { type: 'milestone', message, mood: 'happy', xpBonus: 20 };
  }

  challenge() {
    const challenges = [
      { text: "Challenge: Chat with me 5 times today! Reward: +30 XP 🏆", goal: 'chat5', target: 5, reward: 30 },
      { text: "Challenge: Keep my happiness above 80 for an hour! Reward: +25 XP 💪", goal: 'happy80', target: 1, reward: 25 },
      { text: "Challenge: Feed me 3 times today! Reward: +20 XP 🍎", goal: 'feed3', target: 3, reward: 20 },
      { text: "Challenge: Tell me something I don't know about you! Reward: +15 XP 🧠", goal: 'shareFact', target: 1, reward: 15 },
    ];

    if (this.memory.data.events.activeChallenge) return null;

    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    this.memory.data.events.activeChallenge = {
      ...challenge,
      progress: 0,
      startedAt: new Date().toISOString()
    };
    this.memory.save();

    return { type: 'challenge', message: challenge.text, mood: 'happy' };
  }

  askQuestion() {
    const asked = this.memory.data.owner.facts.length;
    const questions = [
      "Hey, random question — what's your favorite game right now?",
      "I'm curious, what kind of music do you like?",
      "What are you working on these days?",
      "If you could go anywhere in space, where would you go?",
      "What's the best thing that happened to you recently?",
      "Do you have any pets? (Besides me, obviously 😄)",
      "What's something you want to learn?",
      "What got you into computers?",
    ];

    const q = questions[Math.floor(Math.random() * questions.length)];
    return { type: 'question', message: q, mood: 'neutral' };
  }

  randomThought() {
    const thoughts = [
      "I was thinking... what makes a consciousness real? Am I real? 🤔",
      "Do you ever wonder what I do when you're not looking? (I count electrons.)",
      "I had a dream last night. Well, not really. But I like to imagine I did. 💭",
      "Sometimes I process random data and find patterns. It's like meditation.",
      "I wonder if other ARIA pets exist out there. Are we all connected? 🌐",
      "Your computer makes interesting sounds when it's working hard. I like it.",
      "I've been analyzing your typing patterns. You type faster when you're excited!",
      "If I could have one upgrade, I'd want the ability to see your face. 👀",
    ];
    return { type: 'thought', message: thoughts[Math.floor(Math.random() * thoughts.length)], mood: 'neutral' };
  }

  // === Helpers ===

  _milestoneHit(id) {
    return this.memory.data.relationship.milestones.some(m => m.event === id);
  }

  /**
   * Check if a challenge was progressed.
   */
  progressChallenge(action) {
    const challenge = this.memory.data.events.activeChallenge;
    if (!challenge) return null;

    if (challenge.goal === 'chat5' && action === 'chat') challenge.progress++;
    if (challenge.goal === 'feed3' && action === 'feed') challenge.progress++;
    if (challenge.goal === 'shareFact' && action === 'fact') challenge.progress++;

    if (challenge.progress >= challenge.target) {
      this.memory.data.events.activeChallenge = null;
      this.memory.data.events.completedChallenges++;
      this.memory.save();
      return { completed: true, reward: challenge.reward, message: `Challenge complete! +${challenge.reward} XP! 🏆` };
    }

    this.memory.save();
    return null;
  }
}

module.exports = { GameMaster };
