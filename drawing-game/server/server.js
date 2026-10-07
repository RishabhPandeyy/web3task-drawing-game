const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createGameManager } = require("./gameManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN
      ? process.env.ALLOWED_ORIGIN.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : "*",
  },
  pingInterval: 20000,
  pingTimeout: 60000,
});
const rooms = new Map();
const socketPlayers = new Map();
const clientPath = path.join(__dirname, "..", "dist");

app.use(express.static(clientPath));
app.get("/health", (_request, response) =>
  response.json({ ok: true, service: "drawing-game" }),
);
app.get(["/", "/lobby", "/game", "/lobby.html", "/game.html"], (_request, response) =>
  response.sendFile(path.join(clientPath, "index.html")),
);

const gameManager = createGameManager(io, rooms, socketPlayers);
io.on("connection", (socket) => gameManager.register(socket));

const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () =>
  console.log(`Drawing game listening on http://localhost:${port}`),
);

function shutdown() {
  for (const room of rooms.values()) room.destroy();
  io.close(() => server.close(() => process.exit(0)));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
