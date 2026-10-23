// Guided tour test (test mode): every step shows, the practice steps advance by themselves after the action.
// Needs a static server on 127.0.0.1:8090 serving the parent directory, and chromium. usage: node tests/tour_test.mjs
import { spawn } from "node:child_process";
const URL_ = "http://127.0.0.1:8090/papreg_workbench/?test=1&page=RV10/4r&tour=1";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9334", "--user-data-dir=/tmp/wb-tour-profile", "--window-size=1400,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const cdp = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
const key = (k, extra = "") => ev(`document.dispatchEvent(new KeyboardEvent("keydown", {key: ${JSON.stringify(k)}, bubbles: true ${extra}}))`);
const title = () => ev(`(document.querySelector(".tour-card h3")||{}).textContent`);
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9334/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Page.navigate", { url: URL_ }); await sleep(4000);
  check(await title() === "Welcome", "tour starts with Welcome");
  const next = async () => { await ev(`document.getElementById("tourNext").click()`); await sleep(400); };
  await next(); check(await title() === "The reading", "step 2: The reading");
  await next(); await next(); check(await title() === "Try it: Tab", "step 4 waits for Tab");
  await key("Tab"); await sleep(1600); check(await title() === "Candidates", "Tab advanced to Candidates");
  await key("1"); await sleep(1600); check(await title() === "Undo", "accepting a candidate advanced to Undo");
  await key("z", ", ctrlKey: true"); await sleep(1600); check(await title() === "Cursus at the clause ends", "Ctrl+Z advanced to the cursus step");
  await next(); await next(); await next(); check(await title() === "Try it: approve a line", "approve step");
  await key("Tab"); await sleep(300); await key("Escape"); await sleep(200); await key("Enter"); await sleep(1600);
  check(await title() === "Current word and page", "Enter advanced past the approve step");
  for (let k = 0; k < 4; k++) await next();
  check(await title() === "That's it", "last step");
  await ev(`document.getElementById("tourNext").click()`); await sleep(300);
  check(!(await ev(`!!document.querySelector(".tour-card")`)), "tour closes");
  check(await ev(`!!document.getElementById("tourBtn")`), "Guided tour button present");
} catch (e) { console.log("FAIL exception", e); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "TOUR OK" : "TOUR FAILED"); process.exit(ok ? 0 : 1);
