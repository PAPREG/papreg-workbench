// Clean-checkout test of the public build: clone the repository into a temporary directory, build the public bundle there, serve the bundle (not the dev tree),
// open fol. 154v and assert that the page image request returns 200 with the build hash, the panel reports "loaded", the strip of line 25 is rendered, and that
// neither page.jpg nor a strips/ file is requested; also that no service worker and no manifest can cache an old thumbnail. This test gates the push (push.sh).
// usage: node tests/public_build_test.mjs   (needs git, chromium; the repository must be committed: the clone sees HEAD only)
import { spawn, execSync } from "node:child_process"; import { createServer } from "node:http"; import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, extname } from "node:path";
const repo = new URL("..", import.meta.url).pathname, tmp = mkdtempSync(join(tmpdir(), "wb-public-")), clone = join(tmp, "clone"), dist = join(tmp, "dist");
let ok = true; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); ok = ok && c; };
mkdirSync(new URL("./artefacts/", import.meta.url), { recursive: true });
execSync(`git clone --quiet --no-hardlinks "${repo}" "${clone}"`);
let chk = 0; try { execSync(`bash "${clone}/tools/build_public.sh" --check`, { stdio: "pipe" }); } catch (e) { chk = 1; }
check(chk === 0, "build.json of the clone is the hash of its tracked files");
execSync(`bash "${clone}/tools/build_public.sh" "${dist}"`, { stdio: "pipe" }); const build = JSON.parse(readFileSync(join(dist, "build.json"))).hash;
check(existsSync(join(dist, "sample/154v/page.synthetic.png")) && !existsSync(join(dist, "sample/154v/page.jpg")) && !existsSync(join(dist, "sample/154v/strips")), "the bundle holds the synthetic page and neither page.jpg nor strips/");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css", ".md": "text/plain" };
const served = [], srv = createServer((q, r) => { const u = new URL(q.url, "http://x"); let f = join(dist, decodeURIComponent(u.pathname)); if (u.pathname.endsWith("/")) f = join(f, "index.html");
  if (!existsSync(f) || !f.startsWith(dist)) { served.push([404, u.pathname]); r.writeHead(404); r.end(); return; } served.push([200, u.pathname + u.search]); r.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
const chrome = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9342", `--user-data-dir=${join(tmp, "profile")}`, "--window-size=1500,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let ws, id = 0; const pend = new Map();
const cdp = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise(r => pend.set(i, r)); };
const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
try {
  let t; for (let k = 0; k < 40; k++) { try { t = await (await fetch("http://127.0.0.1:9342/json")).json(); break; } catch (e) { await sleep(250); } }
  ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  const resp = [], failed = []; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === "Network.responseReceived") resp.push([d.params.response.status, d.params.response.url]); if (d.method === "Network.loadingFailed") failed.push(d.params.errorText); };
  await cdp("Network.enable"); await cdp("Page.enable"); const url = `http://127.0.0.1:${port}/?test=1&page=RV9/154v`; await cdp("Page.navigate", { url }); await sleep(8000);
  await ev(`localStorage.setItem("wb:tourSeen","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove())`);
  const im = resp.find(r => /page\.synthetic\.png/.test(r[1])); console.log("image URL as served:", im && im[1]);
  check(!!im && im[0] === 200 && im[1].endsWith("?v=" + build), `the page image request returns 200 with the build hash (${im && im[0]}, v=${build})`);
  const panel = await ev(`document.getElementById("pageSrc").textContent`); check(/^source: simulated page · loaded 3376×4268$/.test(panel), `the panel reports "${panel}"`);
  const strip = JSON.parse(await ev(`JSON.stringify((() => { const r = [...document.querySelectorAll(".line")].find(n => (n.querySelector(".ln") || {}).firstChild && n.querySelector(".ln").firstChild.textContent === "25"); const cv = r && r.querySelector(".lv.strip canvas"); if (!cv) return { ok: false }; const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let dark = 0; for (let i = 0; i < d.length; i += 40) if (d[i] < 120) dark++; return { ok: true, w: cv.width, h: cv.height, dark }; })())`));
  check(strip.ok && strip.dark > 20, `the strip of line 25 is rendered above the text (${strip.w}x${strip.h}, ${strip.dark} dark samples), with no task link`);
  const bid = JSON.parse(await ev(`JSON.stringify({ id: document.getElementById("buildId").textContent, stale: !!document.getElementById("staleBar") })`)); check(bid.id === "build " + build.slice(0, 7) && !bid.stale, `the toolbar shows the running build (${bid.id}), no out-of-date bar`);
  // marking and correcting in the clean bundle
  const ed = JSON.parse(await ev(`(async () => { const sl = (ms) => new Promise(r => setTimeout(r, ms)); const k = (key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); const out = {};
    const w = [...document.querySelectorAll(".w.high")].find(e => !e.classList.contains("edited")); w.click(); await sl(200); k("n"); await sl(200); k("6"); await sl(300); const ne = document.querySelector(".w.ne.c-date"); out.ne = !!ne && getComputedStyle(ne).backgroundColor !== "rgba(0, 0, 0, 0)";
    const low = [...document.querySelectorAll(".w.low, .w.med")].find(e => (e.click(), true)); await sl(200); const dk = low.dataset.k; const inp = document.getElementById("manual"); inp.value = "correctum"; inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await sl(400);
    const e2 = document.querySelector('.w[data-k="' + dk + '"]'), cs = getComputedStyle(e2); out.edited = /edited/.test(e2.className) && !/low|med/.test(e2.className) && cs.textDecorationLine === "none"; return JSON.stringify(out); })()`));
  const sg = JSON.parse(await ev(`(async () => { const sl = (ms) => new Promise(r => setTimeout(r, ms)); const li = [...document.querySelectorAll("li.empty")].find(e => /^Suggestions/.test(e.textContent)); const head = li ? li.textContent : "";
    const b = document.querySelector("[data-sugg-all]"); if (!b) return JSON.stringify({ head, none: true }); const n = +b.textContent.match(/\\d+/)[0], before = window.__wb.state.ne.length; b.click(); await sl(300); return JSON.stringify({ head, n, added: window.__wb.state.ne.length - before }); })()`));
  check(!/ERCDiDip/.test(sg.head) && (sg.none || sg.added === sg.n), `suggestions: no ERCDiDip prefix, accept-all adds every open suggestion of the word (${JSON.stringify(sg)})`);
  check(ed.ne && ed.edited, `clean bundle: a marked entity takes its colour, a corrected word loses the underline (${JSON.stringify(ed)})`);
  const bad = resp.filter(r => /page\.jpg|\/strips\//.test(r[1])).length + served.filter(s => /page\.jpg|\/strips\//.test(s[1])).length; check(bad === 0, `no page.jpg or strips/ request (${bad})`);
  const sw = await ev(`(async () => { const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []; return regs.length + "|" + document.querySelectorAll('link[rel=manifest]').length; })()`); check(sw === "0|0", `no service worker, no manifest (${sw})`);
  const not404 = served.filter(s => s[0] === 404 && !/favicon/.test(s[1])); check(not404.length === 0 && failed.length === 0, `no missing file in the bundle (${JSON.stringify(not404)} ${failed.length} failed)`);
  const box = JSON.parse(await ev(`JSON.stringify((() => { const v = document.querySelector(".viewer").getBoundingClientRect(); return { x: v.x, y: 0, w: v.width, h: Math.min(v.height, 780) }; })())`));
  const save = async (name, clip) => { const r = await cdp("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } }); const b = Buffer.from(r.result.data, "base64"); writeFileSync(new URL(`./artefacts/${name}`, import.meta.url), b); if (process.env.SHOTS_COPY) writeFileSync(`${process.env.SHOTS_COPY}/${name}`, b); };
  await save("public_panel.png", { x: 0, y: 0, width: 480, height: 800 });
  const sy = await ev(`(() => { const r = [...document.querySelectorAll(".line")].find(n => (n.querySelector(".ln") || {}).firstChild && n.querySelector(".ln").firstChild.textContent === "25"); r.scrollIntoView({ block: "start" }); window.scrollBy(0, -6); return window.scrollY; })()`); await sleep(500);
  await save("public_l25.png", { x: 480, y: sy, width: 1020, height: 300 });
  // a failing image is shown, not replaced: remove the file from the served bundle and reload
  rmSync(join(dist, "sample/154v/page.synthetic.png")); await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/?test=1&page=RV9/154v&nocache=1` }); await sleep(4500);
  const miss = JSON.parse(await ev(`JSON.stringify({ src: document.getElementById("pageSrc").textContent, red: getComputedStyle(document.getElementById("pageSrc")).color, pip: (document.querySelector("#pipMs .imgerr") || {}).textContent, polys: document.querySelectorAll("#page polygon, #page rect").length, imgHidden: document.getElementById("pageImg").hidden })`));
  check(/^page image not found: http:\/\/127\.0\.0\.1:\d+\/sample\/154v\/page\.synthetic\.png\?v=\w+ \(404\)$/.test(miss.src) && /192, ?57, ?43/.test(miss.red.replace(/\s/g, "")) && /page image not found/.test(miss.pip || "") && miss.polys === 0, `a missing image is reported in red in both panels, with no substitute thumbnail ("${miss.src}")`);
  await save("public_missing.png", { x: 0, y: 0, width: 480, height: 600 });
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); srv.close(); try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
console.log(ok ? "PUBLIC BUILD OK" : "PUBLIC BUILD FAILED"); process.exit(ok ? 0 : 1);
