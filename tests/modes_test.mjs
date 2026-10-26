// Task modes (test mode): every mode opens through its task link, has Tab stops, Tab moves, Enter confirms and the counter follows; progress is in the saved state.
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
const TASKS = { lines: "T2.2-1", oov: "T2.2-2", triage: "T2.2-w", boundaries: "T2.2-0", structure: "T2.2-z", cursus: "T3.2", corrections: "T3.2c", ner: "T3.3", codicology: "T5.1", legal: "T5.2", arenga: "T5.3", edition: "T2.1" }, MODES = Object.keys(TASKS);
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9338/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable");
  const counts = {};
  for (const m of MODES) {
    await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&task=${TASKS[m]}&mode=${m}&sources=tests/none/` }); await sleep(3500);
    await ev(`localStorage.setItem("wb:tourSeen","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove())`);
    const st0 = await ev(`document.getElementById("modeStat").textContent`), sel = await ev(`document.getElementById("modeWrap").innerText.trim().startsWith("task · ${TASKS[m]}") ? "${m}" : ""`);
    const n = +(st0.match(/(\d+) stops/) || st0.match(/(\d+) suggestions/) || [0, 0])[1]; counts[m] = st0;
    check(sel === m && /^ner:|stops|no witness for this page|0 on this page/.test(st0), `${m}: opens through its task link (${st0})`);
    if (m === "edition") { check(st0 === "edition: no witness for this page", "edition: no witness file, so no stop"); continue; }
    if (m === "corrections") { check(st0 === "corrections: 0 on this page", "corrections: scribal corrections only; none on this page"); continue; }
    await key("Tab"); await sleep(400);
    const cur = await ev(`document.getElementById("modeCur").textContent`); check(cur.length > 0, `${m}: Tab reaches a stop (${cur.slice(0, 60)})`);
    const before = await ev(`document.getElementById("modeStat").textContent`);
    if (m === "legal") await key("1"); else if (m === "codicology") { await key("c"); await ev(`(() => { const i = document.getElementById("modeAskIn"); if (i) { i.value = "test"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } })()`); } else if (m === "arenga") { await key("c"); await ev(`(() => { const i = document.getElementById("modeAskIn"); if (i) { i.value = "test"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } })()`); } else if (m === "triage") await key("Enter"); else await key("Enter");
    await sleep(500); const after = await ev(`document.getElementById("modeStat").textContent`);
    check(after !== before, `${m}: a confirmation changes the counter (${before} -> ${after})`);
    const saved = await ev(`JSON.stringify(window.__wb.state.modes[${JSON.stringify(m)}] ? Object.keys(window.__wb.state.modes[${JSON.stringify(m)}].done).length : 0)`);
    check(+saved >= 1 || m === "triage" || m === "ner", `${m}: progress record kept (${saved})`);
  }
  // public-domain witnesses present (synthetic fixture, never real data): the band shows the regest, the edition mode has a stop, the TEI carries note, annotation and listBibl
  await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&task=T2.1&mode=edition&sources=tests/fixtures/` }); await sleep(3500);
  await ev(`localStorage.setItem("wb:tourSeen","1")`);
  const e1 = await ev(`document.getElementById("modeStat").textContent`); check(/\d+ stops/.test(e1) && +e1.match(/(\d+) stops/)[1] >= 1, `edition with a witness file: the differing tokens are the stops (${e1})`);
  const lw = await ev(`document.querySelectorAll(".lvw .witness").length + "|" + document.querySelectorAll(".lvw .wd").length`); check(/^[1-9]\d*\|[1-9]/.test(lw), `legacy line is the default view, differing tokens highlighted (${lw})`);
  const band = await ev(`[...document.querySelectorAll(".band")][1].innerText`); check(/Pressutti TEST-1/.test(band) && /Potthast TEST-2/.test(band), "the band of the entry shows the regests of the files");
  const tx = await ev(`window.__wb.tei()`); check(/<note type="regest" source="#Pressutti"/.test(tx) && /type="witness"[^>]*source="#Horoy"/.test(tx) && /<bibl xml:id="Pressutti">/.test(tx) && /<bibl xml:id="Horoy">/.test(tx), "TEI: regest notes, witness annotations, listBibl");
  const rl = await ev(`window.TEI_CHECKS.run(window.__wb.tei(), document.body.innerText).filter(r => !r.ok).map(r => r.id).join(",")`); check(rl === "", `rules met with witnesses loaded (${rl})`);
  await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&sources=tests/none/` }); await sleep(3500);
  const hd = await ev(`[!!document.getElementById("modeSel"), document.getElementById("viewSel").innerText, document.body.innerText.includes("simulated"), !!document.querySelector(".lvw .wd")].join("|")`);
  check(hd.startsWith("false|") && !/ink strip/.test(hd) && /false\|(true|false)$/.test(hd), `no mode dropdown; no ink option in the public build; no simulated text (${hd.replace(/\n/g, " ")})`);
  const lg = await ev(`document.querySelectorAll(".lvw .witness").length + "|" + document.querySelectorAll(".lvw .wd").length`); console.log("legacy lines shown:", lg);
  // without a task link the page is the plain review: no mode, Tab goes to the next flagged word
  await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&mode=ner&sources=tests/none/` }); await sleep(3500);
  await key("Tab"); await sleep(400); const pl = await ev(`[window.__wb.state.mode, !!window.__wb.state.focus, document.getElementById("modeStat").textContent].join("|")`);
  check(pl.startsWith("|true|"), `a mode without a task is ignored: plain review, Tab = next flagged word (${pl})`);
  // the public-domain witnesses of the sample (sample/154v/regests.json, witness.json)
  await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}&task=T2.1&mode=edition` }); await sleep(3500);
  const real = await ev(`JSON.stringify({ stat: document.getElementById("modeStat").textContent, witnessLines: document.querySelectorAll(".lvw .witness").length, diffTokens: document.querySelectorAll(".lvw .wd").length,
    perLine: [...document.querySelectorAll(".line")].map(r => [r.querySelector(".ln") && r.querySelector(".ln").firstChild.textContent, r.querySelectorAll(".lvw .wd").length]).filter(x => x[1] > 0),
    bands: [...document.querySelectorAll(".band")].map(b => (b.querySelector(".rg") ? [...b.querySelectorAll(".rg")].map(x => x.textContent).join(", ") : "-")) })`);
  console.log("sample witnesses:", real);
  const rr = JSON.parse(real); check(rr.witnessLines > 0 && /\d+ stops/.test(rr.stat), `the sample files load: ${rr.witnessLines} witness lines, ${rr.stat}`);
  const ru = await ev(`window.TEI_CHECKS.run(window.__wb.tei(), document.body.innerText).filter(r => !r.ok).map(r => r.id).join(",")`); check(ru === "", `rules met with the sample witnesses (${ru})`);
  console.log(JSON.stringify(counts, null, 1));
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "MODES OK" : "MODES FAILED"); process.exit(ok ? 0 : 1);
