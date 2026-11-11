// Formula layer (formulas.json, pilot2 scripts/139): loaded through page.json, shown without a task (spans .fm, legend on), off with the toggle,
// one TEI seg per occurrence.
// Needs a static server on 127.0.0.1:8090 serving the parent directory, and chromium. usage: node tests/formulas_test.mjs [page]
import { spawn } from "node:child_process";
const PAGE = process.argv[2] || "RV9/154v";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9340", "--user-data-dir=/tmp/wb-formulas-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const cdp = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const key = (k, extra = "") => ev(`document.dispatchEvent(new KeyboardEvent("keydown", {key: ${JSON.stringify(k)}, bubbles: true ${extra}}))`);
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
const open = async (q) => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}${q}&data=tests/fixtures/none/` }); await sleep(3500);
  await ev(`localStorage.setItem("wb:tourSeen.v2","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove())`);
};
// the first flagged, unedited word: [li, wi, key, line approved?, edited?, ✓ on the word?]
const wordState = (k) => ev(`(() => { const S = window.__wb.state, n = document.querySelector('.w[data-k="${k}"]'), li = +"${k}".split(/\\D+/).filter(Boolean)[0];
  return JSON.stringify({ edited: !!S.edits["${k}"], method: (S.edits["${k}"] || {}).method || "", green: !!(n && n.classList.contains("edited")), tick: !!(n && n.querySelector("sup.e")), lineE: S.apprE.size, pop: !!S.pop }); })()`).then(JSON.parse);
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9340/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Network.enable"); await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await open("");
  const r = JSON.parse(await ev(`JSON.stringify({ n: (window.__wb.state && document.querySelectorAll(".fm").length), fl: window.__wb.state.fml, legend: getComputedStyle(document.getElementById("fmLegend")).opacity,
    herde: document.querySelectorAll(".fm.fm-herde").length, chancery: document.querySelectorAll(".fm.fm-chancery").length, tip: ((document.querySelector(".fm.fm-herde") || {}).dataset || {}).tip || "" })`));
  check(r.fl === true && +r.legend === 1, `formulae layer on without a task (legend opacity ${r.legend})`);
  check(r.herde > 0 && r.chancery > 0, `legal (Herde) and chancery spans shown (${r.herde} / ${r.chancery})`);
  check(/Herde, Audientia litterarum/.test(r.tip), `a Herde span names its source (${r.tip.slice(0, 80)})`);
  await ev(`document.getElementById("bForm").click()`); await sleep(300);
  check(await ev(`document.querySelectorAll(".fm").length`) === 0, "the formulae toggle hides them");
  const segs = await ev(`(window.__wb.tei().match(/<seg type="formula"/g) || []).length`);
  check(segs >= 20, `TEI: one seg per occurrence (${segs})`);
} catch (e) { console.log("FAIL " + e.message); ok = false; }
chrome.kill(); console.log(ok ? "ALL PASS" : "SOME FAILED"); process.exit(ok ? 0 : 1);
