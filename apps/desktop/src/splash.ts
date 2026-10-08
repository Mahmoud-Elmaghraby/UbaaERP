/** Self-contained splash page (no external resources — it shows before anything else is up). */
export function splashHtml(title: string, status: string): string {
  const escape = (value: string) => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:#0d3b30;color:#fff;font-family:"Segoe UI",Tahoma,sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;-webkit-app-region:drag}
  h1{margin:0;font-size:22px;font-weight:600}
  .spinner{width:34px;height:34px;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:s 1s linear infinite}
  #status{font-size:13px;opacity:.75}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head><body><h1>${escape(title)}</h1><div class="spinner"></div><div id="status">${escape(status)}</div></body></html>`;
}
