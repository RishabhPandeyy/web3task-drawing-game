const { test, expect } = require("@playwright/test");

test("two players ready up, draw, guess, score, replay and restore canvas on mobile reload", async ({
  browser,
}) => {
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const host = await desktop.newPage();
  const guest = await mobile.newPage();
  const errors = [];
  host.on("pageerror", (error) => errors.push(error.message));
  guest.on("pageerror", (error) => errors.push(error.message));
  await host.goto("/");
  await host.getByLabel("Your name").fill("Host");
  await expect(
    host.getByRole("button", { name: "Create public room" }),
  ).toBeEnabled();
  await host.getByRole("button", { name: "Create public room" }).click();
  await expect(
    host.getByRole("heading", { name: /^Room /, level: 1 }),
  ).toBeVisible();
  const code = new URL(host.url()).searchParams.get("room");
  await guest.goto(`/?room=${code}`);
  await guest.getByLabel("Your name").fill("Guest");
  await expect(
    guest.getByRole("button", { name: "Join room", exact: true }),
  ).toBeEnabled();
  await guest.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(
    guest.getByRole("heading", { name: `Room ${code}` }),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: "Start game" })).toBeDisabled();
  await guest.getByRole("button", { name: "Ready up", exact: true }).click();
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled();
  await host.screenshot({
    path: "test-results/lobby-desktop.png",
    fullPage: true,
  });
  await guest.screenshot({
    path: "test-results/lobby-mobile.png",
    fullPage: true,
  });
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(
    host.getByRole("heading", { name: "Choose your word" }),
  ).toBeVisible();
  const word = await host.locator(".word-choices button").first().textContent();
  await host.locator(".word-choices button").first().click();
  await expect(host.getByLabel('Seconds remaining')).toHaveText(/^\d+$/);
  await expect(guest.getByLabel('Seconds remaining')).toHaveText(/^\d+$/);
  const initialSeconds = Number(await guest.getByLabel('Seconds remaining').textContent());
  await expect.poll(async () => Number(await guest.getByLabel('Seconds remaining').textContent())).toBeLessThan(initialSeconds);
  await expect(
    host.getByRole("button", { name: "Brush", exact: true }),
  ).toBeEnabled();
  const box = await host.getByTestId("drawing-canvas").boundingBox();
  await host.mouse.move(box.x + 40, box.y + 40);
  await host.mouse.down();
  await host.mouse.move(box.x + 200, box.y + 150, { steps: 15 });
  await host.mouse.up();
  const hasInk = async (page) =>
    page.getByTestId("drawing-canvas").evaluate((canvas) => {
      const data = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 100 &&
          data[i + 1] < 100 &&
          data[i + 2] < 100 &&
          data[i + 3] > 0
        )
          count++;
      return count > 50;
    });
  await expect.poll(() => hasInk(guest)).toBe(true);
  await guest.reload();
  await expect.poll(() => hasInk(guest)).toBe(true);
  await guest.screenshot({
    path: "test-results/game-mobile.png",
    fullPage: true,
  });
  await host.screenshot({
    path: "test-results/game-desktop.png",
    fullPage: true,
  });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await guest.getByRole("textbox", { name: "Guess or chat" }).fill(word);
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await expect(guest.getByRole("log")).toContainText("Guest guessed the word!");
  await expect(host.locator(".scores")).toContainText("50");
  await guest.getByRole("button", { name: "Replay last round" }).click();
  await expect(guest.getByRole("dialog")).toBeVisible();
  await guest.getByLabel("Replay progress").fill("100");
  await guest.screenshot({
    path: "test-results/replay-mobile.png",
    fullPage: true,
  });
  await guest.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    guest.getByRole("heading", { name: "Choose your word" }),
  ).toBeVisible();
  await guest.locator(".word-choices button").first().click();
  await expect(
    guest.getByRole("button", { name: "Brush", exact: true }),
  ).toBeEnabled();
  const touchBox = await guest.getByTestId("drawing-canvas").boundingBox();
  // Real touch input is supplied through Chromium, including pointer capture.
  const cdp = await mobile.newCDPSession(guest);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchBox.x + 50, y: touchBox.y + 50 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchBox.x + 150, y: touchBox.y + 120 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => hasInk(host)).toBe(true);
  let nextWord = await guest.locator(".word-line strong").textContent();
  await host.getByRole("textbox", { name: "Guess or chat" }).fill(nextWord);
  await host.getByRole("button", { name: "Send", exact: true }).click();
  for (let turn = 0; turn < 4; turn++) {
    const drawingPage = turn % 2 === 0 ? host : guest;
    const guessingPage = turn % 2 === 0 ? guest : host;
    await expect(
      drawingPage.getByRole("heading", { name: "Choose your word" }),
    ).toBeVisible();
    nextWord = await drawingPage
      .locator(".word-choices button")
      .first()
      .textContent();
    await drawingPage.locator(".word-choices button").first().click();
    await expect(
      guessingPage.getByRole("textbox", { name: "Guess or chat" }),
    ).toBeEnabled();
    await guessingPage
      .getByRole("textbox", { name: "Guess or chat" })
      .fill(nextWord);
    await guessingPage
      .getByRole("button", { name: "Send", exact: true })
      .click();
  }
  await expect(host.getByRole("heading", { name: /wins!/ })).toBeVisible();
  await host.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(
    guest.getByRole("heading", { name: `Room ${code}` }),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: "Start game" })).toBeDisabled();
  expect(errors).toEqual([]);
  await guest.getByRole('button', { name: 'Leave room' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Quickdraw' })).toBeVisible();
  await host.getByRole('button', { name: 'Leave room' }).click();
  await expect(host.getByRole('heading', { level: 1, name: 'Quickdraw' })).toBeVisible();
  await desktop.close();
  await mobile.close();
});

