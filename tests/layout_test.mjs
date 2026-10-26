// Layout test: every witness token sits under its register token (the .wit box lies horizontally inside the .reg box of its pair, +-4 px), the sigla stand in the gutter and
// nothing of the witness is in the text column outside the pairs; screenshots of lines 4, 26, 31 and 38 go to tests/artefacts/.
// (Playwright is not installed here; this uses the same headless chromium over the DevTools protocol.)  usage: node tests/layout_test.mjs  (static server on 127.0.0.1:8090)
import { spawn, execSync } from "node:child_process"; import { writeFileSync, mkdirSync } from "node:fs";
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
  const urls = []; ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Network.requestWillBeSent") urls.push(d.params.request.url); });
  await cdp("Network.enable"); await cdp("Page.enable"); await cdp("Page.navigate", { url: "http://127.0.0.1:8090/papreg_workbench/?test=1&page=RV9/154v&task=T2.1&mode=edition" }); await sleep(4500);
  await ev(`localStorage.setItem("wb:tourSeen","1"); document.querySelectorAll(".tour-card,.tour-spot").forEach(n => n.remove()); document.querySelector("header").style.position = "static"; document.getElementById("pageImg").style.display = "none"`);
  const geo = JSON.parse(await ev(`JSON.stringify((() => { let n = 0, bad = []; document.querySelectorAll(".pair").forEach(p => { const reg = p.querySelector(".reg").getBoundingClientRect();
    p.querySelectorAll(".wit").forEach(w => { if (!w.textContent.replace(/\\u00a0/g, "").trim()) return; n++; const b = w.getBoundingClientRect(); if (b.left < reg.left - 4 || b.right > reg.right + 4) bad.push([w.textContent.slice(0, 20), Math.round(b.left - reg.left), Math.round(reg.right - b.right)]); }); });
    const free = [...document.querySelectorAll(".line .txt")].filter(t => [...t.querySelectorAll(".wit")].some(w => !w.closest(".pair"))).length; const sig = document.querySelectorAll(".wsig .wit.siglum").length, sigInText = document.querySelectorAll(".txt .wit.siglum").length;
    return { n, bad: bad.slice(0, 5), nbad: bad.length, free, sig, sigInText }; })())`));
  check(geo.n > 100 && geo.nbad === 0, `every witness token lies inside the box of its register token (${geo.n} checked, ${geo.nbad} outside ${JSON.stringify(geo.bad)})`);
  check(geo.free === 0 && geo.sigInText === 0 && geo.sig > 0, `no witness outside the pairs; sigla only in the gutter (${geo.sig} sigla)`);
  // siglum baseline: the y of every gutter siglum equals the y of the corresponding .wit row of the first pair (+-2 px)
  const sg = JSON.parse(await ev(`JSON.stringify((() => { let max = 0, n = 0; document.querySelectorAll(".line").forEach(row => { const sigs = [...row.querySelectorAll(".wsig .wit.siglum")]; const pr = row.querySelector(".txt .pair"); if (!sigs.length || !pr) return; const wits = pr.querySelectorAll(".wit");
    sigs.forEach((x, k) => { if (!wits[k]) return; n++; max = Math.max(max, Math.abs(wits[k].getBoundingClientRect().top - x.getBoundingClientRect().top)); }); }); return { n, max: Math.round(max * 10) / 10 }; })())`));
  check(sg.n > 0 && sg.max <= 2, `siglum baseline: |y(siglum) - y(first .wit)| <= 2 px for ${sg.n} sigla (max ${sg.max} px)`);
  // instant tooltips: no native title attribute, no cursor:help, the custom tooltip shows at once
  const tp = JSON.parse(await ev(`JSON.stringify((() => { const titles = document.querySelectorAll("[title]").length; const help = [...document.querySelectorAll("*")].filter(e => getComputedStyle(e).cursor === "help").length; const sig = document.querySelector(".wsig .wit.siglum"); sig.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); const t = document.getElementById("tip"); return { titles, help, shown: t && getComputedStyle(t).display === "block", text: t && t.textContent.slice(0, 40) }; })())`));
  check(tp.titles === 0 && tp.help === 0 && tp.shown && tp.text.length > 0, `no native title (${tp.titles}), no cursor:help (${tp.help}), tooltip at once: "${tp.text}"`);
  // one image source: the public build reads the synthetic page only; the real image and the ink strips are not requested, and are not in the repository
  const tracked = execSync("git ls-files", { cwd: new URL("..", import.meta.url).pathname }).toString().split("\n");
  const real = urls.filter(u => /page\.jpg|\/strips\//.test(u)), trackedReal = tracked.filter(f => /(^|\/)page\.jpg$|(^|\/)strips\//.test(f)), synth = urls.filter(u => /page\.synthetic\.png/.test(u)).length;
  check(real.length === 0 && trackedReal.length === 0 && synth > 0, `public build: no page.jpg or strips/ requested (${real.length}) or tracked (${trackedReal.length}); the synthetic page is the source (${synth} request)`);
  const im = JSON.parse(await ev(`JSON.stringify({ src: document.getElementById("pageImg").src.split("/").pop(), w: document.getElementById("pageImg").naturalWidth, h: document.getElementById("pageImg").naturalHeight, badge: !document.getElementById("simBadge").hidden, strips: document.querySelectorAll(".lv.strip canvas").length })`));
  check(im.src === "page.synthetic.png" && im.w === 3376 && im.h === 4268 && im.badge && im.strips > 30, `page panel: ${im.src} ${im.w}x${im.h}, "simulated" badge ${im.badge}, ${im.strips} line strips above the text`);
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))`); await sleep(500);
  const wm = await ev(`(document.querySelector("#pipMs .wm") || {}).textContent`); check(/simulated/i.test(wm || ""), `Current Word panel carries the badge (${wm})`);
  // header: no leftover row, the counters inside the toolbar, nothing clipped at 1280 and 1680 px
  for (const wpx of [1280, 1680]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: wpx, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(700); await ev(`window.scrollTo(0, 0); document.querySelector("header").style.position = "sticky"`); await sleep(200);
    const h = JSON.parse(await ev(`JSON.stringify((() => { const hd = document.querySelector("header"), r = hd.getBoundingClientRect(), mw = document.getElementById("modeWrap").getBoundingClientRect(), st = document.getElementById("modeStat").getBoundingClientRect();
      const kids = [...hd.querySelectorAll(".row1,.row2")].map(x => x.getBoundingClientRect()); return { rows: hd.querySelectorAll(".row3").length, stats: !!document.getElementById("stats"), h: Math.round(r.height), within: mw.right <= r.right + 1 && mw.left >= r.left - 1 && st.right <= innerWidth && mw.bottom <= r.bottom + 1, overflowX: hd.scrollWidth > hd.clientWidth + 1, counters: document.getElementById("modeStat").textContent }; })())`));
    check(h.rows === 0 && !h.stats && h.within && !h.overflowX, `header at ${wpx} px: no leftover row, counters in the toolbar, not clipped (height ${h.h} px, "${h.counters}")`);
    const hr = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: wpx, height: h.h + 6, scale: 1 } }); writeFileSync(new URL(`./artefacts/layout_header_${wpx}.png`, import.meta.url), Buffer.from(hr.result.data, "base64")); if (process.env.SHOTS_COPY) writeFileSync(`${process.env.SHOTS_COPY}/layout_header_${wpx}.png`, Buffer.from(hr.result.data, "base64"));
  }
  await cdp("Emulation.clearDeviceMetricsOverride"); await sleep(400);
  for (const lab of ["4", "25", "26", "31", "38"]) {
    const sy = await ev(`(() => { const r = [...document.querySelectorAll(".line")].find(n => (n.querySelector(".ln") || {}).firstChild && n.querySelector(".ln").firstChild.textContent === "${lab}"); r.scrollIntoView({ block: "start" }); window.scrollBy(0, -6); return window.scrollY; })()`); await sleep(400);
    const r = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 20, y: sy, width: 1480, height: 330, scale: 1 } }); writeFileSync(new URL(`./artefacts/layout_l${lab}.png`, import.meta.url), Buffer.from(r.result.data, "base64")); if (process.env.SHOTS_COPY) writeFileSync(`${process.env.SHOTS_COPY}/layout_l${lab}.png`, Buffer.from(r.result.data, "base64"));
  }
  console.log("screenshots: tests/artefacts/layout_l4.png, l25, l26, l31, l38, header 1280 / 1680");
} catch (e) { console.log("FAIL exception", e.message); ok = false; }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
console.log(ok ? "LAYOUT OK" : "LAYOUT FAILED"); process.exit(ok ? 0 : 1);
