// Audit responsif sementara — jalankan: node scripts/mobile-audit.mjs
// Emulasi mobile:false → layout viewport = persis ukuran yang diminta (tanpa quirk meta viewport headless).
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.argv[2] ?? "http://localhost:3100/";
const VIEWPORTS = [
  { name: "iPhone SE (375x667)", width: 375, height: 667 },
  { name: "Android kecil (360x740)", width: 360, height: 740 },
  { name: "Sangat kecil (320x568)", width: 320, height: 568 },
  { name: "iPhone Pro Max (430x932)", width: 430, height: 932 },
  { name: "Tablet (768x1024)", width: 768, height: 1024 },
];

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9333",
  "--user-data-dir=C:/Users/Public/wavio-audit-profile-4",
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
  const doc = document.documentElement;
  const overflowX = doc.scrollWidth - vw;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5 && r.width > 1 && r.width > 0) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 55),
        w: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  // Teks yang scrollWidth > clientWidth (berpotensi terpotong, bukan pre scrollable)
  const clipped = [];
  for (const el of document.querySelectorAll("h1, h2, h3, p, a, span")) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 45),
        clientW: el.clientWidth,
        scrollW: el.scrollWidth,
      });
    }
  }
  // Grid hero + item
  const heroGrid = document.querySelectorAll("main > section > div")[1];
  const hg = heroGrid ? heroGrid.getBoundingClientRect() : null;
  const leftCol = heroGrid ? heroGrid.children[0].getBoundingClientRect() : null;
  const codeCard = document.querySelector("main section .overflow-hidden.rounded-2xl");
  const cc = codeCard ? codeCard.getBoundingClientRect() : null;
  const h1 = document.querySelector("h1");
  const h1r = h1 ? h1.getBoundingClientRect() : null;
  // Pricing: kartu & toggle
  const toggle = document.querySelector("#harga .inline-flex.rounded-full");
  const tr = toggle ? toggle.getBoundingClientRect() : null;
  const priceCards = Array.from(document.querySelectorAll("#harga [class*=rounded-2xl]")).slice(0, 4).map((el) => {
    const r = el.getBoundingClientRect();
    return Math.round(r.width) + "x" + Math.round(r.height);
  });
  return {
    vw,
    clientW: doc.clientWidth,
    overflowX,
    offenders: offenders.slice(0, 8),
    clipped: clipped.slice(0, 8),
    heroGrid: hg ? { w: Math.round(hg.width), left: Math.round(hg.left), right: Math.round(hg.right) } : null,
    leftCol: leftCol ? { w: Math.round(leftCol.width), left: Math.round(leftCol.left), right: Math.round(leftCol.right) } : null,
    h1: h1r ? { w: Math.round(h1r.width), left: Math.round(h1r.left), right: Math.round(h1r.right) } : null,
    codeCard: cc ? { w: Math.round(cc.width), left: Math.round(cc.left), right: Math.round(cc.right) } : null,
    toggle: tr ? { w: Math.round(tr.width), left: Math.round(tr.left), right: Math.round(tr.right) } : null,
    priceCards,
    navH: Math.round(document.querySelector("header").getBoundingClientRect().height),
  };
})()`;

async function auditViewport({ name, width, height }) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL });
  await sleep(3500);
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, document.body.scrollHeight); true` });
  await sleep(1000);
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, 0); true` });
  await sleep(600);
  const res = await send("Runtime.evaluate", { expression: AUDIT_JS, returnByValue: true });
  const value = res.result?.result?.value;
  if (!value) console.error("RAW:", JSON.stringify(res).slice(0, 300));
  return value;
}

console.log(`URL: ${URL}\n`);
for (const vp of VIEWPORTS) {
  const data = await auditViewport(vp);
  if (!data) { console.log(`[${vp.name}] GAGAL\n`); continue; }
  console.log(`── ${vp.name} ──`);
  console.log(`  viewport ${data.vw}px · overflowX dokumen: ${data.overflowX}px`);
  if (data.heroGrid) console.log(`  hero grid: ${JSON.stringify(data.heroGrid)}${data.heroGrid.right > data.vw + 0.5 ? " ⚠" : ""}`);
  if (data.leftCol) console.log(`  kolom kiri: ${JSON.stringify(data.leftCol)}${data.leftCol.right > data.vw + 0.5 ? " ⚠" : ""}`);
  if (data.h1) console.log(`  h1: ${JSON.stringify(data.h1)}${data.h1.right > data.vw + 0.5 ? " ⚠" : ""}`);
  if (data.codeCard) console.log(`  code card: ${JSON.stringify(data.codeCard)}${data.codeCard.right > data.vw + 0.5 ? " ⚠" : ""}`);
  if (data.toggle) console.log(`  toggle harga: ${JSON.stringify(data.toggle)}${data.toggle.right > data.vw + 0.5 ? " ⚠" : ""}`);
  console.log(`  kartu harga: ${data.priceCards.join(" · ")}`);
  console.log(`  nav: ${data.navH}px`);
  if (data.offenders.length) {
    console.log(`  ⚠ overflow:`);
    for (const o of data.offenders) console.log(`    - <${o.tag} class="${o.cls}"> w=${o.w} [${o.left}..${o.right}]`);
  } else {
    console.log(`  ✓ tidak ada elemen melebihi viewport`);
  }
  if (data.clipped.length) {
    console.log(`  ⚠ teks terpotong:`);
    for (const c of data.clipped) console.log(`    - <${c.tag} class="${c.cls}"> client=${c.clientW} scroll=${c.scrollW}`);
  } else {
    console.log(`  ✓ tidak ada teks terpotong`);
  }
  console.log("");
}

ws.close();
chrome.kill();
process.exit(0);
