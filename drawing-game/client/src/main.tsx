import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  ArrowRight,
  Brush,
  Check,
  Copy,
  Eraser,
  Eye,
  Flag,
  LogOut,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldBan,
  Trash2,
  Undo2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import Canvas, { ReplayCanvas } from "./Canvas";
import "./style.css";
import type {
  AckResult,
  CanvasControls,
  CanvasSnapshot,
  ChatMessage,
  DrawingTool,
  GameProps,
  HomeProps,
  IconButtonProps,
  LobbyProps,
  ModalProps,
  Player,
  PlayerReport,
  PrivateState,
  ReplayData,
  RoomSettings,
  RoomState,
  RoundEnd,
  Session,
  SettingsProps,
} from "./types";

const socket = io(__GAME_SERVER_URL__ || undefined, { autoConnect: false });
const defaultSettings: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hintCount: 2,
  wordMode: "normal",
  language: "en",
  category: "All",
  isPublic: true,
  customWords: "",
};
const colors = [
  "#202526",
  "#e35b50",
  "#eea330",
  "#2e926c",
  "#2776c9",
  "#9257b4",
  "#ffffff",
];
const avatarColors = [
  "#f4bd77",
  "#9bcfbd",
  "#e7a2ab",
  "#a7bdea",
  "#cec1ed",
  "#a6dbe0",
  "#d1d887",
  "#edae85",
];

