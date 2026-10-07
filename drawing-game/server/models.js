class Player {
  constructor(id, name, avatar, isHost = false, spectator = false) {
    Object.assign(this, {
      id,
      name,
      avatar,
      isHost,
      spectator,
      ready: isHost,
      connected: true,
      score: 0,
      guessedCorrectly: false,
    });
  }
  resetScore() {
    this.score = 0;
    this.guessedCorrectly = false;
  }
}

class Game {
  constructor(settings) {
    Object.assign(this, {
      status: "lobby",
      currentDrawerId: null,
      currentRound: 0,
      totalRounds: settings.rounds,
      selectedWord: null,
      wordChoices: [],
      hint: null,
      turnEndsAt: null,
      turnEnding: false,
      guessedPlayerIds: new Set(),
      turnOrder: [],
      turnIndex: -1,
      timer: null,
      transitionTimer: null,
      strokes: [],
      currentStroke: null,
      lastReplay: null,
      hintRevealCount: 0,
    });
  }
  resetCanvas() {
    this.strokes = [];
    this.currentStroke = null;
  }
  stopTimers() {
    clearInterval(this.timer);
    clearTimeout(this.transitionTimer);
    this.timer = null;
    this.transitionTimer = null;
  }
}

class Room extends Game {
  constructor(code, host, settings) {
    super(settings);
    Object.assign(this, {
      code,
      hostId: host.id,
      players: new Map([[host.id, host]]),
      settings,
      disconnectTimers: new Map(),
      bannedIds: new Set(),
      bannedNames: new Set(),
      kickVotes: new Map(),
      reports: [],
      createdAt: Date.now(),
    });
  }
  activePlayers() {
    return [...this.players.values()].filter(
      (player) => player.connected && !player.spectator,
    );
  }
  destroy() {
    this.stopTimers();
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
  }
}

module.exports = { Player, Game, Room };
