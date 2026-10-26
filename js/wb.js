/* PAPREG Editorial Workbench — data and synchronisation layer.

   The app is a static page (this repository, GitHub Pages). It holds no data. At runtime it reads
     - the page data (line geometry, machine reading, calibrated word risk, candidates, accents, clause ends),
       the page index and the review queue from the PRIVATE data repository (branch `main`), and
     - every editor's work from the same repository, branch `annotations`, one JSON file per editor and per type:
         annotations/corrections/<login>.json   word corrections, diplomatic lines, approvals, stress marks
         annotations/apparatus/<login>.json     critical apparatus notes
         annotations/entities/<login>.json      named entities, rejected suggestions
         annotations/structure/<login>.json     diplomatic parts (inscriptio … datatio) changed by hand
         annotations/tasks/<login>.json         claimed / finished review tasks
         annotations/telemetry/<login>.json     time on page, decisions, words and clause ends per hour
   Each file is written only by its owner (Git Data API, one commit per save, 60 s after the last change or at once
   from 25 changes; on a race the remote file is merged by timestamp and the commit retried), so editors never
   overwrite each other; the other editors' files are read for agreement / disagreement marks (peer consensus).
   Register images never go to GitHub: they come from a local folder chosen by the editor
   (File System Access API) or from a URL template set in config.json (e.g. a local or institutional IIIF server).

   The data repository is not named in this public app: after login it is found among the repositories the token can
   read (an organisation repository holding pages/index.json), and remembered in this browser.
   Modes: "github" (default) — token login, as above; "test" — anyone can try the editor on the test side shipped with the
   app (sample/), without login, edits kept in this browser; "local" — data read from config.localData (a served copy of the
   data repository), edits kept in this browser (development). */
