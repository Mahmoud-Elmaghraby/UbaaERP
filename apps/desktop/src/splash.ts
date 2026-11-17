import { BRAND_MARK_TILE_SVG, BRAND_WORDMARK_WHITE_SVG } from './brand';

/** Self-contained splash page (no external resources — it shows before anything else is up). */
export function splashHtml(title: string, status: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:#0B2D4D;color:#fff;font-family:"Segoe UI",Tahoma,sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;-webkit-app-region:drag}
  .brand{display:flex;align-items:center;gap:16px;direction:ltr;margin-bottom:10px}
  h1{margin:0;font-size:18px;font-weight:600;opacity:.9}
  .spinner{width:30px;height:30px;border:3px solid rgba(255,255,255,.18);border-top-color:#FF8A00;border-radius:50%;animation:s 1s linear infinite}
  #status{font-size:13px;opacity:.75}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head><body><div class="brand">${BRAND_MARK_TILE_SVG}${BRAND_WORDMARK_WHITE_SVG}</div><h1>${escape(title)}</h1><div class="spinner"></div><div id="status">${escape(status)}</div></body></html>`;
}
