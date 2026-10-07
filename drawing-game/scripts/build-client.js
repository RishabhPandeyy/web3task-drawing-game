const fs = require('node:fs');
const path = require('node:path');

function buildClient(serverUrl, outputPath = path.join(__dirname, '..', 'dist')) {
  if (!serverUrl?.trim()) throw new Error('Set GAME_SERVER_URL to your deployed Node backend URL before building the Vercel frontend.');
  const url = new URL(serverUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('GAME_SERVER_URL must be an HTTP(S) origin, for example https://your-game.onrender.com.');
  }
  fs.cpSync(path.join(__dirname, '..', 'client'), outputPath, { recursive: true });
  fs.writeFileSync(path.join(outputPath, 'js', 'config.js'), `window.QUICKDRAW_CONFIG = ${JSON.stringify({ serverUrl: url.origin })};\n`);
  // Static hosting needs the browser bundle normally served by the Node server.
  const bundlePath = path.join(path.dirname(require.resolve('socket.io')), '..', 'client-dist', 'socket.io.min.js');
  fs.mkdirSync(path.join(outputPath, 'socket.io'), { recursive: true });
  fs.copyFileSync(bundlePath, path.join(outputPath, 'socket.io', 'socket.io.js'));
}

if (require.main === module) buildClient(process.env.GAME_SERVER_URL);

module.exports = { buildClient };
