const test = require("node:test");
const assert = require("node:assert/strict");
const { createGameManager } = require("../server/gameManager");
const { joinRoom, getPublicRoom } = require("../server/roomManager");
const { getWordChoices, normalizeWord } = require("../server/wordManager");
const { Room, Game, Player } = require("../server/models");

function setup(t) {
  const rooms = new Map();
  const identities = new Map();
  const sockets = new Map();
  const events = [];
  const io = {
    to: (room) => ({
      emit: (event, payload) => events.push({ room, event, payload }),
    }),
    sockets: { adapter: { rooms: new Map() }, sockets },
  };
  const manager = createGameManager(io, rooms, identities);
  t.after(() => {
    for (const room of rooms.values()) room.destroy();
  });
  function client(id) {
    const handlers = new Map();
    const received = [];
    const socket = {
      id,
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, payload) => received.push({ event, payload }),
      join() {},
      leave() {},
      to: io.to,
    };
    sockets.set(id, socket);
    manager.register(socket);
    return {
      received,
      fire: (event, ...args) => handlers.get(event)(...args),
      request: (event, payload) => {
        let result;
        if (payload === undefined)
          handlers.get(event)((response) => {
            result = response;
          });
        else
          handlers.get(event)(payload, (response) => {
            result = response;
          });
        return result;
      },
    };
  }
  const host = client("host");
  const created = host.request("create_room", {
    name: "Host",
    playerId: "host",
    settings: { rounds: 2 },
  });
  const room = rooms.get(created.roomCode);
  function join(id, spectator = false) {
    const c = client(id);
    assert.equal(
      c.request("join_room", {
        roomCode: room.code,
        name: id,
        playerId: id,
        spectator,
      }).ok,
      true,
    );
    return c;
  }
  return { rooms, room, host, join, client, events };
}

test('public search waits for a room created during its 20-second window', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { client, rooms } = setup(t);
  const seeker = client('seeker');
  const replies = [];
  seeker.fire('join_public_room', { name: 'Seeker', playerId: 'seeker' }, (result) => replies.push(result));
  t.mock.timers.tick(15000);
  assert.equal(replies.length, 0);
  const host = client('public-host');
  const created = host.request('create_room', { name: 'Public host', playerId: 'public-host', settings: { isPublic: true } });
  t.mock.timers.tick(250);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, true);
  assert.equal(replies[0].roomCode, created.roomCode);
  assert.equal(rooms.get(created.roomCode).players.has('seeker'), true);
  t.mock.timers.tick(20000);
  assert.equal(replies.length, 1);
});

test('public search times out once after 20 seconds without joining private rooms', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { client } = setup(t);
  const replies = [];
  client('seeker').fire('join_public_room', { name: 'Seeker', playerId: 'seeker' }, (result) => replies.push(result));
  t.mock.timers.tick(19999);
  assert.equal(replies.length, 0);
  t.mock.timers.tick(1);
  assert.equal(replies.length, 1);
  assert.match(replies[0].error, /20 seconds/);
  t.mock.timers.tick(20000);
  assert.equal(replies.length, 1);
});

test('cancelled and disconnected searches cannot join future rooms', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { client, rooms } = setup(t);
  const seeker = client('seeker');
  const disconnected = client('disconnected');
  const replies = [];
  seeker.fire('join_public_room', { name: 'Seeker', playerId: 'seeker' }, (result) => replies.push(result));
  seeker.request('cancel_public_search');
  disconnected.fire('join_public_room', { name: 'Disconnected', playerId: 'disconnected' }, () => assert.fail('Disconnected search returned a result'));
  disconnected.fire('disconnect');
  const created = client('public-host').request('create_room', { name: 'Public host', playerId: 'public-host', settings: { isPublic: true } });
  t.mock.timers.tick(21000);
  assert.equal(rooms.get(created.roomCode).players.size, 1);
  assert.equal(replies.length, 1);
  assert.match(replies[0].error, /cancelled/);
});

