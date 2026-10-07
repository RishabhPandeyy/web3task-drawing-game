# Real-Time Multiplayer Drawing Game

Quickdraw is a browser-based drawing and guessing party game. Create a private or public room, invite a group with its short code, and see whether your sketches make any sense to anyone else.

## Features

- Private room codes, public room matchmaking, host controls, player limits, and live lobby updates.
- Host-configurable rounds, player limits, draw time, word choices, hint count, word mode, and custom words.
- Responsive Canvas drawing with brush, color picker, brush size, eraser, clear, and undo.
- Live stroke events instead of repeated canvas image uploads.
- Timed hint reveals, server-checked guesses, speed-based scoring, drawer bonuses, and final standings.
- Lobby kick controls, post-guess chat, reconnection grace period, and automatic host handoff after disconnect.
- Mobile-friendly layout with pointer input for mouse, pen, or touch.

## Tech Stack

- HTML5, CSS3, vanilla browser JavaScript, and the Canvas API.
- Node.js, Express, and Socket.IO.
- Node's built-in test runner for focused server logic tests.

## Project Structure

```text
drawing-game/
├── client/
│   ├── assets/
│   ├── css/       # shared, lobby, and game styles
│   ├── js/        # home, lobby, and game clients
│   ├── index.html
│   ├── lobby.html
│   └── game.html
├── server/
│   ├── gameManager.js
│   ├── roomManager.js
│   ├── scoring.js
│   ├── server.js
│   └── wordManager.js
├── test/
│   └── server.test.js
├── package.json
└── README.md
```

## How to Run Locally

Requires Node.js 18 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two or more browser tabs. Create a room in one tab, join with the displayed code in another, then start the game. For automatic server restarts while developing, run `npm run dev`.

Run the checks with:

```sh
npm test
npm run check
```

## Environment Variables

- `PORT`: HTTP port (defaults to `3000`; hosting providers can supply their own port).
- `ALLOWED_ORIGIN`: optional Socket.IO CORS origin. Defaults to `*` for easy local use; set it to the deployed site's origin in production.
- `GAME_SERVER_URL`: backend origin used by `npm run build` for the static Vercel frontend. This is public browser configuration, not a secret. Local `npm start` connects to the same origin without this variable.

## How the Game Works

The host configures and starts a game with at least two connected players. Each player draws once per round. At the start of a turn the server chooses the configured number of word options and sends them only to the current drawer. The drawer's chosen word stays on the server; other players receive blanks, then timed hint reveals unless hidden mode disables hints. Drawing and guesses are accepted only from players allowed to perform those actions.

The server owns the round deadline and awards 100 base points plus up to 100 speed points for a correct guess. The drawer receives 50 points for each correct guess. Correct guesses score only once per player per turn. After the timer expires or all connected guessers solve the word, the answer is revealed and the next turn starts.

Room/game state is held in memory, so active games end if the server restarts. The application is intended for small private game rooms rather than persistent accounts or durable leaderboards.

## Socket.IO Architecture

Clients join a Socket.IO room named by the room code. The server broadcasts sanitized room/player state and drawing point events to that room. Private drawer data is emitted directly to that player's socket. Stroke coordinates are normalized to the canvas dimensions so each client can render them at its own size; the server clamps coordinates, color, and brush width and checks the active drawer before relaying them.

Main event groups include `create_room`, `join_room`, `join_public_room`, `resume_room`, `room_updated`, `kick_player`, `start_game`, `choose_word`, `game_state`, `round_started`, `timer_update`, `draw_start`, `draw_move`, `draw_end`, `clear_canvas`, `undo_drawing`, `guess`, `chat_message`, `correct_guess`, `round_ended`, and `game_over`.

## Deployment

Live URL: https://web3task-drawing-game.onrender.com

The included `render.yaml` defines a Render web service with `npm install`, `npm start`, and `/health` checks. Push this project to a GitHub repository, create a Blueprint deployment in Render from that repository, and wait for the service URL. Set `ALLOWED_ORIGIN` to the public app origin, then open the deployed URL in multiple browser sessions to verify room creation, reconnection, drawing, and scoring. The in-memory room model supports a single server process; horizontal scaling requires a shared Socket.IO adapter and shared room/game state.

### Vercel Frontend With Render Backend

1. Keep the Node server deployed on Render using `npm install` and `npm start`. Verify that its `/health` endpoint returns `ok: true`.
2. In Vercel, set the project Root Directory to `drawing-game` (or the repository root if it already contains this package). Use Framework Preset `Other`, Build Command `npm run build`, and Output Directory `dist` as configured in `vercel.json`.
3. Add `GAME_SERVER_URL` to Vercel's environment variables for Production and Preview, using your backend origin, for example `https://web3task-drawing-game.onrender.com`. Redeploy after changing it.
4. If Render has `ALLOWED_ORIGIN` set, change it to your Vercel site origin, with no trailing slash. The default `*` also permits Vercel previews. Restart/redeploy the backend after changing its environment variables.
5. Open the Vercel site in two browser sessions, create and join a new room, and start the game.

The static build includes the Socket.IO browser library and generates `/js/config.js` with the backend origin. All three pages connect directly to that backend; the Vercel deployment only serves the frontend. Local development and the full-stack Render site still connect to their own origin.

Vercel also supports WebSockets in Functions, but this game's in-memory rooms and timers assume one persistent server process. Moving the backend to Functions requires shared game state and coordination across instances, rather than only changing the deployment settings.

## Screenshots

Screenshots can be added here after capturing the home, lobby, and in-game views.
