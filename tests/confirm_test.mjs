// Enter on a flagged word confirms the word (green, ✓ on the word), not the whole line; Enter with no word open still approves the line.
// Plain view (click a flagged word, Enter), the empty correction field (Enter), and the triage task (Enter on the current word).
// Needs a static server on 127.0.0.1:8090 serving the parent directory, and chromium. usage: node tests/confirm_test.mjs [page]
import { spawn } from "node:child_process";
const PAGE = process.argv[2] || "RV9/154v";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9339", "--user-data-dir=/tmp/wb-confirm-profile", "about:blank"], { stdio: "ignore" });
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
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9339/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Network.enable"); await cdp("Network.setCacheDisabled", { cacheDisabled: true });

  // 1. plain view: click a flagged word, Enter
  await open("");
  const flagged = () => ev(`(() => { const n = [...document.querySelectorAll(".w.low[data-k], .w.med[data-k]")].find(x => !x.classList.contains("edited") && !x.classList.contains("sg")); return n ? n.dataset.k : ""; })()`);
  const k1 = await flagged(); check(!!k1, `plain: a flagged word on the page (${k1})`);
  await ev(`document.querySelector('.w[data-k="${k1}"]').click()`); await sleep(300);
  const a0 = await wordState(k1); check(a0.pop && !a0.edited, "plain: the word box opens, word not yet edited");
  await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await key("Enter"); await sleep(400);
  const a1 = await wordState(k1);
  check(a1.edited && a1.method === "confirmed", `plain: Enter confirms the word as read (method ${a1.method})`);
  check(a1.green && a1.tick, "plain: the word turns green with a ✓");
  check(a1.lineE === a0.lineE, `plain: the line is not approved by it (approved lines ${a0.lineE} -> ${a1.lineE})`);

  // 2. the correction field focused and empty: Enter confirms too
  const k2 = await flagged(); await ev(`document.querySelector('.w[data-k="${k2}"]').click()`); await sleep(300);
  await ev(`(() => { const i = document.getElementById("manual"); i.value = ""; i.focus(); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`); await sleep(400);
  const b1 = await wordState(k2); check(b1.edited && b1.method === "confirmed" && b1.green && b1.tick, `field: Enter in the empty field confirms the word (${k2})`);

  // 3. no word open: Enter still approves the line
  await key("Escape"); await sleep(200);
  const before = await ev(`window.__wb.state.apprE.size`);
  await ev(`(() => { const S = window.__wb.state; S.pop = null; S.active = S.active === null ? 0 : S.active; })()`);
  await key("Enter"); await sleep(400);
  const after = await ev(`window.__wb.state.apprE.size`); check(after === before + 1, `line: Enter with no word open approves the line (${before} -> ${after})`);

  // 4. undo takes the confirmation back
  await key("z", ", ctrlKey: true"); await sleep(300); await key("z", ", ctrlKey: true"); await sleep(300); await key("z", ", ctrlKey: true"); await sleep(300);
  const u = await wordState(k1); check(!u.edited && !u.green && !u.tick, "undo: the confirmation is undone");

  // 5. triage task: Enter on the current word confirms it, not the line
  await open("&task=T2.2-w&mode=triage");
  await key("Tab"); await sleep(400);
  const kt = await ev(`(() => { const f = window.__wb.state.focus; return f ? f[0] + ":" + f[1] : ""; })()`);
  const kk = await ev(`(() => { const n = document.querySelector(".w.focus[data-k], .w.cur[data-k]"); return n ? n.dataset.k : ""; })()`);
  const tk = kk || await ev(`(() => { const f = window.__wb.state.focus; return document.querySelectorAll(".line")[f[0]].querySelectorAll(".w[data-k]")[0].dataset.k; })()`);
  const t0 = await ev(`window.__wb.state.apprE.size`), e0 = await ev(`Object.keys(window.__wb.state.edits).length`);
  await key("Enter"); await sleep(400);
  const t1 = await ev(`window.__wb.state.apprE.size`), e1 = await ev(`Object.keys(window.__wb.state.edits).length`);
  const conf = await ev(`Object.values(window.__wb.state.edits).filter(x => x.method === "confirmed").length`);
  check(e1 === e0 + 1 && conf === 1, `triage: Enter confirms the current word (${kt}; edits ${e0} -> ${e1})`);
  check(t1 === t0, `triage: the line is not approved (${t0} -> ${t1})`);
  check(await ev(`document.querySelectorAll(".w.edited sup.e").length`) >= 1, "triage: the confirmed word shows green with a ✓");
} catch (e) { console.log("FAIL " + e.message); ok = false; }
chrome.kill(); console.log(ok ? "ALL PASS" : "SOME FAILED"); process.exit(ok ? 0 : 1);
