import { createMinimalProfileSnapshot, getGpmStoragePath, getChromeExecutablePath } from '../client-agent/agent.js';
import { chromium } from 'playwright-core';
import fs from 'fs';

async function run() {
  const gpmRoot = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const snap = await createMinimalProfileSnapshot(gpmRoot + '/500a1071-8dd2-43dd-9685-220721b0c4a4', '500a1071-8dd2-43dd-9685-220721b0c4a4');
  console.log('Snapshot dir:', snap.tempDir);
  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const page = await context.newPage();
  const res = await page.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title());
  
  await page.waitForTimeout(3000);
  console.log('After 3s URL:', page.url());
  console.log('After 3s Title:', await page.title());

  const cookies = await context.cookies();
  console.log('Cookies count:', cookies.length);
  const sessionCookies = cookies.filter(c => c.name.includes('session') || c.name.includes('tt_chain_token') || c.name.includes('sid_tt') || c.name.includes('passport'));
  console.log('Session cookie names:', sessionCookies.map(c => c.name));

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Body snippet:\n', bodyText);

  await context.close();
  try {
    fs.rmSync(snap.tempDir, { recursive: true, force: true });
  } catch {}
}

run().catch(console.error);
