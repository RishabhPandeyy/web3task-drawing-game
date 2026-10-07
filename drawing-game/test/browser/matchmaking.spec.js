const { test, expect } = require('@playwright/test');

test('open-room search shows countdown, can be cancelled, and automatically joins a new lobby', async ({ browser }) => {
  const seekerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const hostContext = await browser.newContext();
  const seeker = await seekerContext.newPage();
  const host = await hostContext.newPage();
  await seeker.goto('/');
  await seeker.getByLabel('Your name').fill('Seeker');
  await seeker.getByRole('button', { name: 'Join an open room' }).click();
  await expect(seeker.getByRole('button', { name: /Searching\.\.\. \d+s/ })).toBeVisible();
  await expect(seeker.getByRole('button', { name: 'Create public room' })).toBeDisabled();
  await seeker.getByRole('button', { name: 'Cancel search' }).click();
  await expect(seeker.getByRole('button', { name: 'Join an open room' })).toBeEnabled();
  await seeker.getByRole('button', { name: 'Join an open room' }).click();
  await expect(seeker.getByRole('button', { name: 'Cancel search' })).toBeVisible();
  await host.goto('/');
  await host.getByLabel('Your name').fill('NewHost');
  await host.getByRole('button', { name: 'Create public room' }).click();
  await expect(host.getByRole('heading', { name: /^Room /, level: 1 })).toBeVisible();
  const code = new URL(host.url()).searchParams.get('room');
  await expect(seeker.getByRole('heading', { name: `Room ${code}`, level: 1 })).toBeVisible();
  await expect(host.locator('.player-list')).toContainText('Seeker');
  await expect(seeker.getByRole('button', { name: 'Cancel search' })).toHaveCount(0);
  await seekerContext.close(); await hostContext.close();
});
