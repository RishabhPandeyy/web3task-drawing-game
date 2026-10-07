function validateServerUrl(value, required = false) {
  if (!value?.trim()) {
    if (required)
      throw new Error(
        "Set GAME_SERVER_URL to the Render backend origin before building on Vercel.",
      );
    return "";
  }
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "GAME_SERVER_URL must be an HTTP(S) origin, for example https://your-game.onrender.com.",
    );
  }
  return url.origin;
}
if (require.main === module) {
  import("vite")
    .then(({ build }) => build())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
module.exports = { validateServerUrl };