test("readiness is required and spectators never enter turn order or score", (t) => {
  const { room, host, join } = setup(t);
  const guest = join("Guest");
  const watcher = join("Watcher", true);
  assert.match(host.request("start_game").error, /ready/);
  assert.equal(watcher.request("set_ready", { ready: true }).ok, false);
  guest.request("set_ready", { ready: true });
  assert.equal(host.request("start_game").ok, true);
  assert.deepEqual(room.turnOrder, ["host", "Guest"]);
  assert.equal(room instanceof Room, true);
  assert.equal(room instanceof Game, true);
  assert.equal(room.players.get("Guest") instanceof Player, true);
  const word = room.wordChoices[0];
  host.request("choose_word", { word });
  watcher.fire("guess", { text: word });
  assert.equal(room.players.get("Watcher").score, 0);
  assert.equal(room.turnEnding, false);
});

test("ban prevents rejoin with the same identity or normalized name", (t) => {
  const { rooms, room, host, join } = setup(t);
  join("Guest");
  assert.equal(
    host.request("kick_player", { playerId: "Guest", ban: true }).ok,
    true,
  );
  assert.throws(
    () => joinRoom(rooms, room.code, "new", "Fresh name", "Guest"),
    /banned/,
  );
  assert.throws(
    () => joinRoom(rooms, room.code, "new", " guest ", "new-token"),
    /banned/,
  );
});

test("kick votes count each connected player once and require a majority", (t) => {
  const { room, host, join } = setup(t);
  const a = join("A");
  join("B");
  join("Target");
  host.request("vote_kick", { playerId: "Target" });
  host.request("vote_kick", { playerId: "Target" });
  assert.equal(room.kickVotes.get("Target").size, 1);
  a.request("vote_kick", { playerId: "Target" });
  assert.equal(room.players.has("Target"), true);
  const c = join("C");
  c.request("vote_kick", { playerId: "Target" });
  assert.equal(room.players.has("Target"), false);
});

test("canvas snapshot restores strokes, undo/clear update server state, replay is only revealed at round end", (t) => {
  const { room, host, join, client, events } = setup(t);
  const guest = join("Guest");
  guest.request("set_ready", { ready: true });
  host.request("start_game");
  const word = room.wordChoices[0];
  host.request("choose_word", { word });
  const point = { x: 0.1, y: 0.2, color: "#000000", size: 0.01 };
  host.fire("draw_start", point);
  host.fire("draw_move", { ...point, x: 0.3 });
  host.fire("draw_end", point);
  assert.equal(room.strokes[0].points.length, 2);
  const resumed = client("guest-new");
  resumed.request("resume_room", { roomCode: room.code, playerId: "Guest" });
  assert.equal(
    resumed.received.find((e) => e.event === "canvas_snapshot").payload.strokes
      .length,
    1,
  );
  assert.equal(
    events.some((event) => event.event === "replay_available"),
    false,
  );
  host.fire("undo_drawing");
  assert.equal(room.strokes.length, 0);
  host.fire("draw_start", point);
  host.fire("clear_canvas");
  assert.equal(room.strokes.length, 0);
  host.fire("draw_start", point);
  host.fire("draw_end", point);
  guest.fire("guess", { text: word });
  assert.equal(room.lastReplay.word, word);
  assert.equal(room.lastReplay.strokes.length, 1);
  assert.equal(
    events.some((event) => event.event === "replay_available"),
    true,
  );
  assert.equal("selectedWord" in getPublicRoom(room), false);
});

test("word choices support Hindi, categories, custom words and Unicode matching", () => {
  const hindi = getWordChoices(5, [], "hi", "Animals");
  assert.equal(hindi.length, 5);
  assert.ok(hindi.every((word) => /[\u0900-\u097f]/.test(word)));
  assert.equal(normalizeWord("  हाथी  "), "हाथी");
  assert.equal(getWordChoices(8, [], "en", "Food").includes("Elephant"), false);
  assert.equal(
    getWordChoices(100, ["Unique Custom"], "en", "Food").includes(
      "Unique Custom",
    ),
    true,
  );
});

test("reports are delivered to the room host", (t) => {
  const { host, join, room } = setup(t);
  const guest = join("Guest");
  assert.equal(
    guest.request("report_player", {
      playerId: "host",
      reason: "Offensive drawing",
    }).ok,
    true,
  );
  assert.equal(room.reports.length, 1);
  assert.equal(
    host.received.some((entry) => entry.event === "player_report"),
    true,
  );
});
