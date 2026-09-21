import { loadProfileSession, getChromeExecutablePath } from '../client-agent/agent.js';
import { chromium } from 'playwright-core';

async function run() {
  const profileId = '500a1071-8dd2-43dd-9685-220721b0c4a4';
  const cookies = loadProfileSession(profileId);
  console.log('Loaded cookies from profile session:', cookies?.length);
  const chromePath = getChromeExecutablePath();

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext();
  if (cookies) {
    await context.addCookies(cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain?.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path || '/',
      expires: c.expirationDate || c.expires || (Math.floor(Date.now() / 1000) + 86400 * 30),
      httpOnly: !!c.httpOnly,
      secure: c.secure !== false,
      sameSite: c.sameSite === "no_restriction" ? "None" : (c.sameSite === "lax" ? "Lax" : "None")
    })));
  }

  const page = await context.newPage();
  const intercepted = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('item_list') || u.includes('post_list') || u.includes('manage') || u.includes('content')) {
      try {
        const text = await r.text();
        intercepted.push({ url: u, status: r.status(), len: text.length, snippet: text.slice(0, 150) });
      } catch {}
    }
  });

  await page.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded', timeout: 25000 });
  console.log('Navigated URL:', page.url());
  console.log('Navigated Title:', await page.title());

  await page.waitForTimeout(5000);
  console.log('After 5s URL:', page.url());
  console.log('After 5s Title:', await page.title());

  const tabText = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/(?:Bài đăng|Posts?|Videos?)\s*\(?\s*(\d+)\s*\)?/i) || t.match(/(\d+)\s+(?:bài đăng|posts?|videos?)/i);
    return { tabMatch: m ? m[0] : null, num: m ? m[1] : null, snippet: t.slice(0, 400) };
  });
  console.log('Tab info:', tabText);
  console.log('Intercepted calls:', intercepted);

  await browser.close();
}

run().catch(console.error);
