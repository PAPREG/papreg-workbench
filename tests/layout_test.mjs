// Layout test: every witness token sits under its register token (the .wit box lies horizontally inside the .reg box of its pair, +-4 px), the sigla stand in the gutter and
// nothing of the witness is in the text column outside the pairs; screenshots of lines 4, 26, 31 and 38 go to tests/artefacts/.
// (Playwright is not installed here; this uses the same headless chromium over the DevTools protocol.)  usage: node tests/layout_test.mjs  (static server on 127.0.0.1:8090)
import { spawn } from "node:child_process"; import { writeFileSync, mkdirSync } from "node:fs";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9340", "--user-data-dir=/tmp/wb-layout-profile", "--window-size=1500,700", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let ws, id = 0; const pend = new Map();
const cdp = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
mkdirSync(new URL("./artefacts/", import.meta.url), { recursive: true });
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9340/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Page.navigate", { url: "http://127.0.0.1:8090/papreg_workbench/?test=1&page=RV9/154v" }); await sleep(4500);
  await ev(`localStorage.setItem("wb:tourSeen","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove()); document.querySelector("header").style.position = "static"; document.getElementById("pageImg").style.display = "none"`);
  const geo = JSON.parse(await ev(`JSON.stringify((() => { let n = 0, bad = []; document.querySelectorAll(".pair").forEach(p => { const reg = p.querySelector(".reg").getBoundingClientRect();
    p.querySelectorAll(".wit").forEach(w => { if (!w.textContent.replace(/\\u00a0/g, "").trim()) return; n++; const b = w.getBoundingClientRect(); if (b.left < reg.left - 4 || b.right > reg.right + 4) bad.push([w.textContent.slice(0, 20), Math.round(b.left - reg.left), Math.round(reg.right - b.right)]); }); });
    const free = [...document.querySelectorAll(".line .txt")].filter(t => [...t.querySelectorAll(".wit")].some(w => !w.closest(".pair"))).length; const sig = document.querySelectorAll(".wsig .wit.siglum").length, sigInText = document.querySelectorAll(".txt .wit.siglum").length;
    return { n, bad: bad.slice(0, 5), nbad: bad.length, free, sig, sigInText }; })())`));
  check(geo.n > 100 && geo.nbad === 0, `every witness token lies inside the box of its register token (${geo.n} checked, ${geo.nbad} outside ${JSON.stringify(geo.bad)})`);
  check(geo.free === 0 && geo.sigInText === 0 && geo.sig > 0, `no witness outside the pairs; sigla only in the gutter (${geo.sig} sigla)`);
  for (const lab of ["4", "26", "31", "38"]) {
    const sy = await ev(`(() => { const r = [...document.querySelectorAll(".line")].find(n => (n.querySelector(".ln") || {}).firstChild && n.querySelector(".ln").firstChild.textContent === "${lab}"); r.scrollIntoView({ block: "start" }); window.scrollBy(0, -6); return window.scrollY; })()`); await sleep(400);
    const r = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 20, y: sy, width: 1480, height: 330, scale: 1 } }); writeFileSync(new URL(`./artefacts/layout_l${lab}.png`, import.meta.url), Buffer.from(r.result.data, "base64")); if (process.env.SHOTS_COPY) writeFileSync(`${process.env.SHOTS_COPY}/layout_l${lab}.png`, Buffer.from(r.result.data, "base64"));
  }
  console.log("screenshots: tests/artefacts/layout_l4.png, l26, l31, l38");
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "LAYOUT OK" : "LAYOUT FAILED"); process.exit(ok ? 0 : 1);
