// TEI export test (test mode): the export of the untouched test side and of a side with the editor's interventions is well formed,
// every facs / target / corresp / hand / ana pointer resolves, the numbering and the responsibility statements are as declared.
// Needs a static server on 127.0.0.1:8090 serving the parent directory, and chromium. usage: node tests/tei_test.mjs [page]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const PAGE = process.argv[2] || "RV9/154v";
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9335", "--user-data-dir=/tmp/wb-tei-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const cdp = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result && r.result.result && r.result.result.value; };
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
const CHECKS = `(() => {
  const x = window.__wb.tei(), d = new DOMParser().parseFromString(x, "application/xml"), err = d.querySelector("parsererror");
  if (err) return { wellFormed: false, msg: err.textContent.slice(0, 300) };
  const NS = "http://www.tei-c.org/ns/1.0", all = [...d.getElementsByTagNameNS(NS, "*")], ids = new Set(all.map(e => e.getAttribute("xml:id")).filter(Boolean));
  const dangling = []; all.forEach(e => ["facs", "target", "corresp", "hand", "ana", "new"].forEach(a => { const v = e.getAttribute(a); if (v) v.split(/\\s+/).forEach(r => { if (r[0] === "#" && !ids.has(r.slice(1))) dangling.push(e.localName + "@" + a + "=" + r); }); }));
  const dup = all.map(e => e.getAttribute("xml:id")).filter(Boolean).filter((v, i, a) => a.indexOf(v) !== i);
  const q = (n) => d.getElementsByTagNameNS(NS, n), has = (n, f) => [...q(n)].filter(f || (() => true)).length;
  // the page's validation rules (also written in docs/tei_rules.md)
  const zoneIds = new Set([...q("zone")].map(z => z.getAttribute("xml:id"))), facing = new Set([...q("zone")].filter(z => z.getAttribute("type") === "facing-page").map(z => z.getAttribute("xml:id")));
  const facsBad = [], facingHit = []; all.forEach(e => { ["facs", "target"].forEach(a => (e.getAttribute(a) || "").split(/\\s+/).filter(Boolean).forEach(r => { const id = r.replace(/^#/, ""); if (a === "facs" && !zoneIds.has(id)) facsBad.push(id); if (facing.has(id) && e.localName !== "zone") facingHit.push(e.localName); })); });
  const entries = [...q("div")].filter(e => e.getAttribute("type") === "entry"), noInscr = entries.filter(e => !e.getAttribute("part") && e.getAttribute("subtype") !== "in-eundem-modum" && ![...e.children].some(c => c.localName === "div" && c.getAttribute("type") === "inscriptio")).map(e => e.getAttribute("n"));
  const partBad = entries.filter((e, i) => { const p = e.getAttribute("part"); return (p === "F" && i !== 0) || ((p === "I") && i !== entries.length - 1) || (p === "M" && entries.length > 1); }).map(e => e.getAttribute("n"));
  const addNoShift = [...q("add")].filter(a => a.getAttribute("place") === "line-end" && !(a.previousElementSibling && a.previousElementSibling.localName === "handShift")).length;
  const nCls = [...q("taxonomy")].filter(t => t.getAttribute("xml:id") === "entity-classes").map(t => [...t.children].map(c => c.getAttribute("xml:id")).join(","))[0];
  const lbs = [...q("lb")].map(e => e.getAttribute("n"));
  return { wellFormed: true, dangling, dup, zones: q("zone").length, entries: has("div", e => e.getAttribute("type") === "entry"), iem: has("div", e => e.getAttribute("subtype") === "in-eundem-modum"),
    parts: [...q("div")].filter(e => e.getAttribute("type") === "entry").map(e => e.getAttribute("part") || "-").join(","),
    editorResp: has("div", e => e.getAttribute("resp") === "#editor"), add: q("add").length, del: q("del").length, subst: q("subst").length, handNotes: q("handNote").length, handShift: q("handShift").length,
    marginalia: has("div", e => e.getAttribute("type") === "marginalia"), ann: Object.fromEntries([...new Set([...q("annotation")].map(e => e.getAttribute("type")))].map(t => [t, has("annotation", e => e.getAttribute("type") === t)])),
    cursusInline: x.includes('type="cursus"') && /<note type="cursus"/.test(x), lbNums: lbs.slice(0, 3).concat(lbs.slice(-3)), availability: has("availability", e => e.getAttribute("status") === "restricted"), facsBad, facingHit, noInscr, partBad, addNoShift, nCls, archive: /vatican/i.test(x) || /vatican/i.test(document.body.innerText),
    ent: { persName: q("persName").length, roleName: q("roleName").length, placeName: q("placeName").length, actorRole: has("rs", e => e.getAttribute("type") === "actor" && e.getAttribute("role") === "recipient"), obj: has("rs", e => e.getAttribute("type") === "object"), measure: q("measure").length > 0 } };
})()`;
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9335/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await cdp("Page.enable"); await cdp("Page.navigate", { url: `http://127.0.0.1:8090/papreg_workbench/?test=1&page=${PAGE}` }); await sleep(4000);
  let r = await ev(CHECKS);
  if (process.env.TEI_OUT) writeFileSync(process.env.TEI_OUT + ".plain.xml", await ev("window.__wb.tei()"));
  check(r.wellFormed, "untouched side: well formed " + (r.msg || ""));
  check(r.dangling.length === 0 && r.dup.length === 0, `no dangling pointer, no duplicate xml:id (${r.dangling.slice(0, 4)} ${r.dup.slice(0, 4)})`);
  check(r.zones > 0 && r.availability === 1 && r.handNotes === 3, `facsimile zones ${r.zones}, restricted availability, handNotes h1-h3`);
  check(r.editorResp === 0, "nothing carries #editor before the editor has done anything");
  check(r.facsBad.length === 0, `every facs resolves to a zone of the surface (${r.facsBad.slice(0, 3)})`);
  check(r.facingHit.length === 0, "no annotation or text points at a facing-page zone");
  check(r.noInscr.length === 0, `every entry has an inscriptio, is in-eundem-modum or continues the previous folio (${r.noInscr})`);
  check(r.partBad.length === 0 && r.addNoShift === 0, `part values fit the page edges; every line-end add follows a handShift (${r.partBad} ${r.addNoShift})`);
  check(!r.archive, "the archive's name occurs neither in the file nor in the interface");
  check(r.nCls === "N1,N2,N3,N4,N5,N6,N7,N8,N9", `entity classes in classDecl = hotkeys N1-N9 (${r.nCls})`);
  check(!r.cursusInline && r.ann.cursus > 0 && r.ann["word-confidence"] > 0, `cursus and confidence are standoff (${JSON.stringify(r.ann)})`);
  check(r.marginalia === 0 && r.ann["marginal-text"] > 0, "undecided marginal lines are standoff candidates, not a marginalia div");
  console.log("     entries", r.entries, "iem", r.iem, "parts", r.parts, "lb", r.lbNums.join(" "));
  // the editor: an interlinear addition, a correction, a deletion, a hand change, one marginal addition placed in the text, one marginal note, one corrected word
  const keys = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(".line:not(.marg) .w")].map(n => n.dataset.k).slice(20, 26))`));
  const nMarg = await ev(`document.querySelectorAll(".line.marg").length`);
  const doApp = (k, type, text, hand) => ev(`(() => { const W = window.__wb, gi = W.GI[${JSON.stringify(k)}]; if (gi === undefined) return false;
    W.state.app.push({ id: ++W.state.seq, gi, span: 1, type: ${JSON.stringify(type)}, text: ${JSON.stringify(text)}, hand: ${JSON.stringify(hand)}, at: "t" }); return true; })()`);
  const a1 = await doApp(keys[0], "add. supra lin.", "", "m2"), a2 = await doApp(keys[1], "corr. ex", "pretera", ""), a3 = await doApp(keys[2], "del.", "", ""), a4 = await doApp(keys[3], "alia manu", "", "m3");
  check(a1 && a2 && a3 && a4, "four apparatus entries set");
  await ev(`(() => { const W = window.__wb, s = W.state, ml = [...document.querySelectorAll(".line.marg")].map(n => +n.dataset.li);
    s.marg[ml[0]] = { as: "add", place: "margin", after: W.GI[${JSON.stringify(keys[4])}] }; s.marg[ml[1]] = { as: "note" }; s.edits[${JSON.stringify(keys[5])}] = { corrected: "emendatum", method: "typed", at: "t" };
    const g = (k, span, type, role) => s.ne.push({ id: ++s.seq, gi: W.GI[k], span, type, role: role || "", sub: "", at: "t" });
    g(${JSON.stringify(keys[0])}, 1, "per"); g(${JSON.stringify(keys[1])}, 1, "title"); g(${JSON.stringify(keys[2])}, 1, "loc"); g(${JSON.stringify(keys[3])}, 1, "actor", "a"); g(${JSON.stringify(keys[4])}, 1, "obj"); })()`);
  r = await ev(CHECKS);
  if (process.env.TEI_OUT) writeFileSync(process.env.TEI_OUT + ".edited.xml", await ev("window.__wb.tei()"));
  check(r.wellFormed, "edited side: well formed " + (r.msg || ""));
  check(r.dangling.length === 0 && r.dup.length === 0, `no dangling pointer, no duplicate xml:id (${r.dangling.slice(0, 4)} ${r.dup.slice(0, 4)})`);
  check(r.add === 6 && r.del === 2 && r.subst === 1 && r.handShift === 8 && r.handNotes === 5, `add ${r.add}, del ${r.del}, subst ${r.subst}, handShift ${r.handShift}, handNotes ${r.handNotes}`);
  check(r.editorResp === 0, "structure parts keep #rules unless the editor moved a boundary");
  check(r.ent.persName === 1 && r.ent.roleName === 1 && r.ent.placeName === 1 && r.ent.actorRole === 1 && r.ent.obj === 1, `entity classes in the text: ${JSON.stringify(r.ent)}`);
  check(r.marginalia === 1, "a line marked as note stands in the marginalia div");
  check(r.ann["marginal-text"] === nMarg - 2, `decided marginal lines left the standoff list (${r.ann["marginal-text"]} of ${nMarg})`);
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "TEI OK" : "TEI FAILED"); process.exit(ok ? 0 : 1);
