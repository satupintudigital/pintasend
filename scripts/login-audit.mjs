// Audit halaman /login — jalankan: node scripts/login-audit.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.argv[2] ?? "http://localhost:3100/login";
const VIEWPORTS = [
  { name: "320px", width: 320, height: 568 },
  { name: "375px", width: 375, height: 667 },
  { name: "430px", width: 430, height: 932 },
  { name: "768px", width: 768, height: 1024 },
  { name: "1024px", width: 1024, height: 768 },
];

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9333",
  "--user-data-dir=C:/Users/Public/wavio-login-audit",
  "--no-first-run",
  "--disable-gpu",
  "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9333/json/list");
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error("Chrome DevTools tidak merespons");
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const AUDIT_JS = `(() => {
  const vw = window.innerWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  const clips = (el) => {
    let n = el.parentElement;
    while (n) {
      const o = getComputedStyle(n).overflowX;
      if (o === "hidden" || o === "clip" || o === "auto" || o === "scroll") return true;
      n = n.parentElement;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    if (clips(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5 && r.width > 1) {
      offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 45), right: Math.round(r.right) });
    }
  }
  offenders.sort((a, b) => b.right - a.right);
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) };
  };
  const brandPanel = document.querySelector("main .hidden.lg\\\\:block, main div.hidden.lg\\\\:block");
  const bpVisible = brandPanel ? getComputedStyle(brandPanel).display !== "none" : null;
  return {
    vw,
    overflowX,
    offenders: offenders.slice(0, 6),
    formCard: rect(".max-w-md .rounded-2xl") ?? rect(".rounded-2xl"),
    submit: rect("form button[type=submit]"),
    input: rect("input#email"),
    brandPanelVisible: bpVisible,
    turnstile: !!document.querySelector(".cf-turnstile"),
  };
})()`;

async function auditViewport({ name, width, height }) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(3000);
  const res = await send("Runtime.evaluate", { expression: AUDIT_JS, returnByValue: true });
  return res.result?.result?.value;
}

console.log(`URL: ${URL}\n`);
for (const vp of VIEWPORTS) {
  const data = await auditViewport(vp);
  if (!data) { console.log(`[${vp.name}] GAGAL`); continue; }
  console.log(`── ${vp.name} ──`);
  console.log(`  overflowX ${data.overflowX}px · brand panel ${data.brandPanelVisible ? "terlihat" : "tersembunyi"} · turnstile ${data.turnstile ? "ada" : "tidak"}`);
  if (data.formCard) console.log(`  kartu form ${data.formCard.w}px [${data.formCard.left}..${data.formCard.right}]${data.formCard.right > data.vw + 0.5 ? " ⚠" : ""}`);
  if (data.input) console.log(`  input email ${data.input.w}px ✓`);
  if (data.submit) console.log(`  tombol masuk ${data.submit.w}px ✓`);
  if (data.offenders.length) {
    for (const o of data.offenders) console.log(`  ⚠ <${o.tag} class="${o.cls}"> right=${o.right}`);
  } else {
    console.log(`  ✓ tidak ada overflow`);
  }
  console.log("");
}

ws.close();
chrome.kill();
process.exit(0);
