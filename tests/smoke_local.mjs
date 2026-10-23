// Smoke test in local mode (no GitHub): open a side, correct the first flagged word with candidate 1, save, reload,
// check that the correction and the task view survive. usage: node tests/smoke_local.mjs [page] [local|test]. Needs: python3 -m http.server 8090 in the parent directory
// (so that the local data copy named in config.local.json is served) and chromium. usage: node tests/smoke_local.mjs [page]
import { spawn } from "node:child_process";
const PAGE = process.argv[2] || "RV10/4r", MODE = process.argv[3] || "local";
const BASE = MODE === "test" ? "http://127.0.0.1:8090/papreg_workbench/?test=1" : "http://127.0.0.1:8090/papreg_workbench/?config=config.local.json";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9333", "--user-data-dir=/tmp/wb-smoke-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
async function cdp(method, params = {}) { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise(r => pending.set(i, r)); }
async function evalJS(expr) { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; }
async function open(url) { await cdp("Page.navigate", { url }); await sleep(3500); }
let ok = true; const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); ok = ok && cond; };
try {
  let targets; for (let k = 0; k < 40; k++) { try { targets = await (await fetch("http://127.0.0.1:9333/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await open(BASE + "&page=" + PAGE);
  const lines = await evalJS(`document.querySelectorAll(".line").length`); check(lines > 0, `page ${PAGE} renders ${lines} lines`);
  const flagged = await evalJS(`document.querySelectorAll(".w.low, .w.med").length`); check(flagged > 0, `${flagged} flagged words`);
  // correct: Tab to the first flagged word, accept candidate 1
  await evalJS(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true}))`); await sleep(300);
  await evalJS(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "1", bubbles: true}))`); await sleep(300);
  const edits = await evalJS(`Object.keys(window.__wb.state.edits).length`); check(edits === 1, `one correction recorded (${edits})`);
  await evalJS(`window.__wbTick()`); await sleep(500);
  const stored = await evalJS(`Object.keys(localStorage).filter(k => k.includes(":corrections")).map(k => Object.keys(JSON.parse(localStorage.getItem(k)).pages)).flat().join(",")`);
  check((stored || "").includes(PAGE), `saved to the corrections file (${stored})`);
  const tele = await evalJS(`Object.keys(localStorage).filter(k => k.includes(":telemetry")).map(k => JSON.stringify(JSON.parse(localStorage.getItem(k)).pages)).join("")`);
  check((tele || "").includes("decisions"), "telemetry session recorded");
  await open(BASE + "&page=" + PAGE);
  const again = await evalJS(`Object.keys(window.__wb.state.edits).length`); check(again === 1, `correction restored after reload (${again})`);
  await open(BASE);
  const tv = await evalJS(`document.querySelector(".wb-tasks h2") ? document.querySelector(".wb-tasks h2").textContent : ""`); check(/My tasks/.test(tv || ""), `task view: ${tv}`);
  await evalJS(`document.getElementById("wbTake") && document.getElementById("wbTake").click()`); await sleep(1500);
  const mine = await evalJS(`document.querySelector(".wb-tasks h2").textContent`); check(/My tasks \([1-9]/.test(mine || ""), `tasks taken: ${mine}`);
  if (MODE === "test") { await open("http://127.0.0.1:8090/papreg_workbench/"); const lg = await evalJS(`!!document.getElementById("wbTry") && !document.body.innerText.includes("PAPREG/")`); check(lg, "login page offers the test side and names no data repository"); }
} catch (e) { console.log("FAIL exception", e); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "SMOKE OK" : "SMOKE FAILED"); process.exit(ok ? 0 : 1);