"use strict";
(function () {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TYPES = ["corrections", "apparatus", "entities", "structure", "tasks", "telemetry"];
  const SAVE_DELAY = 60000, SAVE_BATCH = 25;
  const params = new URLSearchParams(location.search);
  const OFFLINE = () => G.cfg.mode === "local" || G.cfg.mode === "test";
  const G = { cfg: null, owner: "", repo: "", token: "", login: "", readOnly: true, mine: {}, shas: {}, head: null, dirty: new Set(),
    changes: 0, timer: 0, saving: false, peersCache: {}, pageId: params.get("page") || "", tele: null };

  // ------------------------------------------------------------------ GitHub
  const API = "https://api.github.com";
  async function gh(path, opts = {}) {
    const r = await fetch(API + path, { ...opts, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      ...(G.token ? { Authorization: "Bearer " + G.token } : {}), ...(opts.headers || {}) } });
    return r;
  }
  async function ghJSON(path, opts) { const r = await gh(path, opts); if (!r.ok) throw Object.assign(new Error(`${r.status} ${r.statusText} (${path})`), { status: r.status }); return r.json(); }
  async function ghRaw(path, ref) {                              // file content as text (contents API, raw media type; files up to 100 MB)
    const r = await gh(`/repos/${G.owner}/${G.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, { headers: { Accept: "application/vnd.github.raw" } });
    if (!r.ok) throw Object.assign(new Error(`${r.status} ${path}`), { status: r.status });
    return r.text();
  }
  async function ghList(dir, ref) {
    const r = await gh(`/repos/${G.owner}/${G.repo}/contents/${dir}?ref=${encodeURIComponent(ref)}`);
    if (r.status === 404) return []; if (!r.ok) throw new Error(`${r.status} listing ${dir}`); return r.json();
  }
  const b64 = (s) => { const u = new TextEncoder().encode(s); let r = ""; for (let i = 0; i < u.length; i += 8192) r += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(r); };
  async function ensureBranch() {
    const db = G.cfg.dataBranch, r = await gh(`/repos/${G.owner}/${G.repo}/branches/${encodeURIComponent(db)}`);
    if (r.ok) return;
    const h = await ghJSON(`/repos/${G.owner}/${G.repo}/git/ref/heads/${encodeURIComponent(G.cfg.branch)}`);
    const c = await gh(`/repos/${G.owner}/${G.repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + db, sha: h.object.sha }) });
    if (!c.ok && c.status !== 422) throw new Error(`cannot create branch ${db}: ${c.status}`);
  }
  // one commit with all changed files of this editor; on a race: merge the remote files, retry
  async function commitFiles(types, message) {
    const git = `/repos/${G.owner}/${G.repo}/git`, db = encodeURIComponent(G.cfg.dataBranch);
    for (let attempt = 0; attempt < 5; attempt++) {
      const head = (await ghJSON(`${git}/ref/heads/${db}`)).object.sha;
      if (head !== G.head) for (const t of types) { try { merge(t, JSON.parse(await ghRaw(myPath(t), head))); } catch (e) { if (e.status !== 404) throw e; } }
      const base = (await ghJSON(`${git}/commits/${head}`)).tree.sha, tree = [];
      for (const t of types) {
        G.mine[t].updated = new Date().toISOString();
        const blob = await ghJSON(`${git}/blobs`, { method: "POST", body: JSON.stringify({ content: b64(JSON.stringify(G.mine[t])), encoding: "base64" }) });
        tree.push({ path: myPath(t), mode: "100644", type: "blob", sha: blob.sha });
      }
      const nt = await ghJSON(`${git}/trees`, { method: "POST", body: JSON.stringify({ base_tree: base, tree }) });
      const cm = await ghJSON(`${git}/commits`, { method: "POST", body: JSON.stringify({ message, tree: nt.sha, parents: [head] }) });
      const r = await gh(`${git}/refs/heads/${db}`, { method: "PATCH", body: JSON.stringify({ sha: cm.sha, force: false }) });
      if (r.ok) { G.head = cm.sha; return; }
      if (r.status !== 422 && r.status !== 409) throw new Error(`commit failed: ${r.status}`);
      await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
    }
    throw new Error("commit failed after 5 attempts (the branch moved too often)");
  }

  // ------------------------------------------------------------------ data access
  async function data(path) {
    if (OFFLINE()) { const r = await fetch((G.cfg.mode === "test" ? (G.cfg.testData || "sample/") : G.cfg.localData).replace(/\/?$/, "/") + path); if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); }
    return JSON.parse(await ghRaw(path, G.cfg.branch));
  }
  const myPath = (t) => `${G.cfg.annotationsDir}/${t}/${G.login}.json`;
  function emptyFile(t) { return { schema: "papreg.workbench/0.1", type: t, login: G.login, updated: null, pages: {}, log: [] }; }
  function merge(t, remote) {                                     // keep the newer record per page (or per task), union of the logs
    const mine = G.mine[t];
    for (const [k, v] of Object.entries(remote.pages || {})) { const o = mine.pages[k]; if (!o || (v.at || "") > (o.at || "")) mine.pages[k] = v; }
    const seen = new Set(mine.log.map(e => e.at + "|" + e.page + "|" + e.what));
    for (const e of remote.log || []) if (!seen.has(e.at + "|" + e.page + "|" + e.what)) mine.log.push(e);
    mine.log.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  }
  async function loadMine() {
    for (const t of TYPES) {
      G.mine[t] = emptyFile(t);
      const local = LS.get(`wb:${G.owner}/${G.repo}:${G.login}:${t}`, null);
      if (local) merge(t, local);
      if (!OFFLINE()) { try { merge(t, JSON.parse(await ghRaw(myPath(t), G.cfg.dataBranch))); } catch (e) { if (e.status !== 404) console.warn(e); } }
    }
  }
  function backup(t) { LS.set(`wb:${G.owner}/${G.repo}:${G.login}:${t}`, G.mine[t]); }

  // ------------------------------------------------------------------ the page's state <-> per-type records
  // state snapshot fields of the editor engine: edits, dipl, apprE, apprD, stress (corrections), app (apparatus), ne, rej
  // (entities), dsSeg / modes / etype / recip (structure and task-mode progress), marg (the editor's decision on each marginal line).
  const SPLIT = { corrections: ["edits", "dipl", "apprE", "apprD", "stress"], apparatus: ["app", "marg"], entities: ["ne", "rej"], structure: ["dsSeg", "modes", "etype", "recip", "numerals"] };
  function restore(state, D) {
    if (!G.pageId) return;
    for (const [t, keys] of Object.entries(SPLIT)) {
      const rec = G.mine[t] && G.mine[t].pages[G.pageId];
      if (!rec) continue;
      for (const k of keys) if (k in rec.data) state[k] = (k === "apprE" || k === "apprD" || k === "rej") ? new Set(rec.data[k]) : rec.data[k];
    }
    G.tele = { page: G.pageId, opened: Date.now(), active: 0, last: Date.now(), decisions: 0, words: (D.lines || []).reduce((a, l) => a + l.words.length, 0),
      clausulae: (D.clausulae || []).length };
  }
  async function save(snap, audit) {
    const now = new Date().toISOString();
    for (const [t, keys] of Object.entries(SPLIT)) {
      const d = {}; keys.forEach(k => d[k] = snap[k] ?? null);
      const prev = G.mine[t].pages[G.pageId], sig = JSON.stringify(d);
      if (prev && JSON.stringify(prev.data) === sig) continue;
      if (!prev && Object.values(d).every(v => v == null || (Array.isArray(v) ? !v.length : (typeof v === "object" ? !Object.keys(v).length : false)))) continue;
      G.mine[t].pages[G.pageId] = { at: now, data: d, model: audit && audit.model };
      G.mine[t].log.push({ at: now, page: G.pageId, what: t, n: t === "corrections" ? Object.keys(d.edits || {}).length : (d.app || d.ne || d.dsSeg || []).length });
      G.dirty.add(t); backup(t);
    }
    flushTele(); taskProgress(snap);
    await push();
  }
  async function push() {
    if (!G.dirty.size) return;
    if (OFFLINE() || G.readOnly) { G.dirty.clear(); return; }
    if (G.saving) return;
    G.saving = true;
    const types = [...G.dirty];
    try {
      await ensureBranch();
      await commitFiles(types, `${G.login}: ${G.pageId || "tasks"} (${types.join(", ")})`);
      types.forEach(t => G.dirty.delete(t));
    } finally { G.saving = false; }
  }
  // other editors' corrections of this page, in the engine's peer format
  async function peers(D) {
    if (OFFLINE() || !G.pageId) return [];
    const dir = `${G.cfg.annotationsDir}/corrections`, list = await ghList(dir, G.cfg.dataBranch), out = [];
    for (const f of list) {
      if (f.type !== "file" || !f.name.endsWith(".json") || f.name === G.login + ".json") continue;
      let file = G.peersCache[f.path];
      if (!file || file.sha !== f.sha) { try { file = { sha: f.sha, json: JSON.parse(await ghRaw(f.path, G.cfg.dataBranch)) }; G.peersCache[f.path] = file; } catch (e) { continue; } }
      const rec = file.json.pages && file.json.pages[G.pageId]; if (!rec) continue;
      const changes = Object.entries(rec.data.edits || {}).map(([k, e]) => { const [li, wi] = k.split(":").map(Number);
        return D.lines[li] ? { line_id: D.lines[li].line_id, word_index: wi, corrected: e.corrected, method: e.method } : null; }).filter(Boolean);
      out.push({ schema: "papreg.workbench/0.1", editor_id: file.json.login || f.name.slice(0, -5), timestamp: rec.at, changes });
    }
    return out;
  }

  // ------------------------------------------------------------------ telemetry (throughput, for the proposal's 300-350 words/h target)
  function teleTick(kind) {
    const t = G.tele; if (!t) return; const now = Date.now();
    if (now - t.last < 120000) t.active += now - t.last;              // gaps over two minutes are not counted as work
    t.last = now; if (kind === "edit") t.decisions++;
  }
  function flushTele() {
    const t = G.tele; if (!t) return; teleTick();
    const rec = G.mine.telemetry.pages[t.page] || { at: null, data: { sessions: [] } };
    const s = { opened: new Date(t.opened).toISOString(), active_min: +(t.active / 60000).toFixed(2), decisions: t.decisions, words_on_page: t.words, clausulae_on_page: t.clausulae };
    const ss = rec.data.sessions.filter(x => x.opened !== s.opened); ss.push(s);
    G.mine.telemetry.pages[t.page] = { at: new Date().toISOString(), data: { sessions: ss } }; G.dirty.add("telemetry"); backup("telemetry");
  }
  ["pointerdown", "keydown"].forEach(e => addEventListener(e, () => teleTick(), true));

  // ------------------------------------------------------------------ tasks (review queue; delegation on login)
  let QUEUE = null, CLAIMS = {};
  async function loadTasks() {
    QUEUE = await data(G.cfg.tasks);
    CLAIMS = {};
    if (!OFFLINE()) {
      for (const f of await ghList(`${G.cfg.annotationsDir}/tasks`, G.cfg.dataBranch)) {
        if (f.type !== "file" || !f.name.endsWith(".json") || f.name === G.login + ".json") continue;
        try { const j = JSON.parse(await ghRaw(f.path, G.cfg.dataBranch)); CLAIMS[j.login || f.name.slice(0, -5)] = j.pages || {}; } catch (e) {}
      }
    }
    CLAIMS[G.login] = G.mine.tasks.pages;
  }
  function claimants(task) { return Object.entries(CLAIMS).filter(([, p]) => p[task.task_id] && p[task.task_id].data.status !== "released").map(([who]) => who); }
  function mine() { return QUEUE.tasks.filter(t => t.assignee === G.login || (G.mine.tasks.pages[t.task_id] && G.mine.tasks.pages[t.task_id].data.status !== "released")); }
  function claimNext(n) {                                          // delegation: the next open tasks by priority, two editors for double-keyed ones
    const taken = [];
    for (const t of QUEUE.tasks) {
      if (taken.length >= n) break;
      if (t.assignee && t.assignee !== G.login) continue;
      if (G.mine.tasks.pages[t.task_id]) continue;
      const c = claimants(t); if (c.length >= (t.double_key ? 2 : 1)) continue;
      if (t.difficulty === "hard" && (G.cfg.seniors || []).length && !(G.cfg.seniors || []).includes(G.login)) continue;
      G.mine.tasks.pages[t.task_id] = { at: new Date().toISOString(), data: { status: "claimed", page: t.page_id } }; taken.push(t);
    }
    if (taken.length) { G.dirty.add("tasks"); backup("tasks"); }
    return taken;
  }
  function taskProgress(snap) {                                    // a task is done when every line of its page is approved (edition)
    const t = QUEUE && QUEUE.tasks.find(x => x.page_id === G.pageId && G.mine.tasks.pages[x.task_id]); if (!t || !G.D) return;
    const done = (snap.apprE || []).length >= G.D.lines.length, rec = G.mine.tasks.pages[t.task_id];
    const st = done ? "done" : "in progress";
    if (rec.data.status !== st) { G.mine.tasks.pages[t.task_id] = { at: new Date().toISOString(), data: { ...rec.data, status: st } }; G.dirty.add("tasks"); backup("tasks"); }
  }

  // ------------------------------------------------------------------ images (never from GitHub)
  const IDB = () => new Promise((res, rej) => { const r = indexedDB.open("papreg-wb", 1); r.onupgradeneeded = () => r.result.createObjectStore("h"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idb(op, k, v) { const db = await IDB(); return new Promise((res, rej) => { const tx = db.transaction("h", op === "get" ? "readonly" : "readwrite"), st = tx.objectStore("h");
    const r = op === "get" ? st.get(k) : st.put(v, k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function imageName(D) {
    const s = D.source || {}, im = G.cfg.images || {};
    return (im.pattern || "{file}").replace("{file}", s.image_file || "").replace("{volume}", s.volume || "").replace("{folio3}", String(s.folio_number || "").padStart(3, "0")).replace("{side}", s.side || "").replace("{page}", G.pageId);
  }
  async function image(D, ask) {
    const im = G.cfg.images || {};
    if (im.mode === "url") return im.template ? im.template.replace("{name}", imageName(D)).replace("{dir}", (D.source && D.source.image_dir) || "") : null;
    if (im.mode !== "local-folder" || !window.showDirectoryPicker) return null;
    let h = await idb("get", "images").catch(() => null);
    if (h && (await h.queryPermission({ mode: "read" })) !== "granted") { if (!ask) return null; if ((await h.requestPermission({ mode: "read" })) !== "granted") return null; }
    if (!h) { if (!ask) return null; h = await window.showDirectoryPicker({ id: "papreg-images", mode: "read" }); await idb("put", "images", h); }
    const name = imageName(D), sub = (D.source && D.source.image_dir) || "";
    try { let d = h; for (const p of sub.split("/").filter(Boolean)) { try { d = await d.getDirectoryHandle(p); } catch (e) { break; } }
      const f = await (await d.getFileHandle(name)).getFile(); return URL.createObjectURL(f); } catch (e) { toast(`image ${name} not found in the chosen folder`); return null; }
  }

  // ------------------------------------------------------------------ login, task view, page view
  function toast(m) { const t = document.getElementById("toast"); if (!t) return alert(m); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2500); }
  const TOKKEY = "wb:token", REPOKEY = "wb:datarepo";
  async function auth() {
    if (G.cfg.mode === "test") { G.login = "test-editor"; G.readOnly = false; G.owner = "test"; G.repo = "sample"; return true; }
    if (G.cfg.mode === "local") { G.login = params.get("user") || LS.get("wb:localUser", "") || "local-editor"; G.readOnly = false; return true; }
    G.token = LS.get(TOKKEY, "");
    if (!G.token) return false;
    const u = await gh("/user"); if (!u.ok) { G.token = ""; return false; }
    G.login = (await u.json()).login;
    let repo = LS.get(REPOKEY, "");
    if (!repo) {                                                    // the data repository: an org repository the token can read that holds the page index
      const list = await gh(`/user/repos?per_page=100&sort=updated`); if (!list.ok) return false;
      for (const r of await list.json()) {
        if (G.cfg.org && r.owner.login.toLowerCase() !== G.cfg.org.toLowerCase()) continue;
        if (r.full_name.toLowerCase() === (G.cfg.appRepo || "").toLowerCase()) continue;
        const f = await gh(`/repos/${r.full_name}/contents/${G.cfg.pagesIndex}?ref=${encodeURIComponent(G.cfg.branch)}`);
        if (f.ok) { repo = r.full_name; break; }
      }
      if (!repo) return false;
      LS.set(REPOKEY, repo);
    }
    [G.owner, G.repo] = repo.split("/");
    const r = await gh(`/repos/${G.owner}/${G.repo}`); if (!r.ok) { LS.set(REPOKEY, ""); return false; }
    const p = (await r.json()).permissions || {}; G.readOnly = !(p.push || p.admin || p.maintain);
    return true;
  }
  function loginView() {
    document.body.innerHTML = `<div class="wb-login"><h1>PAPREG Editorial Workbench</h1>
      <p>Editors of the project sign in with the GitHub access token they received for the workbench. The token stays in this
      browser and is sent only to api.github.com.</p>
      <input id="wbTok" type="password" placeholder="github_pat_…" autocomplete="off" style="width:420px"> <button id="wbGo">Sign in</button>
      <p class="note" id="wbErr"></p>
      <h2>Try it</h2>
      <p>Anyone can try the editor on a test side (machine reading of one page of the register of Honorius III), without login.
      Changes stay in your browser and are not sent anywhere.</p>
      <p><button id="wbTry">Open the test side</button></p></div>`;
    document.getElementById("wbGo").onclick = async () => {
      const t = document.getElementById("wbTok").value.trim(); if (!t) return;
      G.token = t; LS.set(TOKKEY, t); LS.set(REPOKEY, "");
      if (await auth()) location.reload(); else { LS.set(TOKKEY, ""); document.getElementById("wbErr").textContent = "The token was not accepted, or it gives no access to the workbench data."; }
    };
    document.getElementById("wbTry").onclick = () => { const u = new URL(location.href); u.searchParams.set("test", "1"); u.searchParams.set("page", G.cfg.testPage || "RV9/154v"); location.href = u.pathname + u.search; };
  }
  const MODE_NAMES = ["triage", "boundaries", "structure", "cursus", "corrections", "ner", "codicology", "legal", "arenga", "edition"];   // task modes (index.html): ?mode= opens a page in one
  // assignment list: side x task x assignee x counts x status. The stops left per mode are counted when a page is opened in the editor (the page data is read there),
  // so counts are shown for pages opened in this browser.
  const ASSIGN_TASKS = [["T2.2-0", "Tier 0 boundaries", "boundaries"], ["T2.2-1", "Tier 1 lines", "lines"], ["T2.2-2", "Tier 2 OOV/sigla", "oov"], ["T3.2", "cursus", "cursus"], ["T5.1", "codicology", "codicology"], ["T5.2", "legal", "legal"], ["T5.3", "arenga", "arenga"], ["T2.1", "edition", "edition"]];
  function assignmentRows() {
    return (QUEUE.tasks || []).flatMap(t => { let c = null; try { c = JSON.parse(localStorage.getItem(`wb:modecounts:${t.page_id}`) || "null"); } catch (e) {}
      return ASSIGN_TASKS.map(([id, label, mode]) => { const who = (t.assignments || {})[id] || "", cm = c && c.modes[mode], st = !who ? "unassigned" : cm && cm[1] === 0 ? "done" : cm && cm[1] < cm[0] ? "in progress" : "assigned";
        return `<tr><td>${esc(t.page_id)}</td><td><a href="${pageUrl(t.page_id)}&task=${id}&mode=${mode}">${esc(id)} · ${esc(label)}</a></td><td>${who ? "@" + esc(who) : "—"}</td><td>${cm ? `${cm[0]} stops · ${cm[1]} left` : "–"}</td><td>${st}</td></tr>`; }); }).join(""); }
  function pageUrl(id) { const u = new URL(location.href); if (id) u.searchParams.set("page", id); else u.searchParams.delete("page"); return u.pathname + u.search; }
  async function taskView() {
    await loadTasks();
    const IDX = await data(G.cfg.pagesIndex).catch(() => ({ pages: [] }));
    const my = mine(), st = (t) => (G.mine.tasks.pages[t.task_id] || { data: { status: "assigned" } }).data.status;
    const row = (t) => `<tr><td><a href="${pageUrl(t.page_id)}">${esc(t.page_id)}</a></td><td>${esc(t.hand)}</td><td>${t.priority}</td><td>${(100 * t.est_cer).toFixed(1)}%</td>
      <td>${Math.round(100 * t.coverage)}%</td><td>${esc(t.difficulty)}</td><td>${t.double_key ? "two editors" : ""}</td><td>${esc(st(t))}</td><td>${esc(claimants(t).filter(x => x !== G.login).join(", "))}</td></tr>`;
    document.body.innerHTML = `<div class="wb-tasks"><header><h1>PAPREG Editorial Workbench</h1><span>signed in as <b>@${esc(G.login)}</b>${G.readOnly ? " (read-only)" : ""}${G.cfg.mode === "test" ? " · test mode: changes stay in this browser" : (G.cfg.mode === "local" ? " · local mode" : "")}</span>
      <span class="sp"></span><button id="wbOut">${G.cfg.mode === "test" ? "leave the test" : "sign out"}</button></header>
      <h2>My tasks (${my.length})</h2>
      <p class="note">Round ${esc(QUEUE.round)} of the review queue: sides chosen per hand, weak hands first (estimated error from the editions' agreement). Open a side, correct, and approve its lines; the task is done when every line is approved.</p>
      ${my.length ? `<table><tr><th>side</th><th>hand</th><th>priority</th><th>est. CER</th><th>coverage</th><th>difficulty</th><th>keying</th><th>status</th><th>also with</th></tr>${my.map(row).join("")}</table>` : "<p>No task yet.</p>"}
      <h2>Assignments</h2><p class="note">One row per side and task. A task link opens the side in the mode of that task (Tab queue, counters, keys); without a task link a side opens as the plain review.</p>
      <table><tr><th>side</th><th>task</th><th>assignee</th><th>counts</th><th>status</th></tr>${assignmentRows()}</table>
      <p>${G.readOnly ? "Read-only: ask the owner of the data repository for write access to take tasks." : `<button id="wbTake">take the next ${G.cfg.claimBatch || 5} tasks</button>`}</p>
      <h2>All sides</h2><p class="note">${IDX.pages.length} sides of ${esc((IDX.volumes || []).join(", "))}. Any side can be opened; work outside the tasks is saved in the same way.</p>
      <details><summary>browse</summary><div class="wb-grid">${(IDX.pages || []).map(p => `<a href="${pageUrl(p.page_id)}" title="${esc(p.hand)} · ${p.lines} lines">${esc(p.page_id)}</a>`).join(" ")}</div></details></div>`;
    const tk = document.getElementById("wbTake");
    if (tk) tk.onclick = async () => { const n = claimNext(G.cfg.claimBatch || 5); if (!n.length) { toast("no open task left for you"); return; } await push().catch(e => toast(e.message)); taskView(); };
    document.getElementById("wbOut").onclick = () => { if (G.cfg.mode !== "test") { LS.set(TOKKEY, ""); LS.set(REPOKEY, ""); } const u = new URL(location.href); u.searchParams.delete("test"); u.searchParams.delete("page"); location.href = u.pathname + u.search; };
  }
  function pageChrome(D) {                                         // tasks link, previous / next side, image folder button
    const row = document.querySelector("header .row1"); if (!row) return;
    const nav = document.createElement("span"); nav.className = "wb-nav";
    const IDXP = G.index || [], i = IDXP.indexOf(G.pageId);
    nav.innerHTML = `<a href="${pageUrl("")}">tasks</a>` + (i > 0 ? ` · <a href="${pageUrl(IDXP[i - 1])}">◀ ${esc(IDXP[i - 1])}</a>` : "") + (i >= 0 && i + 1 < IDXP.length ? ` · <a href="${pageUrl(IDXP[i + 1])}">${esc(IDXP[i + 1])} ▶</a>` : "") +
      ((G.cfg.images || {}).mode === "local-folder" ? ` · <button class="t" id="wbImg" title="Choose the local folder with the register images (they never leave this computer)">image folder</button>` : "");
    row.insertBefore(nav, row.children[1]);
    const b = document.getElementById("wbImg"); if (b) b.onclick = async () => { const u = await image(D, true); if (u && window.__wbSetImage) window.__wbSetImage(u); };
    const peersBtn = document.getElementById("bPeers"); if (peersBtn) peersBtn.hidden = true;
  }

  // ------------------------------------------------------------------ boot
  const ready = (async () => {
    const cfgName = params.get("config") || "config.json";
    G.cfg = Object.assign({ mode: "github", branch: "main", dataBranch: "annotations", annotationsDir: "annotations", pagesIndex: "pages/index.json",
      tasks: "tasks/review_queue.json", pageDir: "pages", syncSeconds: 60, claimBatch: 5 }, await (await fetch(cfgName, { cache: "no-store" })).json());
    if (params.get("test")) G.cfg.mode = "test";
    if (G.cfg.repo && G.cfg.mode === "github" && !LS.get(REPOKEY, "")) LS.set(REPOKEY, G.cfg.repo);
    if (!(await auth())) { loginView(); return null; }
    await loadMine();
    window.WORKBENCH_CONFIG = { mode: OFFLINE() ? "local" : "live", login: G.login, syncSeconds: G.cfg.syncSeconds, build: G.cfg.build || "internal" };
    if (!G.pageId) { await taskView(); return null; }
    const D = await data(`${G.cfg.pageDir}/${G.pageId}.json`);
    try { G.index = (await data(G.cfg.pagesIndex)).pages.map(p => p.page_id); } catch (e) { G.index = []; }
    try { await loadTasks(); } catch (e) { QUEUE = { tasks: [] }; }
    G.D = D; setTimeout(() => pageChrome(D), 0);
    return D;
  })().catch(e => { document.body.innerHTML = `<p style="padding:20px">The workbench could not start: ${esc(e.message)}</p>`; console.error(e); return null; });

  // timer: save 60 s after the last change, or at once from 25 changes (the engine calls WB.tele("edit") on every change)
  function changed() { G.changes++; clearTimeout(G.timer); if (G.changes >= SAVE_BATCH) { G.changes = 0; window.__wbTick && window.__wbTick(); } else G.timer = setTimeout(() => { G.changes = 0; window.__wbTick && window.__wbTick(); }, SAVE_DELAY); }
  function assignee(pageId, taskId) { const t = QUEUE && QUEUE.tasks.find(x => x.page_id === pageId); return t && t.assignments && taskId ? (t.assignments[taskId] || null) : null; }
  window.WB = { assignee, ready, restore, save, peers, image: (D) => image(D, false), tele: (k) => { teleTick(k); if (k === "edit") changed(); }, get login() { return G.login; },
    get readOnly() { return G.readOnly; }, describe: () => ({ branch: G.cfg.dataBranch, files: TYPES.map(myPath) }),
    exportMine: () => JSON.stringify(G.mine, null, 1) };
})();
