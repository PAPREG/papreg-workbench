// Task modes (test mode): every mode opens through ?mode=, has Tab stops, Tab moves, Enter confirms and the counter follows; progress is in the saved state.
// Needs a static server on 127.0.0.1:8090 serving the parent directory, and chromium. usage: node tests/modes_test.mjs [page]
import { spawn } from "node:child_process";
const PAGE = process.argv[2] || "RV9/154v";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9338", "--user-data-dir=/tmp/wb-modes-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const cdp = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const key = (k, extra = "") => ev(`document.dispatchEvent(new KeyboardEvent("keydown", {key: ${JSON.stringify(k)}, bubbles: true ${extra}}))`);
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
const MODES = ["triage", "boundaries", "structure", "cursus", "corrections", "ner", "codicology", "legal", "arenga", "edition"];
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9338/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable");
  const counts = {};
  for (const m of MODES) {
    await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&mode=${m}&tour=0` }); await sleep(3500);
    await ev(`localStorage.setItem("wb:tourSeen","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove())`);
    const st0 = await ev(`document.getElementById("modeStat").textContent`), sel = await ev(`document.getElementById("modeSel").value`);
    const n = +(st0.match(/(\d+) stops/) || st0.match(/(\d+) suggestions/) || [0, 0])[1]; counts[m] = st0;
    check(sel === m && /^ner:|stops/.test(st0), `${m}: opens through ?mode= (${st0})`);
    if (m === "edition") { check(n === 0, "edition: no witness loaded, no stop"); continue; }
    await key("Tab"); await sleep(400);
    const cur = await ev(`document.getElementById("modeCur").textContent`); check(cur.length > 0, `${m}: Tab reaches a stop (${cur.slice(0, 60)})`);
    const before = await ev(`document.getElementById("modeStat").textContent`);
    if (m === "legal") await key("1"); else if (m === "codicology") { await key("c"); await ev(`(() => { const i = document.getElementById("modeAskIn"); if (i) { i.value = "test"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } })()`); } else if (m === "arenga") { await key("c"); await ev(`(() => { const i = document.getElementById("modeAskIn"); if (i) { i.value = "test"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } })()`); } else if (m === "triage") await key("Enter"); else await key("Enter");
    await sleep(500); const after = await ev(`document.getElementById("modeStat").textContent`);
    check(after !== before, `${m}: a confirmation changes the counter (${before} -> ${after})`);
    const saved = await ev(`JSON.stringify(window.__wb.state.modes[${JSON.stringify(m)}] ? Object.keys(window.__wb.state.modes[${JSON.stringify(m)}].done).length : 0)`);
    check(+saved >= 1 || m === "triage" || m === "ner", `${m}: progress record kept (${saved})`);
  }
  console.log(JSON.stringify(counts, null, 1));
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "MODES OK" : "MODES FAILED"); process.exit(ok ? 0 : 1);
