const test = require("node:test");
const assert = require("node:assert/strict");
const { validateServerUrl } = require("../scripts/build-client");
test("uses same-origin locally and validates external Vercel backend configuration", () => {
  assert.equal(validateServerUrl(), "");
  assert.equal(
    validateServerUrl(" https://game.example.com/ ", true),
    "https://game.example.com",
  );
  for (const url of [
    undefined,
    "",
    "file:///tmp/backend",
    "https://example.com/api",
    "https://user:password@example.com",
    "https://example.com?token=x",
  ])
    assert.throws(() => validateServerUrl(url, true));
});
