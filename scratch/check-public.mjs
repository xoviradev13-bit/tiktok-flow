async function main() {
  const r = await fetch('https://www.tiktok.com/@ousnowfan', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await r.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    const d = JSON.parse(m[1]);
    const userDetail = d['__DEFAULT_SCOPE__']?.['webapp.user-detail'];
    console.log('Public User stats:', userDetail?.userInfo?.stats);
    console.log('Public User info:', userDetail?.userInfo?.user?.uniqueId, userDetail?.userInfo?.user?.nickname);
  } else {
    console.log('No script found, html length:', html.length);
  }
}
main().catch(console.error);