function IconButton({ label, icon: Icon, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="icon-button"
      {...props}
    >
      <Icon size={20} />
    </button>
  );
}
function Avatar({ index = 0, name = "" }) {
  return (
    <span
      className="avatar"
      style={{ backgroundColor: avatarColors[index % 8] }}
      aria-label={`${name || "Player"} avatar`}
    >
      <span className={`face face-${index % 4}`}>
        <i />
        <i />
        <b />
      </span>
    </span>
  );
}
function initialSession(): Session | null {
  const code = new URLSearchParams(location.search).get("room")?.toUpperCase();
  if (!code) return null;
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(`quickdraw:${code}`) || "null",
    );
    if (
      !saved ||
      typeof saved !== "object" ||
      !("playerId" in saved) ||
      typeof saved.playerId !== "string" ||
      !("name" in saved) ||
      typeof saved.name !== "string"
    )
      return null;
    return {
      roomCode: code,
      playerId: saved.playerId,
      name: saved.name,
      avatar:
        "avatar" in saved && typeof saved.avatar === "number"
          ? saved.avatar
          : 0,
    };
  } catch {
    return null;
  }
}
function App() {
  const [session, setSession] = useState(initialSession);
  const sessionRef = useRef(session);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [privateState, setPrivateState] = useState<PrivateState | null>(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState<CanvasSnapshot | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roundEnd, setRoundEnd] = useState<RoundEnd | null>(null);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [report, setReport] = useState<Player | null>(null);
  const [reportReason, setReportReason] = useState("");
  sessionRef.current = session;

  function request(
    event: string,
    payload?: unknown,
    onSuccess?: (result: AckResult) => void,
  ) {
    if (!socket.connected) {
      setError("Connecting to the game server. Please try again shortly.");
      return;
    }
    const callback = (timeoutError: Error | null, result?: AckResult) => {
      if (timeoutError || !result?.ok) {
        setError(
          timeoutError
            ? "The server did not respond. Please try again."
            : result?.error || "Request failed.",
        );
        return;
      }
      setError("");
      onSuccess?.(result);
    };
    if (payload === undefined) socket.timeout(10000).emit(event, callback);
    else socket.timeout(10000).emit(event, payload, callback);
  }
  useEffect(() => {
    const add = (message: ChatMessage) =>
      setMessages((items) => [...items.slice(-149), message]);
    const handlers = {
      connect: () => {
        setConnected(true);
        setError("");
        const saved = sessionRef.current;
        if (saved)
          request("resume_room", {
            roomCode: saved.roomCode,
            playerId: saved.playerId,
          });
      },
      disconnect: () => {
        setConnected(false);
        setError("Connection interrupted. Reconnecting...");
      },
      connect_error: () => {
        setConnected(false);
        setError("Cannot reach the game server. Retrying...");
      },
      room_updated: setRoom,
      game_state: setPrivateState,
      canvas_snapshot: setCanvasSnapshot,
      chat_message: add,
      correct_guess: ({
        playerName,
        points,
      }: {
        playerName: string;
        points: number;
      }) =>
        add({
          kind: "system",
          text: `${playerName} guessed the word! +${points}`,
        }),
      guess_rejected: ({ message }: { message: string }) => setError(message),
      round_ended: setRoundEnd,
      turn_changed: () => {
        setRoundEnd(null);
        setPrivateState(null);
        setCanvasSnapshot(null);
      },
      replay_available: setReplay,
      player_report: (data: PlayerReport) => {
        const text = `Report: ${data.playerName} by ${data.reporterName} - ${data.reason}`;
        add({ kind: "system", text });
        setError(text);
      },
      kicked: (data?: { banned?: boolean }) => {
        const saved = sessionRef.current;
        if (saved) sessionStorage.removeItem(`quickdraw:${saved.roomCode}`);
        sessionRef.current = null;
        setSession(null);
        setRoom(null);
        setPrivateState(null);
        history.replaceState({}, "", "/");
        setError(
          data?.banned
            ? "You were banned from that room."
            : "You left or were removed from the room.",
        );
      },
    };
    Object.entries(handlers).forEach(([event, handler]) =>
      socket.on(event, handler),
    );
    socket.connect();
    return () => {
      Object.entries(handlers).forEach(([event, handler]) =>
        socket.off(event, handler),
      );
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!session || !room) return;
    const page = room.gameStatus === "lobby" ? "lobby" : "game";
    history.replaceState({}, "", `/${page}?room=${session.roomCode}`);
    document.title = `Quickdraw | ${page === "lobby" ? "Lobby" : "Game"}`;
  }, [session, room?.gameStatus]);

  function enter(result: AckResult, name: string, avatar: number) {
    if (!result.roomCode || !result.playerId) {
      setError("The server returned an invalid room session.");
      return;
    }
    const saved = {
      playerId: result.playerId,
      roomCode: result.roomCode,
      name,
      avatar,
    };
    sessionStorage.setItem(
      `quickdraw:${result.roomCode}`,
      JSON.stringify(saved),
    );
    sessionRef.current = saved;
    setSession(saved);
    setMessages([]);
    setRoundEnd(null);
    setReplay(null);
    setCanvasSnapshot(null);
    request("resume_room", {
      roomCode: result.roomCode,
      playerId: result.playerId,
    });
  }
  function leave() {
    request("leave_room", undefined, () => {
      if (sessionRef.current)
        sessionStorage.removeItem(`quickdraw:${sessionRef.current.roomCode}`);
      sessionRef.current = null;
      setSession(null);
      setRoom(null);
      setPrivateState(null);
      setError("");
      history.replaceState({}, "", "/");
    });
  }
  const self = room?.players.find((player) => player.id === session?.playerId);
  const host = room?.hostId === session?.playerId;
  const isGame = session && room && room.gameStatus !== "lobby";
  function moderation(player: Player) {
    if (!room || !self) return null;
    if (player.id === self?.id) return null;
    const voted = room.votes
      ?.find((entry) => entry.playerId === player.id)
      ?.voterIds.includes(self?.id);
    return (
      <details className="player-menu">
        <summary
          aria-label={`Actions for ${player.name}`}
          title={`Actions for ${player.name}`}
        >
          <MoreVertical size={18} />
        </summary>
        <div className="menu">
          {host && !player.isHost && (
            <>
              <button
                onClick={() => request("kick_player", { playerId: player.id })}
              >
                <UserMinus size={16} />
                Kick
              </button>
              <button
                onClick={() =>
                  request("kick_player", { playerId: player.id, ban: true })
                }
              >
                <ShieldBan size={16} />
                Ban
              </button>
            </>
          )}
          {!self?.spectator && !player.isHost && (
            <button
              disabled={voted}
              onClick={() => request("vote_kick", { playerId: player.id })}
            >
              <Users size={16} />
              {voted ? "Vote added" : "Vote to kick"}
            </button>
          )}
          <button
            onClick={() => {
              setReport(player);
              setReportReason("");
            }}
          >
            <Flag size={16} />
            Report
          </button>
        </div>
      </details>
    );
  }
  return (
    <div className={isGame ? "app game-app" : "app"}>
      <header className="header">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            if (session) {
              event.preventDefault();
              leave();
            }
          }}
        >
          <Brush size={26} />
          <span>
            quickdraw<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="header-actions">
          <span
            className={`connection ${connected ? "online" : ""}`}
            role="status"
          >
            <i />
            {connected ? "Connected" : "Connecting"}
          </span>
          {session && (
            <IconButton label="Leave room" icon={LogOut} onClick={leave} />
          )}
        </div>
      </header>
      {error && (
        <div className="notice" role="alert">
          {error}
          <IconButton
            label="Dismiss message"
            icon={X}
            onClick={() => setError("")}
          />
        </div>
      )}
      {!session ? (
        <Home connected={connected} request={request} enter={enter} />
      ) : !room ? (
        <main className="loading">
          <h1>Connecting to your room...</h1>
          <button
            className="button secondary"
            onClick={() => {
              sessionStorage.removeItem(`quickdraw:${session.roomCode}`);
              sessionRef.current = null;
              setSession(null);
              history.replaceState({}, "", "/");
            }}
          >
            Back to home
          </button>
        </main>
      ) : room.gameStatus === "lobby" ? (
        <Lobby
          room={room}
          self={self}
          host={host}
          connected={connected}
          request={request}
          moderation={moderation}
          setError={setError}
        />
      ) : (
        <Game
          room={room}
          self={self}
          host={host}
          privateState={privateState}
          canvasSnapshot={canvasSnapshot}
          connected={connected}
          request={request}
          messages={messages}
          roundEnd={roundEnd}
          replay={replay}
          openReplay={() => setShowReplay(true)}
          moderation={moderation}
        />
      )}
      {showReplay && replay && (
        <Replay replay={replay} close={() => setShowReplay(false)} />
      )}
      {report && (
        <Modal title={`Report ${report.name}`} close={() => setReport(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              request(
                "report_player",
                { playerId: report.id, reason: reportReason },
                () => {
                  setReport(null);
                  setError("Report sent to the room host.");
                },
              );
            }}
          >
            <label>
              Reason
              <textarea
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                maxLength={160}
                required
              />
            </label>
            <button className="button primary" type="submit">
              <Flag size={18} />
              Send report
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Home({ connected, request, enter }: HomeProps) {
  const [name, setName] = useState(
    localStorage.getItem("quickdraw:name") || "",
  );
  const [avatar, setAvatar] = useState(
    Number(localStorage.getItem("quickdraw:avatar") || 0),
  );
  const [settings, setSettings] = useState(defaultSettings);
  const [roomCode, setRoomCode] = useState(
    new URLSearchParams(location.search).get("room") || "",
  );
  const [spectator, setSpectator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchDeadline, setSearchDeadline] = useState<number | null>(null);
  const [searchNow, setSearchNow] = useState(Date.now());
  const searchId = useRef(0);
  useEffect(() => {
    if (searchDeadline === null) return;
    const tick = setInterval(() => setSearchNow(Date.now()), 200);
    const disconnected = () => {
      searchId.current += 1;
      setSearchDeadline(null);
      setBusy(false);
    };
    socket.on("disconnect", disconnected);
    return () => {
      clearInterval(tick);
      socket.off("disconnect", disconnected);
      socket.emit("cancel_public_search");
    };
  }, [searchDeadline]);
  const [validation, setValidation] = useState("");
  function identity() {
    let id = sessionStorage.getItem("quickdraw:player");
    if (!id) {
      id =
        crypto.randomUUID?.() ||
        Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) =>
          part.toString(16),
        ).join("-");
      sessionStorage.setItem("quickdraw:player", id);
    }
    return id;
  }
  function submit(eventName: string, extra: Record<string, unknown> = {}) {
    if (!name.trim()) {
      setValidation("Enter your name first.");
      return;
    }
    if (eventName === "join_room" && !roomCode.trim()) {
      setValidation("Enter a room code.");
      return;
    }
    setValidation("");
    localStorage.setItem("quickdraw:name", name.trim());
    localStorage.setItem("quickdraw:avatar", String(avatar));
    setBusy(true);
    if (eventName === "join_public_room") {
      const id = ++searchId.current;
      setSearchNow(Date.now());
      setSearchDeadline(Date.now() + 20000);
      socket
        .timeout(25000)
        .emit(
          "join_public_room",
          { name: name.trim(), playerId: identity(), avatar },
          (timeoutError: Error | null, result?: AckResult) => {
            if (id !== searchId.current) return;
            setSearchDeadline(null);
            setBusy(false);
            if (timeoutError || !result?.ok) {
              setValidation(
                result?.error || "The room search timed out. Please try again.",
              );
              return;
            }
            enter(result, name.trim(), avatar);
          },
        );
      return;
    }
    request(
      eventName,
      { name: name.trim(), playerId: identity(), avatar, ...extra },
      (result) => enter(result, name.trim(), avatar),
    );
    setTimeout(() => setBusy(false), 1500);
  }
  return (
    <main className="home-layout">
      <section className="entry">
        <div className="section-heading">
          <p className="eyebrow">DRAWING ROOM</p>
          <h1>Quickdraw</h1>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("create_room", { settings });
          }}
        >
          <label>
            Your name
            <input
              id="player-name"
              autoComplete="nickname"
              maxLength={18}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <fieldset className="avatar-picker">
            <legend>Avatar</legend>
            <div className="avatar-options">
              {avatarColors.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Choose avatar ${index + 1}`}
                  aria-pressed={index === avatar}
                  className={index === avatar ? "chosen" : ""}
                  onClick={() => setAvatar(index)}
                >
                  <Avatar index={index} />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="segmented" aria-label="Room visibility">
            {[true, false].map((isPublic) => (
              <button
                key={String(isPublic)}
                type="button"
                aria-pressed={settings.isPublic === isPublic}
                onClick={() => setSettings({ ...settings, isPublic })}
              >
                {isPublic ? "Public" : "Private"}
              </button>
            ))}
          </div>
          <details className="settings" open={!settings.isPublic}>
            <summary>Room settings</summary>
            <Settings settings={settings} setSettings={setSettings} />
          </details>
          <button
            className="button primary full"
            type="submit"
            disabled={!connected || busy}
          >
            Create {settings.isPublic ? "public" : "private"} room
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="divider" />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("join_room", { roomCode, spectator });
          }}
        >
          <label>
            Room code
            <input
              id="room-code"
              maxLength={5}
              autoCapitalize="characters"
              value={roomCode}
              onChange={(event) =>
                setRoomCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                )
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={spectator}
              onChange={(event) => setSpectator(event.target.checked)}
            />
            Join as spectator
          </label>
          <button
            className="button secondary full"
            disabled={!connected || busy}
          >
            Join room
            <ArrowRight size={18} />
          </button>
        </form>
        <button
          type="button"
          className="button text full"
          disabled={!connected || busy}
          onClick={() => submit("join_public_room")}
        >
          {searchDeadline === null
            ? "Join an open room"
            : `Searching... ${Math.max(0, Math.ceil((searchDeadline - searchNow) / 1000))}s`}
          <Users size={18} />
        </button>
        {searchDeadline !== null && (
          <button
            type="button"
            className="button secondary full"
            onClick={() => {
              searchId.current += 1;
              socket.emit("cancel_public_search");
              setSearchDeadline(null);
              setBusy(false);
            }}
          >
            <X size={18} />
            Cancel search
          </button>
        )}
        {validation && (
          <p role="alert" className="error">
            {validation}
          </p>
        )}
      </section>
      <section className="home-drawing" aria-label="Sample sketch">
        <SampleDrawing />
        <p>One word. A room full of guesses.</p>
      </section>
    </main>
  );
}
function SampleDrawing() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, 560, 420);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 7;
    c.strokeStyle = "#25866b";
    c.beginPath();
    c.moveTo(85, 290);
    c.lineTo(245, 130);
    c.lineTo(420, 290);
    c.stroke();
    c.strokeStyle = "#2776c9";
    c.strokeRect(130, 250, 240, 120);
    c.strokeRect(225, 285, 55, 85);
    c.strokeStyle = "#e35b50";
    c.strokeRect(150, 275, 40, 40);
    c.strokeRect(310, 275, 40, 40);
    c.strokeStyle = "#eea330";
    c.beginPath();
    c.arc(430, 90, 33, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.beginPath();
      c.moveTo(430 + Math.cos(a) * 45, 90 + Math.sin(a) * 45);
      c.lineTo(430 + Math.cos(a) * 60, 90 + Math.sin(a) * 60);
      c.stroke();
    }
  }, []);
  return (
    <canvas
      ref={ref}
      width="560"
      height="420"
      aria-label="Hand-drawn house and sunshine"
    />
  );
}
function Settings({ settings, setSettings }: SettingsProps) {
  const change = <K extends keyof RoomSettings>(
    key: K,
    value: RoomSettings[K],
  ) => setSettings({ ...settings, [key]: value });
  return (
    <div className="settings-grid">
      {(
        [
          ["maxPlayers", "Players", 2, 20],
          ["rounds", "Rounds", 2, 10],
          ["drawTime", "Draw time (seconds)", 15, 240],
          ["wordCount", "Word choices", 1, 5],
          ["hintCount", "Hints", 0, 5],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            max={max}
            value={settings[key]}
            onChange={(event) => change(key, Number(event.target.value))}
          />
        </label>
      ))}
      <label>
        Word mode
        <select
          value={settings.wordMode}
          onChange={(event) => change("wordMode", event.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="hidden">Hidden</option>
          <option value="combination">Combination</option>
        </select>
      </label>
      <label>
        Word language
        <select
          value={settings.language}
          onChange={(event) => change("language", event.target.value)}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
      </label>
      <label>
        Category
        <select
          value={settings.category}
          onChange={(event) => change("category", event.target.value)}
        >
          {["All", "Animals", "Objects", "Food", "Nature"].map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <label className="wide">
        Custom words
        <textarea
          maxLength={2400}
          value={settings.customWords}
          onChange={(event) => change("customWords", event.target.value)}
        />
      </label>
    </div>
  );
}
function Lobby({
  room,
  self,
  host,
  connected,
  request,
  moderation,
  setError,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const active = room.players.filter(
    (player) => player.connected && !player.spectator,
  );
  const allReady = active.length >= 2 && active.every((player) => player.ready);
  async function invite() {
    const url = `${location.origin}/?room=${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Invite link: ${url}`);
    }
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setError(`Room code: ${room.roomCode}`);
    }
  }
  return (
    <main className="lobby">
      <div className="section-heading">
        <p className="eyebrow">
          {room.settings.isPublic ? "PUBLIC ROOM" : "PRIVATE ROOM"}
        </p>
        <h1>Room {room.roomCode}</h1>
        <div className="room-code-area" aria-label="Room code">
          <div>
            <span className="room-code-label">ROOM CODE</span>
            <output
              className="room-code-value"
              aria-label="Shareable room code"
            >
              {room.roomCode}
            </output>
          </div>
          <button type="button" className="button secondary" onClick={copyCode}>
            {codeCopied ? <Check size={18} /> : <Copy size={18} />}
            {codeCopied ? "Code copied" : "Copy code"}
          </button>
        </div>
        <button className="button secondary" onClick={invite}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </div>
      <div className="lobby-columns">
        <section>
          <div className="section-title">
            <h2>Players</h2>
            <span>
              {active.length}/{room.settings.maxPlayers}
            </span>
          </div>
          <ul className="player-list">
            {room.players.map((player) => (
              <li key={player.id}>
                <Avatar index={player.avatar} name={player.name} />
                <div className="player-name">
                  {player.name}
                  {player.id === self?.id && <small>YOU</small>}
                </div>
                <span className={`presence ${player.ready ? "ready" : ""}`}>
                  {!player.connected
                    ? "Reconnecting"
                    : player.spectator
                      ? "Watching"
                      : player.isHost
                        ? "Host"
                        : player.ready
                          ? "Ready"
                          : "Not ready"}
                </span>
                {moderation(player)}
              </li>
            ))}
          </ul>
          <div className="lobby-actions">
            {!self?.spectator && (
              <button
                className={`button ${self?.ready ? "secondary" : "primary"}`}
                disabled={!connected}
                onClick={() => request("set_ready", { ready: !self?.ready })}
              >
                <Check size={18} />
                {self?.ready ? "Ready" : "Ready up"}
              </button>
            )}
            {host && (
              <button
                className="button primary"
                disabled={!connected || !allReady}
                onClick={() => request("start_game")}
              >
                Start game
                <Play size={18} />
              </button>
            )}
          </div>
          <p className="waiting">
            {active.length < 2
              ? "Waiting for another player"
              : !allReady
                ? "Waiting for everyone to be ready"
                : host
                  ? "Everyone is ready"
                  : "Waiting for the host to start"}
          </p>
        </section>
        <section className="room-details">
          <h2>Room settings</h2>
          <dl>
            {[
              ["Rounds", room.settings.rounds],
              ["Draw time", `${room.settings.drawTime}s`],
              ["Word choices", room.settings.wordCount],
              ["Hints", room.settings.hintCount],
              ["Mode", room.settings.wordMode],
              [
                "Language",
                room.settings.language === "hi" ? "Hindi" : "English",
              ],
              ["Category", room.settings.category],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}

function Game({
  room,
  self,
  host,
  privateState,
  canvasSnapshot,
  connected,
  request,
  messages,
  roundEnd,
  replay,
  openReplay,
  moderation,
}: GameProps) {
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState<DrawingTool>("brush");
  const [text, setText] = useState("");
  const [tab, setTab] = useState("chat");
  const [now, setNow] = useState(Date.now());
  const controls = useRef<CanvasControls | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  const drawer = room.players.find(
    (player) => player.id === room.currentDrawerId,
  );
  const canDraw =
    connected &&
    self?.id === room.currentDrawerId &&
    Boolean(privateState?.word) &&
    !roundEnd &&
    !room.turnEnding &&
    room.gameStatus === "playing";
  const choices = privateState?.wordChoices || [];
  const remaining = room.turnEndsAt
    ? Math.max(0, Math.ceil((room.turnEndsAt - now) / 1000))
    : null;
  const ended = room.gameStatus === "ended";
  const leaderboard = [...room.players]
    .filter((player) => !player.spectator)
    .sort((a, b) => b.score - a.score);
  const chatDisabled =
    !connected ||
    ended ||
    (self?.spectator && !roundEnd) ||
    (self?.id === room.currentDrawerId && !roundEnd);
  return (
    <main className="game">
      <div className="game-top">
        <span>
          Round{" "}
          <b>
            {room.currentRound}/{room.totalRounds}
          </b>
        </span>
        <span className="drawer-name">
          {self?.spectator && <Eye size={16} />}
          {drawer ? `${drawer.name} is drawing` : "Game complete"}
        </span>
        <span
          className={`timer ${remaining !== null && remaining <= 10 ? "urgent" : ""}`}
          aria-label="Seconds remaining"
        >
          {remaining ?? "--"}
        </span>
      </div>
      <div className="game-grid">
        <section className="drawing-area">
          <div className="word-line">
            <span>
              {self?.id === room.currentDrawerId ? "YOUR WORD" : "WORD"}
            </span>
            <strong>
              {privateState?.word ||
                privateState?.hint ||
                (ended
                  ? "Game complete"
                  : room.turnEndsAt
                    ? "Hidden word"
                    : self?.spectator
                      ? "Watching the sketch"
                      : "Choosing a word...")}
            </strong>
            {replay && (
              <IconButton
                label="Replay last round"
                icon={RotateCcw}
                onClick={openReplay}
              />
            )}
          </div>
          <div className="canvas-shell">
            <Canvas
              socket={socket}
              canDraw={canDraw}
              color={color}
              size={size}
              tool={tool}
              controls={controls}
              snapshot={canvasSnapshot}
            />
            {choices.length > 0 && !roundEnd && (
              <div className="canvas-overlay">
                <div>
                  <h2>Choose your word</h2>
                  <div className="word-choices">
                    {choices.map((word) => (
                      <button
                        className="button secondary"
                        key={word}
                        onClick={() => request("choose_word", { word })}
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {roundEnd && !ended && (
              <div className="canvas-overlay">
                <div>
                  <p className="eyebrow">ROUND COMPLETE</p>
                  <h2>{roundEnd.word || "Drawer disconnected"}</h2>
                  {replay && (
                    <button className="button secondary" onClick={openReplay}>
                      <RotateCcw size={18} />
                      Replay
                    </button>
                  )}
                </div>
              </div>
            )}
            {ended && (
              <div className="canvas-overlay game-ended">
                <div>
                  <p className="eyebrow">FINAL SCORES</p>
                  <h2>{leaderboard[0]?.name || "Everyone"} wins!</h2>
                  <ol className="final-scores">
                    {leaderboard.map((player) => (
                      <li key={player.id}>
                        <span>{player.name}</span>
                        <b>{player.score}</b>
                      </li>
                    ))}
                  </ol>
                  {host && (
                    <button
                      className="button primary"
                      onClick={() => request("play_again")}
                    >
                      Play again
                      <Play size={18} />
                    </button>
                  )}
                  {replay && (
                    <button className="button secondary" onClick={openReplay}>
                      <RotateCcw size={18} />
                      Last sketch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="toolbar" aria-label="Drawing tools">
            <div className="tool-group">
              <IconButton
                label="Brush"
                icon={Brush}
                disabled={!canDraw}
                aria-pressed={tool === "brush"}
                onClick={() => setTool("brush")}
              />
              <IconButton
                label="Eraser"
                icon={Eraser}
                disabled={!canDraw}
                aria-pressed={tool === "eraser"}
                onClick={() => setTool("eraser")}
              />
              <IconButton
                label="Undo stroke"
                icon={Undo2}
                disabled={!canDraw}
                onClick={() => controls.current?.undo()}
              />
              <IconButton
                label="Clear canvas"
                icon={Trash2}
                disabled={!canDraw}
                onClick={() => controls.current?.clear()}
              />
            </div>
            <div className="swatches">
              {colors.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="swatch"
                  style={{ backgroundColor: value }}
                  aria-label={`Color ${value}`}
                  aria-pressed={color === value}
                  disabled={!canDraw}
                  onClick={() => {
                    setColor(value);
                    setTool("brush");
                  }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom color"
                value={color}
                disabled={!canDraw}
                onChange={(event) => {
                  setColor(event.target.value);
                  setTool("brush");
                }}
              />
            </div>
            <label className="size-control">
              Size
              <input
                type="range"
                min="2"
                max="24"
                value={size}
                disabled={!canDraw}
                onChange={(event) => setSize(Number(event.target.value))}
              />
              <output>{size}</output>
            </label>
          </div>
        </section>
        <aside className="game-sidebar">
          <div
            className="sidebar-tabs"
            role="tablist"
            aria-label="Game sidebar"
          >
            <button
              role="tab"
              aria-selected={tab === "chat"}
              onClick={() => setTab("chat")}
            >
              Chat
            </button>
            <button
              role="tab"
              aria-selected={tab === "players"}
              onClick={() => setTab("players")}
            >
              Players ({room.players.length})
            </button>
          </div>
          <section
            className={`score-section ${tab === "players" ? "active-tab" : ""}`}
            aria-label="Players"
          >
            <h2>Scoreboard</h2>
            <ul className="player-list scores">
              {[...room.players]
                .sort((a, b) => b.score - a.score)
                .map((player) => (
                  <li key={player.id}>
                    <Avatar index={player.avatar} name={player.name} />
                    <div className="player-name">
                      {player.name}
                      <small>
                        {!player.connected
                          ? "Reconnecting"
                          : player.spectator
                            ? "Spectator"
                            : player.id === room.currentDrawerId
                              ? "Drawing"
                              : player.guessedCorrectly
                                ? "Guessed it"
                                : player.isHost
                                  ? "Host"
                                  : ""}
                      </small>
                    </div>
                    <strong>
                      {player.spectator ? <Eye size={16} /> : player.score}
                    </strong>
                    {moderation(player)}
                  </li>
                ))}
            </ul>
          </section>
          <section
            className={`chat-section ${tab === "chat" ? "active-tab" : ""}`}
            aria-label="Chat"
          >
            <h2>Chat</h2>
            <div className="chat-log" ref={log} role="log" aria-live="polite">
              {messages.map((message, index) => (
                <p
                  key={index}
                  className={message.kind === "system" ? "system" : ""}
                >
                  {message.playerName && <b>{message.playerName}: </b>}
                  {message.text}
                </p>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim()) {
                  socket.emit(
                    self?.guessedCorrectly || roundEnd
                      ? "chat_message"
                      : "guess",
                    { text },
                  );
                  setText("");
                }
              }}
            >
              <input
                aria-label="Guess or chat"
                value={text}
                maxLength={120}
                disabled={chatDisabled}
                placeholder={
                  self?.spectator
                    ? "Spectating"
                    : self?.id === room.currentDrawerId && !roundEnd
                      ? "Your turn to draw"
                      : self?.guessedCorrectly || roundEnd
                        ? "Message..."
                        : "Type your guess..."
                }
                onChange={(event) => setText(event.target.value)}
              />
              <button
                className="icon-button"
                type="submit"
                title="Send"
                aria-label="Send"
                disabled={chatDisabled || !text.trim()}
              >
                <Send size={20} />
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
function Modal({ title, close, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} aria-label={title} onCancel={close} className="modal">
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="Close" icon={X} onClick={close} />
      </div>
      {children}
    </dialog>
  );
}
function Replay({ replay, close }: { replay: ReplayData; close: () => void }) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setProgress((value) => Math.min(100, value + 1)),
      65,
    );
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <Modal
      title={`Last sketch: ${replay.word || "No word selected"}`}
      close={close}
    >
      <div className="replay-canvas">
        <ReplayCanvas replay={replay} progress={progress} />
      </div>
      <div className="replay-controls">
        <IconButton
          label={playing && progress < 100 ? "Pause replay" : "Play replay"}
          icon={playing && progress < 100 ? Pause : Play}
          onClick={() => {
            if (progress >= 100) setProgress(0);
            setPlaying(progress >= 100 || !playing);
          }}
        />
        <input
          aria-label="Replay progress"
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => {
            setPlaying(false);
            setProgress(Number(event.target.value));
          }}
        />
        <output>{progress}%</output>
      </div>
    </Modal>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("React root element is missing.");
createRoot(root).render(<App />);
