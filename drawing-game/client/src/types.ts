import type {
  ButtonHTMLAttributes,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import type { LucideIcon } from "lucide-react";
import type { Socket } from "socket.io-client";

export interface Player {
  id: string;
  name: string;
  avatar: number;
  score: number;
  isHost: boolean;
  spectator: boolean;
  ready: boolean;
  connected: boolean;
  guessedCorrectly: boolean;
}
export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hintCount: number;
  wordMode: string;
  language: string;
  category: string;
  isPublic: boolean;
  customWords: string;
}
export interface RoomState {
  roomCode: string;
  hostId: string | null;
  gameStatus: "lobby" | "playing" | "ended";
  currentRound: number;
  totalRounds: number;
  currentDrawerId: string | null;
  turnEndsAt: number | null;
  turnEnding: boolean;
  settings: Omit<RoomSettings, "customWords">;
  players: Player[];
  votes: { playerId: string; voterIds: string[] }[];
}
export interface PrivateState extends RoomState {
  isDrawer: boolean;
  word: string | null;
  hint: string | null;
  wordChoices: string[];
}
export interface Session {
  roomCode: string;
  playerId: string;
  name: string;
  avatar: number;
}
export interface Point {
  x: number;
  y: number;
}
export type DrawingTool = "brush" | "eraser";
export interface Stroke {
  color: string;
  size: number;
  tool: DrawingTool;
  points: Point[];
}
export interface DrawingPoint extends Point {
  color: string;
  size: number;
  tool: DrawingTool;
}
export interface CanvasSnapshot {
  strokes: Stroke[];
}
export interface ReplayData extends CanvasSnapshot {
  word: string | null;
}
export interface RoundEnd {
  word: string | null;
  reason: string;
}
export interface ChatMessage {
  kind: "system" | "chat" | "guess";
  text: string;
  playerName?: string;
}
export interface PlayerReport {
  playerName: string;
  reporterName: string;
  reason: string;
}
export interface AckResult {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
}
export type Request = (
  event: string,
  payload?: unknown,
  onSuccess?: (result: AckResult) => void,
) => void;
export type Moderation = (player: Player) => ReactNode;
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: LucideIcon;
}
export interface HomeProps {
  connected: boolean;
  request: Request;
  enter: (result: AckResult, name: string, avatar: number) => void;
}
export interface SettingsProps {
  settings: RoomSettings;
  setSettings: Dispatch<SetStateAction<RoomSettings>>;
}
export interface LobbyProps {
  room: RoomState;
  self?: Player;
  host: boolean;
  connected: boolean;
  request: Request;
  moderation: Moderation;
  setError: Dispatch<SetStateAction<string>>;
}
export interface GameProps extends Omit<LobbyProps, "setError"> {
  privateState: PrivateState | null;
  canvasSnapshot: CanvasSnapshot | null;
  messages: ChatMessage[];
  roundEnd: RoundEnd | null;
  replay: ReplayData | null;
  openReplay: () => void;
}
export interface CanvasControls {
  clear: () => void;
  undo: () => void;
}
export interface CanvasProps {
  socket: Socket;
  canDraw: boolean;
  color: string;
  size: number;
  tool: DrawingTool;
  controls: { current: CanvasControls | null };
  snapshot: CanvasSnapshot | null;
}
export interface ModalProps {
  title: string;
  close: () => void;
  children: ReactNode;
}
