const { spawn } = require("node:child_process");
const path = require("node:path");
const backend = spawn(process.execPath, ["--watch", "server/server.js"], {
  stdio: "inherit",
});
const frontend = spawn(
  process.execPath,
  [path.join("node_modules", "vite", "bin", "vite.js")],
  { stdio: "inherit" },
);
function stop() {
  backend.kill();
  frontend.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of [backend, frontend])
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