test("phone home has no horizontal overflow at 320px and settings remain accessible", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 700 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await expect(page.getByLabel("Word language")).toBeVisible();
  await page.getByLabel("Word language").selectOption("hi");
  await page.getByLabel("Category").selectOption("Animals");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-small-phone.png",
    fullPage: true,
  });
  await context.close();
});

test("spectators join a running Hindi game and host receives reports and can ban them", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    }),
  ]);
  const [host, guest, watcher] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  await host.goto("/");
  await host.getByLabel("Your name").fill("HindiHost");
  await host.getByRole("button", { name: "Private", exact: true }).click();
  await host.getByLabel("Word language").selectOption("hi");
  await host.getByLabel("Category").selectOption("Animals");
  await host.getByRole("button", { name: "Create private room" }).click();
  await expect(
    host.getByRole("heading", { level: 1, name: /^Room / }),
  ).toBeVisible();
  const code = new URL(host.url()).searchParams.get("room");
  await guest.goto(`/?room=${code}`);
  await guest.getByLabel("Your name").fill("HindiGuest");
  await guest.getByRole("button", { name: "Join room", exact: true }).click();
  await guest.getByRole("button", { name: "Ready up", exact: true }).click();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host.locator(".word-choices button").first()).toHaveText(
    /[\u0900-\u097f]/,
  );
  await host.locator(".word-choices button").first().click();
  await watcher.goto(`/?room=${code}`);
  await watcher.getByLabel("Your name").fill("Watcher");
  await watcher.getByLabel("Join as spectator").check();
  await watcher.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(
    watcher.getByRole("button", { name: "Brush", exact: true }),
  ).toBeDisabled();
  await expect(
    watcher.getByRole("textbox", { name: "Guess or chat" }),
  ).toBeDisabled();
  await expect(watcher.locator(".word-choices")).toHaveCount(0);
  expect(
    await watcher.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await watcher.screenshot({
    path: "test-results/spectator-landscape.png",
    fullPage: true,
  });
  await watcher.getByLabel("Actions for HindiGuest").click();
  await watcher.getByRole("button", { name: "Report", exact: true }).click();
  await watcher.getByLabel("Reason").fill("Unsporting chat");
  await watcher.getByRole("button", { name: "Send report" }).click();
  await expect(host.getByRole("alert")).toContainText("Unsporting chat");
  await host.getByLabel("Actions for Watcher").click();
  await host.getByRole("button", { name: "Ban", exact: true }).click();
  await expect(
    watcher.getByRole("heading", { level: 1, name: "Quickdraw" }),
  ).toBeVisible();
  await expect(watcher.getByRole("alert")).toContainText("banned");
  await watcher.getByLabel("Room code").fill(code);
  await watcher.getByLabel("Join as spectator").check();
  await watcher.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(watcher.getByRole("alert")).toContainText("banned");
  await Promise.all(contexts.map((context) => context.close()));
});
