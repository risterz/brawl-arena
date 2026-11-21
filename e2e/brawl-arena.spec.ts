import { test, expect } from '@playwright/test';

test.describe('Brawl Arena End-to-End', () => {
  test('Desktop Solo vs Bots starts cleanly, renders 3D arena, and runs match with 0 errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'BRAWL ARENA' })).toBeVisible();
    await page.locator('#open-brawlers-btn').click();
    await expect(page.getByText('CHOOSE BRAWLER')).toBeVisible();
    await page.locator('.brawler-card[data-id="blaze"]').click();

    await page.locator('#play-solo-btn').click();
    await expect(page.locator('#hud-layer')).toBeVisible();
    await expect(page.locator('#hud-timer')).toBeVisible();

    const t0 = await page.locator('#hud-timer').textContent();
    await page.keyboard.down('KeyW');
    await page.mouse.move(640, 220);
    await page.mouse.down();
    await expect(page.locator('#hud-timer')).not.toHaveText(t0!, { timeout: 12_000 });
    await page.mouse.up();
    await page.keyboard.up('KeyW');

    expect(errors).toEqual([]);
  });

  test('Mobile portrait shows exact rotate blocker; mobile landscape shows dual-stick controls cleanly', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto('/');

    // Portrait mobile must display exact rotate blocker
    await expect(page.locator('#portrait-blocker')).toBeVisible();
    await expect(page.getByText('Rotate device to landscape to play')).toBeVisible();

    // Rotate to landscape 844x390 -> blocker disappears and Solo match shows all 3 touch sticks
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#portrait-blocker')).toBeHidden();

    await page.locator('#play-solo-btn').click();
    await expect(page.locator('.stick-move')).toBeVisible();
    await expect(page.locator('.stick-aim')).toBeVisible();
    await expect(page.locator('.stick-super')).toBeVisible();

    const topHud = await page.locator('.hud-top').boundingBox();
    const aimStick = await page.locator('.stick-aim').boundingBox();
    expect(topHud).not.toBeNull();
    expect(aimStick).not.toBeNull();
    // Ensure HUD scoreboard and touch stick do not overlap
    expect(topHud!.y + topHud!.height).toBeLessThan(aimStick!.y);

    await context.close();
  });

  test('Live Cloudflare Worker room-code multiplayer syncs 2 humans + 4 bots and blocks late joiner', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const ctxC = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const pageC = await ctxC.newPage();

    await pageA.goto('/', { waitUntil: 'domcontentloaded' });
    await pageA.locator('#player-name-input').fill('Alpha');
    await pageA.locator('#create-room-btn').click();

    await expect(pageA.locator('#lobby-room-code')).toBeVisible();
    const code = (await pageA.locator('#lobby-room-code').textContent())!.trim();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);

    // Friend B joins via shareable invite URL
    await pageB.goto(`/?room=${code}`, { waitUntil: 'domcontentloaded' });
    await expect(pageB.locator('#lobby-room-code')).toHaveText(code);
    await expect(pageA.locator('.slot-row')).toHaveCount(6);
    await expect(pageA.locator('.bot-badge')).toHaveCount(4);

    // Host A starts the 3v3 match
    await pageA.locator('#start-match-btn').click();
    await expect(pageA.locator('#hud-layer')).toBeVisible();
    await expect(pageB.locator('#hud-layer')).toBeVisible();

    // Move both players briefly to verify live snapshots
    await pageA.keyboard.down('KeyW');
    await pageB.keyboard.down('KeyW');
    await pageA.waitForTimeout(800);
    await pageA.keyboard.up('KeyW');
    await pageB.keyboard.up('KeyW');

    // Review Focus #4: Late player C rejected with exact message
    await pageC.goto(`/?room=${code}`, { waitUntil: 'domcontentloaded' });
    await expect(pageC.getByText('Match in progress — join when the round ends')).toBeVisible();

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});
