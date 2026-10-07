const { getWordChoices, normalizeWord } = require("./wordManager");
const { scoreCorrectGuess, scoreDrawer } = require("./scoring");
const {
  getPublicRoom,
  createRoom,
  joinRoom,
  getJoinablePublicRoom,
  listPublicRooms,
} = require("./roomManager");

const ROUND_SECONDS = 60;
const DISCONNECT_GRACE_MS = 60000;

function sanitizeDrawing(payload) {
  if (!payload || typeof payload !== "object") return null;
  const color = /^#[0-9a-f]{6}$/i.test(payload.color)
    ? payload.color
    : "#1f2937";
  const size = Math.max(0.001, Math.min(0.1, Number(payload.size) || 0.01));
  const point = (value) =>
    Number.isFinite(Number(value))
      ? Math.max(0, Math.min(1, Number(value)))
      : null;
  const x = point(payload.x);
  const y = point(payload.y);
  if (x === null || y === null) return null;
  return {
    x,
    y,
    color,
    size,
    tool: payload.tool === "eraser" ? "eraser" : "brush",
  };
}

function createGameManager(io, rooms, socketPlayers) {
  const publicSearches = new Map();
  function cancelPublicSearch(socketId, notify = false) {
    const search = publicSearches.get(socketId);
    if (!search) return;
    clearInterval(search.poll);
    clearTimeout(search.timeout);
    publicSearches.delete(socketId);
    if (notify) search.callback({ ok: false, error: "Room search cancelled." });
  }
  function emitRoom(room) {
    io.to(room.code).emit("room_updated", getPublicRoom(room));
  }

  function emitPrivateState(room) {
    for (const player of room.players.values()) {
      const sockets = io.sockets.adapter.rooms.get(room.code);
      if (!sockets) continue;
      for (const socketId of sockets) {
        const socket = io.sockets.sockets.get(socketId);
        if (socketPlayers.get(socketId)?.playerId !== player.id) continue;
        socket.emit("game_state", {
          ...getPublicRoom(room),
          isDrawer: room.currentDrawerId === player.id,
          word: room.currentDrawerId === player.id ? room.selectedWord : null,
          hint:
            room.selectedWord && room.currentDrawerId !== player.id
              ? room.hint
              : null,
          wordChoices:
            room.currentDrawerId === player.id ? room.wordChoices : [],
        });
      }
    }
  }

  function makeHint(word, revealCount) {
    let revealed = 0;
    const characters = [
      ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        word,
      ),
    ].map((entry) => entry.segment);
    return characters
      .map((character) => {
        if (!/\p{L}/u.test(character)) return character;
        if (revealed < revealCount) {
          revealed += 1;
          return character;
        }
        return "_";
      })
      .join(" ");
  }

  function updateHint(room, secondsRemaining) {
    if (
      !room.selectedWord ||
      room.settings.wordMode === "hidden" ||
      room.settings.hintCount <= 0
    )
      return;
    const elapsed = room.settings.drawTime - secondsRemaining;
    const interval = room.settings.drawTime / (room.settings.hintCount + 1);
    const revealCount = Math.max(
      0,
      Math.min(room.settings.hintCount, Math.floor(elapsed / interval)),
    );
    if (revealCount <= room.hintRevealCount) return;
    room.hintRevealCount = revealCount;
    room.hint = makeHint(room.selectedWord, revealCount);
    emitPrivateState(room);
  }

  function getRoomWordChoices(room) {
    if (room.settings.wordMode !== "combination")
      return getWordChoices(
        room.settings.wordCount,
        room.settings.customWords,
        room.settings.language,
        room.settings.category,
      );
    return getWordChoices(
      room.settings.wordCount * 2,
      room.settings.customWords,
      room.settings.language,
      room.settings.category,
    )
      .reduce((pairs, word, index, words) => {
        if (index % 2 === 0 && words[index + 1])
          pairs.push(`${word} ${words[index + 1]}`);
        return pairs;
      }, [])
      .slice(0, room.settings.wordCount);
  }

  function clearTimer(room) {
    if (room.timer) clearInterval(room.timer);
    room.timer = null;
  }

  function startRoom(socket, room) {
    if (room.hostId !== socketPlayers.get(socket.id)?.playerId)
      throw new Error("Only the host can start the game.");
    const activePlayers = room.activePlayers();
    if (room.status !== "lobby")
      throw new Error("This game has already started.");
    if (activePlayers.length < 2)
      throw new Error("At least two players are needed to start.");
    if (activePlayers.some((player) => !player.ready))
      throw new Error("Every player must be ready before starting.");
    room.status = "playing";
    room.totalRounds = room.settings.rounds;
    room.currentRound = 1;
    room.turnOrder = activePlayers.map((player) => player.id);
    room.turnIndex = -1;
    room.players.forEach((player) => player.resetScore());
    io.to(room.code).emit("game_started", { totalRounds: room.totalRounds });
    advanceTurn(room);
  }

  function advanceTurn(room) {
    clearTimer(room);
    room.selectedWord = null;
    room.wordChoices = [];
    room.hint = null;
    room.hintRevealCount = 0;
    room.turnEnding = false;
    room.guessedPlayerIds.clear();
    room.turnEndsAt = null;
    room.resetCanvas();
    let nextIndex = room.turnIndex + 1;
    while (
      nextIndex < room.turnOrder.length &&
      !room.players.get(room.turnOrder[nextIndex])?.connected
    )
      nextIndex += 1;
    if (nextIndex >= room.turnOrder.length) {
      room.currentRound += 1;
      if (room.currentRound > room.totalRounds) return endGame(room);
      room.turnIndex = -1;
      nextIndex = 0;
      while (
        nextIndex < room.turnOrder.length &&
        !room.players.get(room.turnOrder[nextIndex])?.connected
      )
        nextIndex += 1;
      if (nextIndex >= room.turnOrder.length) return endGame(room);
    }
    room.turnIndex = nextIndex;
    room.currentDrawerId = room.turnOrder[room.turnIndex];
    room.players.forEach((player) => {
      player.guessedCorrectly = false;
    });
    room.wordChoices = getRoomWordChoices(room);
    io.to(room.code).emit("turn_changed", {
      currentDrawerId: room.currentDrawerId,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
    });
    io.to(room.code).emit("clear_canvas");
    emitRoom(room);
    emitPrivateState(room);
    io.to(room.code).emit("choose_word_prompt", {
      drawerId: room.currentDrawerId,
    });
  }

  function selectWord(socket, room, word) {
    const playerId = socketPlayers.get(socket.id)?.playerId;
    if (
      room.status !== "playing" ||
      playerId !== room.currentDrawerId ||
      !room.wordChoices.includes(String(word))
    ) {
      throw new Error("That word choice is not available.");
    }
    room.selectedWord = String(word);
    room.wordChoices = [];
    room.hintRevealCount = 0;
    room.hint =
      room.settings.wordMode === "hidden"
        ? null
        : makeHint(room.selectedWord, 0);
    room.turnEndsAt = Date.now() + room.settings.drawTime * 1000;
    emitPrivateState(room);
    io.to(room.code).emit("round_started", {
      currentDrawerId: room.currentDrawerId,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      duration: room.settings.drawTime,
      endsAt: room.turnEndsAt,
    });
    room.timer = setInterval(() => {
      const secondsRemaining = Math.max(
        0,
        Math.ceil((room.turnEndsAt - Date.now()) / 1000),
      );
      updateHint(room, secondsRemaining);
      io.to(room.code).emit("timer_update", {
        secondsRemaining,
        endsAt: room.turnEndsAt,
      });
      if (secondsRemaining <= 0) endTurn(room, "time_up");
    }, 1000);
  }

  function handleGuess(socket, room, value) {
    const playerId = socketPlayers.get(socket.id)?.playerId;
    const player = room.players.get(playerId);
    const guessText = String(value || "")
      .trim()
      .slice(0, 120);
    if (
      !player ||
      player.spectator ||
      room.status !== "playing" ||
      room.turnEnding ||
      !room.selectedWord ||
      playerId === room.currentDrawerId ||
      !guessText
    )
      return;
    if (player.guessedCorrectly) {
      socket.emit("guess_rejected", {
        message: "You already found the word this turn.",
      });
      return;
    }
    const isCorrect =
      normalizeWord(guessText) === normalizeWord(room.selectedWord);
    if (isCorrect) {
      player.guessedCorrectly = true;
      room.guessedPlayerIds.add(playerId);
      const secondsRemaining = Math.max(
        0,
        (room.turnEndsAt - Date.now()) / 1000,
      );
      const points = scoreCorrectGuess(
        secondsRemaining,
        room.settings.drawTime,
      );
      player.score += points;
      const drawer = room.players.get(room.currentDrawerId);
      if (drawer) drawer.score += scoreDrawer(1);
      io.to(room.code).emit("correct_guess", {
        playerId,
        playerName: player.name,
        points,
      });
      emitRoom(room);
      emitPrivateState(room);
      const guessers = room
        .activePlayers()
        .filter((entry) => entry.id !== room.currentDrawerId);
      if (
        guessers.length > 0 &&
        guessers.every((entry) => entry.guessedCorrectly)
      )
        endTurn(room, "all_guessed");
      return;
    }
    io.to(room.code).emit("chat_message", {
      playerId: player.id,
      playerName: player.name,
      text: guessText,
      kind: "guess",
      timestamp: Date.now(),
    });
  }

  function handleDrawing(socket, eventName, payload) {
    const identity = socketPlayers.get(socket.id);
    const room = identity && rooms.get(identity.roomCode);
    if (
      !room ||
      room.status !== "playing" ||
      room.turnEnding ||
      !room.selectedWord ||
      room.currentDrawerId !== identity.playerId
    )
      return;
    const safePayload = sanitizeDrawing(payload);
    if (!safePayload) return;
    if (eventName === "draw_start") {
      if (room.strokes.length >= 1500) return;
      room.currentStroke = {
        color: safePayload.color,
        size: safePayload.size,
        tool: safePayload.tool,
        points: [{ x: safePayload.x, y: safePayload.y }],
      };
      room.strokes.push(room.currentStroke);
    } else if (eventName === "draw_move") {
      if (!room.currentStroke || room.currentStroke.points.length >= 5000)
        return;
      room.currentStroke.points.push({ x: safePayload.x, y: safePayload.y });
    } else room.currentStroke = null;
    socket
      .to(room.code)
      .emit(eventName, { ...safePayload, playerId: identity.playerId });
  }

  function handleChat(socket, room, message) {
    const player = room.players.get(socketPlayers.get(socket.id)?.playerId);
    const text = String(message || "")
      .replace(/[<>\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 120);
    if (!player || !text || room.status === "ended") return;
    if (player.spectator && room.status === "playing" && !room.turnEnding)
      return;
    if (
      room.status === "playing" &&
      !room.turnEnding &&
      room.selectedWord &&
      player.id !== room.currentDrawerId &&
      !player.guessedCorrectly
    )
      return handleGuess(socket, room, text);
    io.to(room.code).emit("chat_message", {
      playerId: player.id,
      playerName: player.name,
      text,
      kind: "chat",
      timestamp: Date.now(),
    });
  }

  function endTurn(room, reason) {
    if (room.status !== "playing" || room.turnEnding) return;
    room.turnEnding = true;
    clearTimer(room);
    room.lastReplay = {
      word: room.selectedWord,
      strokes: structuredClone(room.strokes),
    };
    io.to(room.code).emit("replay_available", room.lastReplay);
    io.to(room.code).emit("round_ended", {
      reason,
      word: room.selectedWord,
      scores: [...room.players.values()].map(({ id, score }) => ({
        id,
        score,
      })),
    });
    room.transitionTimer = setTimeout(() => {
      if (rooms.get(room.code) === room && room.status === "playing")
        advanceTurn(room);
    }, 2500);
  }

  function endGame(room) {
    clearTimer(room);
    room.status = "ended";
    room.currentDrawerId = null;
    room.selectedWord = null;
    room.hint = null;
    const leaderboard = [...room.players.values()]
      .filter((player) => !player.spectator)
      .map(({ id, name, score }) => ({ id, name, score }))
      .sort((left, right) => right.score - left.score);
    io.to(room.code).emit("game_over", {
      leaderboard,
      winner: leaderboard[0] || null,
    });
    emitRoom(room);
    emitPrivateState(room);
  }

  function rejoin(socket, room, player) {
    const previousTimer = room.disconnectTimers.get(player.id);
    if (previousTimer) clearTimeout(previousTimer);
    room.disconnectTimers.delete(player.id);
    player.connected = true;
    socketPlayers.set(socket.id, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);
    socket.emit("joined_room", {
      roomCode: room.code,
      playerId: player.id,
      reconnected: true,
    });
    socket.emit("canvas_snapshot", { strokes: room.strokes });
    if (room.lastReplay) socket.emit("replay_available", room.lastReplay);
    if (room.turnEnding && room.status === "playing")
      socket.emit("round_ended", {
        reason: "resumed",
        word: room.selectedWord,
      });
    emitRoom(room);
    emitPrivateState(room);
    return true;
  }

  function disconnect(socket) {
    cancelPublicSearch(socket.id);
    const identity = socketPlayers.get(socket.id);
    socketPlayers.delete(socket.id);
    if (!identity) return;
    const room = rooms.get(identity.roomCode);
    const player = room?.players.get(identity.playerId);
    if (!room || !player) return;
    // Page navigation can connect the lobby before the home socket closes.
    const hasActiveSocket = [...socketPlayers.values()].some(
      (entry) =>
        entry.roomCode === identity.roomCode &&
        entry.playerId === identity.playerId,
    );
    if (hasActiveSocket) return;
    player.connected = false;
    emitRoom(room);
    const timer = setTimeout(() => {
      if (player.connected || rooms.get(room.code) !== room) return;
      if (player.isHost) {
        const successor = room
          .activePlayers()
          .find((candidate) => candidate.id !== player.id);
        room.hostId = successor?.id || null;
        room.players.forEach((candidate) => {
          candidate.isHost = candidate.id === successor?.id;
        });
      }
      room.players.delete(player.id);
      for (const voters of room.kickVotes.values()) voters.delete(player.id);
      room.kickVotes.delete(player.id);
      if (room.players.size === 0) {
        room.destroy();
        rooms.delete(room.code);
        return;
      }
      if (room.status === "playing" && room.activePlayers().length < 2)
        endGame(room);
      else if (room.status === "playing" && room.currentDrawerId === player.id)
        endTurn(room, "drawer_disconnected");
      else emitRoom(room);
    }, DISCONNECT_GRACE_MS);
    room.disconnectTimers.set(player.id, timer);
  }

  function register(socket) {
    socket.on(
      "create_room",
      ({ name, playerId, settings, avatar } = {}, callback = () => {}) => {
        try {
          const identity = playerId || socket.id;
          const { room, player } = createRoom(
            rooms,
            socket.id,
            name,
            identity,
            settings,
            avatar,
          );
          socketPlayers.set(socket.id, {
            roomCode: room.code,
            playerId: player.id,
          });
          socket.join(room.code);
          callback({ ok: true, roomCode: room.code, playerId: player.id });
          emitRoom(room);
        } catch (error) {
          callback({ ok: false, error: error.message });
        }
      },
    );

    socket.on("list_public_rooms", (callback = () => {}) =>
      callback({ ok: true, rooms: listPublicRooms(rooms) }),
    );

    socket.on(
      "join_public_room",
      ({ name, playerId, avatar } = {}, callback = () => {}) => {
        cancelPublicSearch(socket.id, true);
        if (!String(name || "").trim())
          return callback({ ok: false, error: "Enter a player name first." });
        function tryJoin() {
          const room = getJoinablePublicRoom(rooms);
          if (!room) return false;
          cancelPublicSearch(socket.id);
          try {
            const identity = playerId || socket.id;
            const joined = joinRoom(
              rooms,
              room.code,
              socket.id,
              name,
              identity,
              avatar,
            );
            socketPlayers.set(socket.id, {
              roomCode: joined.room.code,
              playerId: joined.player.id,
            });
            socket.join(joined.room.code);
            callback({
              ok: true,
              roomCode: joined.room.code,
              playerId: joined.player.id,
            });
            io.to(joined.room.code).emit("player_joined", {
              playerId: joined.player.id,
              playerName: joined.player.name,
            });
            emitRoom(joined.room);
          } catch (error) {
            callback({ ok: false, error: error.message });
          }
          return true;
        }
        if (tryJoin()) return;
        const poll = setInterval(tryJoin, 250);
        const timeout = setTimeout(() => {
          cancelPublicSearch(socket.id);
          callback({
            ok: false,
            error:
              "No open room was available within 20 seconds. Try again or create a public room.",
          });
        }, 20000);
        poll.unref?.();
        timeout.unref?.();
        publicSearches.set(socket.id, { poll, timeout, callback });
      },
    );
    socket.on("cancel_public_search", (callback = () => {}) => {
      cancelPublicSearch(socket.id, true);
      callback({ ok: true });
    });

    socket.on(
      "join_room",
      (
        { roomCode, name, playerId, avatar, spectator } = {},
        callback = () => {},
      ) => {
        try {
          const normalizedCode = String(roomCode || "")
            .trim()
            .toUpperCase();
          const existingRoom = rooms.get(normalizedCode);
          if (playerId && existingRoom?.players.has(playerId)) {
            rejoin(socket, existingRoom, existingRoom.players.get(playerId));
            callback({
              ok: true,
              roomCode: existingRoom.code,
              playerId,
              reconnected: true,
            });
            return;
          }
          const identity = playerId || socket.id;
          const { room, player } = joinRoom(
            rooms,
            roomCode,
            socket.id,
            name,
            identity,
            avatar,
            spectator,
          );
          socketPlayers.set(socket.id, {
            roomCode: room.code,
            playerId: player.id,
          });
          socket.join(room.code);
          callback({ ok: true, roomCode: room.code, playerId: player.id });
          io.to(room.code).emit("player_joined", {
            playerId: player.id,
            playerName: player.name,
          });
          emitRoom(room);
          emitPrivateState(room);
          socket.emit("canvas_snapshot", { strokes: room.strokes });
          if (room.lastReplay) socket.emit("replay_available", room.lastReplay);
        } catch (error) {
          callback({ ok: false, error: error.message });
        }
      },
    );

    socket.on(
      "resume_room",
      ({ roomCode, playerId } = {}, callback = () => {}) => {
        const room = rooms.get(String(roomCode || "").toUpperCase());
        const player = room?.players.get(playerId);
        if (!room || !player) {
          callback({ ok: false, error: "That room session has expired." });
          return;
        }
        rejoin(socket, room, player);
        callback({ ok: true, roomCode: room.code, playerId });
      },
    );

    socket.on("start_game", (callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      try {
        if (!room) throw new Error("Join a room first.");
        startRoom(socket, room);
        callback({ ok: true });
      } catch (error) {
        callback({ ok: false, error: error.message });
      }
    });

    socket.on("choose_word", ({ word } = {}, callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      try {
        if (!room) throw new Error("Join a room first.");
        selectWord(socket, room, word);
        callback({ ok: true });
      } catch (error) {
        callback({ ok: false, error: error.message });
      }
    });

    for (const eventName of ["draw_start", "draw_move", "draw_end"])
      socket.on(eventName, (payload) =>
        handleDrawing(socket, eventName, payload),
      );
    socket.on("clear_canvas", () => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (
        room?.status === "playing" &&
        !room.turnEnding &&
        room.selectedWord &&
        room.currentDrawerId === identity.playerId
      ) {
        room.resetCanvas();
        socket.to(room.code).emit("clear_canvas");
      }
    });
    socket.on("undo_drawing", () => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (
        room?.status === "playing" &&
        !room.turnEnding &&
        room.selectedWord &&
        room.currentDrawerId === identity.playerId
      ) {
        room.strokes.pop();
        room.currentStroke = null;
        socket.to(room.code).emit("undo_drawing");
      }
    });
    socket.on("guess", ({ text } = {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (room) handleGuess(socket, room, text);
    });
    socket.on("chat_message", ({ text } = {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (room) handleChat(socket, room, text);
    });
    socket.on("set_ready", ({ ready } = {}, callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      const player = room?.players.get(identity.playerId);
      if (!player || player.spectator || room.status !== "lobby")
        return callback({
          ok: false,
          error: "Only lobby players can change readiness.",
        });
      player.ready = Boolean(ready);
      emitRoom(room);
      callback({ ok: true });
    });

    function removePlayer(room, player, banned = false) {
      if (banned) {
        room.bannedIds.add(player.id);
        room.bannedNames.add(player.name.toLocaleLowerCase());
      }
      clearTimeout(room.disconnectTimers.get(player.id));
      room.disconnectTimers.delete(player.id);
      room.players.delete(player.id);
      room.kickVotes.delete(player.id);
      for (const voters of room.kickVotes.values()) voters.delete(player.id);
      for (const [socketId, entry] of socketPlayers.entries()) {
        if (entry.roomCode === room.code && entry.playerId === player.id) {
          io.sockets.sockets.get(socketId)?.emit("kicked", { banned });
          io.sockets.sockets.get(socketId)?.leave(room.code);
          socketPlayers.delete(socketId);
        }
      }
      if (room.status === "playing" && room.activePlayers().length < 2)
        endGame(room);
      else if (room.status === "playing" && room.currentDrawerId === player.id)
        endTurn(room, "drawer_removed");
      emitRoom(room);
      emitPrivateState(room);
    }

    socket.on("kick_player", ({ playerId, ban } = {}, callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (!room || room.hostId !== identity.playerId) {
        callback({ ok: false, error: "Only the host can remove players." });
        return;
      }
      const player = room.players.get(playerId);
      if (!player || player.isHost) {
        callback({ ok: false, error: "That player cannot be removed." });
        return;
      }
      removePlayer(room, player, Boolean(ban));
      callback({ ok: true });
    });

    socket.on("vote_kick", ({ playerId } = {}, callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      const voter = room?.players.get(identity.playerId);
      const target = room?.players.get(playerId);
      if (
        !voter ||
        !voter.connected ||
        voter.spectator ||
        !target ||
        target.isHost ||
        target.id === voter.id
      )
        return callback({ ok: false, error: "That kick vote is not allowed." });
      const votes = room.kickVotes.get(target.id) || new Set();
      votes.add(voter.id);
      room.kickVotes.set(target.id, votes);
      const active = room.activePlayers().map((player) => player.id);
      const count = [...votes].filter((id) => active.includes(id)).length;
      if (count >= Math.floor(active.length / 2) + 1)
        removePlayer(room, target);
      else emitRoom(room);
      callback({ ok: true });
    });

    socket.on(
      "report_player",
      ({ playerId, reason } = {}, callback = () => {}) => {
        const identity = socketPlayers.get(socket.id);
        const room = identity && rooms.get(identity.roomCode);
        const reporter = room?.players.get(identity.playerId);
        const target = room?.players.get(playerId);
        if (!reporter || !target || reporter.id === target.id)
          return callback({ ok: false, error: "That report is not allowed." });
        const report = {
          reporterName: reporter.name,
          playerName: target.name,
          reason: String(reason || "Unsporting behaviour")
            .trim()
            .slice(0, 160),
        };
        room.reports.push(report);
        room.reports = room.reports.slice(-50);
        for (const [socketId, entry] of socketPlayers.entries())
          if (entry.roomCode === room.code && entry.playerId === room.hostId)
            io.sockets.sockets.get(socketId)?.emit("player_report", report);
        callback({ ok: true });
      },
    );

    socket.on("leave_room", (callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      const player = room?.players.get(identity.playerId);
      if (player) {
        if (player.isHost) {
          const successor = room
            .activePlayers()
            .find((entry) => entry.id !== player.id);
          room.hostId = successor?.id || null;
          room.players.forEach((entry) => {
            entry.isHost = entry.id === room.hostId;
          });
        }
        removePlayer(room, player);
        if (!room.players.size) {
          room.destroy();
          rooms.delete(room.code);
        }
      }
      callback({ ok: true });
    });
    socket.on("play_again", (callback = () => {}) => {
      const identity = socketPlayers.get(socket.id);
      const room = identity && rooms.get(identity.roomCode);
      if (
        !room ||
        room.status !== "ended" ||
        room.hostId !== identity.playerId
      ) {
        callback({ ok: false, error: "Only the host can start another game." });
        return;
      }
      room.status = "lobby";
      room.currentRound = 0;
      room.currentDrawerId = null;
      room.selectedWord = null;
      room.turnEnding = false;
      room.players.forEach((player) => {
        player.resetScore();
        player.ready = player.isHost;
      });
      room.resetCanvas();
      emitRoom(room);
      callback({ ok: true });
    });
    socket.on("disconnect", () => disconnect(socket));
  }

  return { register };
}

module.exports = { createGameManager, ROUND_SECONDS, sanitizeDrawing };
