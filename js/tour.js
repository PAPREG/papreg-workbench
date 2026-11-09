/* PAPREG Editorial Workbench — guided tour of the test side (test mode only: ?test=1).
   A spotlight on one part of the screen and a card that explains it; practice steps wait until the visitor has done the
   action (Tab, accept a candidate, undo, approve a line) before going on. Starts once on the first visit; the "Guided tour"
   button in the header restarts it. Nothing is sent anywhere. */
"use strict";
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.get("test") || !params.get("page")) return;
  const LSK = "wb:tourSeen";
  const W = () => window.__wb && window.__wb.state;
  const nEdits = () => Object.keys(W().edits || {}).length;
  const STEPS = [
    { title: "Welcome", text: `This is the editor of the PAPREG Workbench on a <b>test side</b>: the machine reading of one page of the register of Honorius III (Reg. Vat. 9, fol. 154v, one of the held-out test pages of the HTR paper). Editors check this reading and correct it. In a few steps you see what is on the screen and how to work quickly with the keyboard. <br><br>Nothing you do here is sent anywhere; it stays in your browser.` },
    { target: "#lines", title: "The reading", text: `Each line is the machine reading of one line of the page, with abbreviations expanded. The colours show how likely a word is wrong: <span style="text-decoration:underline wavy #c0392b">wavy red</span> = likely error (≥ 50 %), <span style="text-decoration:underline dotted #d68910">dotted amber</span> = uncertain (20–50 %). These probabilities are calibrated: on held-out pages the highlighted words hold most of the errors.` },
    { target: "#layerBar", title: "Layers", text: `What is shown is set in three groups: <b>Text</b> (edition, diplomatic, witnesses), <b>Apparatus</b> (additions, margin notes, numerals, hands, initials) and <b>Analysis</b> (confidence, cursus, entities, formulae, structure). Click a group to switch it, ▾ to choose its parts. On this screen everything the page has is on; a task opens with the layers it needs.` },
    { target: "#lines", title: "Try it: Tab", text: `Press <kbd>Tab</kbd>. The cursor jumps to the next flagged word and opens its box. <kbd>Shift</kbd>+<kbd>Tab</kbd> goes back; you can also click any word.`, wait: () => W().pop !== null, waitText: "Press Tab" },
    { target: "#pop", title: "Candidates", text: `The box shows the word, its probability of being wrong, and up to three alternatives with their probabilities (and, at a clause end, the cadence each would give). Press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd> to take one: the next flagged word opens at once. If none is right, type the word in the field and press <kbd>Enter</kbd>. <br><br>Take a candidate now (if a word has no alternatives, <kbd>Tab</kbd> goes on to the next flagged word).`, wait: (s) => nEdits() > s.edits, waitText: "Press 1, 2 or 3", start: () => ({ edits: nEdits() }) },
    { target: "#bUndo", title: "Undo", text: `Every change can be undone: <kbd>Ctrl</kbd>+<kbd>Z</kbd> or this button. A corrected word can also be reverted from its box. Try <kbd>Ctrl</kbd>+<kbd>Z</kbd> now.`, wait: (s) => nEdits() < s.edits, waitText: "Press Ctrl+Z", start: () => ({ edits: nEdits() }) },
    { target: () => document.querySelector("#lines .cl") || "#lines", title: "Cursus at the clause ends", text: `At each clause end the rhythm of the last words is classified (planus, tardus, velox …), and the stressed syllables are shown in the words of the window (dú·xi·mus). The classification is recomputed in the browser after every correction, so you see at once whether a reading changes the cadence.` },
    { target: () => { const b = document.querySelectorAll("#lines .band"); const x = b[1] || b[0]; return x ? (x.closest(".bandw") || x) : "#lines"; }, title: "Letters: the entry band", text: `Each register entry (one letter) opens with a band: number, recipient, place and date (computed from the datatio, e.g. XVI Kal. Oct. a. II = 16 Sep 1217), type, the witnesses that cover it (Pressutti regest, 19th-century edition) and the running number in the margin. Below it the apparatus of the entry: line-end additions, margin addresses, numerals (a, b, c …). The arrow collapses an entry; <kbd>[</kbd> and <kbd>]</kbd> jump between entries.` },
    { target: () => document.querySelector("#lines .dsl") || "#lines", title: "Diplomatic structure", text: `The labels in the margin are the parts of the letter (inscriptio, arenga, narratio, dispositio, sanctio, datatio, registration note), proposed by rules on the formula openings when the page was processed. Click a label to relabel it, drag its bar to move the boundary, right-click a word to start a new part.` },
    { target: () => document.querySelector("#lines .wsig") ? document.querySelector("#lines .wsig").closest(".line") : "#lines", title: "Witnesses", text: `Under the words: the public-domain witnesses aligned word by word with the reading — <b>MGH</b> or <b>H</b> (Horoy) for the 19th-century edition, <b>P</b> for Pressutti's regest. Grey = the same word, red = a different reading, <b>+word</b> = text the register reading lacks. The ticks at the clause ends compare the punctuation. In the edition task the differences are the stops.` },
    { target: () => { const x = document.querySelector("#lines .sgw"); return x ? x.closest(".line") : "#lines"; }, title: "Entity suggestions", text: `Names proposed by the NER models are marked with a dashed frame and a question mark (PLACE?, DATE?, TITLE? …). Click one to accept or reject it, or all suggestions of the same word at once; accepted names take the colour of their class.` },
    { target: "#viewSel", title: "Line views", text: `What stands above each line: the witness line, a strip of the page image (once the image is loaded) or nothing. Each editor chooses; the choice is kept in this browser.` },
    { target: "#lines", title: "Notes, names, special characters", text: `With a word's box open: <kbd>A</kbd> adds an apparatus note (corr. ex, add. in marg., del., sic …), <kbd>N</kbd> then <kbd>1</kbd>–<kbd>9</kbd> marks an entity (person, title, institution, place, actor, date, citation, object, value; <kbd>0</kbd> clears); for an actor a letter sets the role (recipient, petitioner, executor …), <kbd>D</kbd> edits the diplomatic line. While you type, a palette of special characters (ꝑ, ꝓ, ꝗ, ⁊ …) appears at the bottom.` },
    { target: "#lines", title: "Try it: approve a line", text: `When a line is right, press <kbd>Enter</kbd> to approve it (it gets a ✓ in the margin). A side is done when all its lines are approved. Approve a line now.`, wait: (s) => (W().apprE ? W().apprE.size : 0) > s.n, waitText: "Press Enter", start: () => ({ n: W().apprE ? W().apprE.size : 0 }) },
    { target: "#pip", title: "Current word and page", text: `On the left: the word you are working on, and below it the page. The page panel shows the line outlines of the segmentation; the image is loaded only when you ask for it. In the real workbench it comes from the editor's own folder of register images (button “image folder”) and never leaves that computer; this test side has a generated page image, marked “simulated”.` },
    { target: "#mp", title: "Model progress", text: `How the recogniser improves as corrections are collected and the model is retrained.` },
    { target: () => document.getElementById("sync") || "header", title: "Saving", text: `Signed-in editors' work is saved automatically, 60 seconds after the last change, to their own files; other editors' corrections of the same side appear as agreement ✓ or disagreement marks. <b>Approve &amp; save</b> shows the record and its TEI.` },
    { target: () => document.querySelector(".wb-nav") || "header", title: "Tasks", text: `<b>tasks</b> leads to the task view: each editor gets sides to review (chosen per scribal hand, weakest first; some sides go to two editors) and can take the next ones with one click. A task link opens the side in its task (lines, cursus, structure, entities, edition against the witnesses …), with its own <kbd>Tab</kbd> queue and counters.` },
    { title: "That's it", text: `Now try the side freely: <kbd>Tab</kbd> to move, <kbd>1</kbd>–<kbd>3</kbd> to accept, type to correct, <kbd>Enter</kbd> to approve, <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo. The tour can be restarted with “Guided tour” at the top.` }
  ];

  const css = `
  .tour-spot{position:fixed;z-index:9998;border-radius:6px;box-shadow:0 0 0 9999px rgba(20,24,33,.45);pointer-events:none;transition:all .2s ease}
  .tour-card{position:fixed;z-index:9999;max-width:380px;background:#fff;color:#222;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.25);
    padding:14px 16px;font:14px/1.5 system-ui,sans-serif}
  .tour-card h3{margin:0 0 6px;font-size:15px}.tour-card kbd{border:1px solid #bbb;border-bottom-width:2px;border-radius:3px;padding:0 4px;font:12px monospace;background:#f6f6f6}
  .tour-card .bar{display:flex;gap:8px;align-items:center;margin-top:12px}.tour-card .bar .sp{flex:1}.tour-card .n{color:#888;font-size:12px}
  .tour-card button{font:13px system-ui;padding:4px 10px;border-radius:4px;border:1px solid #bbb;background:#fff;cursor:pointer}
  .tour-card button.go{background:#2f5d8a;color:#fff;border-color:#2f5d8a}.tour-card .wait{color:#b9770e;font-weight:600}
  @media (prefers-color-scheme: dark){.tour-card{background:#1f232b;color:#e8e8e8}.tour-card button{background:#2a2f39;color:#e8e8e8;border-color:#555}.tour-card kbd{background:#2a2f39;border-color:#555}}`;
  let spot, card, i = 0, st = null, timer = 0;
  function el(t) { const x = typeof t === "function" ? t() : t; return typeof x === "string" ? document.querySelector(x) : x; }
  function place() {
    const s = STEPS[i], t = s.target ? el(s.target) : null, vw = innerWidth, vh = innerHeight;
    if (t && t.getBoundingClientRect().width) {
      const r = t.getBoundingClientRect(), pad = 6, top = Math.max(4, r.top - pad), h = Math.min(vh - top - 4, r.height + 2 * pad);
      Object.assign(spot.style, { display: "block", left: (r.left - pad) + "px", top: top + "px", width: (r.width + 2 * pad) + "px", height: h + "px" });
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let x = Math.min(Math.max(8, r.left), vw - cw - 8), y = r.bottom + 12;
      if (y + ch > vh - 8) y = r.top - ch - 12;
      if (y < 8) { y = Math.min(vh - ch - 8, Math.max(8, r.top + 12)); x = r.right + 12 + cw < vw ? r.right + 12 : Math.max(8, r.left - cw - 12); }
      Object.assign(card.style, { left: x + "px", top: y + "px" });
    } else {
      spot.style.display = "none"; spot.style.boxShadow = "0 0 0 9999px rgba(20,24,33,.45)";
      Object.assign(card.style, { left: Math.max(8, (vw - card.offsetWidth) / 2) + "px", top: Math.max(8, (vh - card.offsetHeight) / 3) + "px" });
    }
  }
  function show(k) {
    i = Math.max(0, Math.min(STEPS.length - 1, k)); const s = STEPS[i];
    st = s.start ? s.start() : null;
    const t = s.target ? el(s.target) : null; if (t && t.scrollIntoView && !(s.target === "#lines" && i > 3)) t.scrollIntoView({ block: "center", behavior: "smooth" });
    card.innerHTML = `<h3>${s.title}</h3><div>${s.text}</div><div class="bar"><span class="n">${i + 1} / ${STEPS.length}</span>
      ${s.wait ? `<span class="wait" id="tourWait">${s.waitText} …</span>` : ""}<span class="sp"></span>
      ${i ? `<button id="tourBack">Back</button>` : ""}<button id="tourClose">Close</button>
      <button class="go" id="tourNext">${i === STEPS.length - 1 ? "Finish" : (s.wait ? "Skip" : "Next")}</button></div>`;
    card.querySelector("#tourNext").onclick = () => i === STEPS.length - 1 ? end() : show(i + 1);
    card.querySelector("#tourClose").onclick = end;
    const b = card.querySelector("#tourBack"); if (b) b.onclick = () => show(i - 1);
    setTimeout(place, 50); setTimeout(place, 450);
  }
  function tick() {
    if (!card) return; place();
    const s = STEPS[i];
    if (s.wait && s.wait(st)) { const w = document.getElementById("tourWait"); if (w) { w.textContent = "✓ done"; w.style.color = "#1e8449"; } clearTimeout(timer); timer = setTimeout(() => show(i + 1), 900); s.wait = null; STEPS[i].done = true; }
  }
  function begin() {
    if (card) end();
    const sty = document.createElement("style"); sty.textContent = css; document.head.appendChild(sty);
    spot = document.createElement("div"); spot.className = "tour-spot"; card = document.createElement("div"); card.className = "tour-card";
    card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Guided tour");
    document.body.append(spot, card); STEPS.forEach((s, k) => { if (s._wait) s.wait = s._wait; else if (s.wait) s._wait = s.wait; });
    show(0); this_int = setInterval(tick, 300); addEventListener("resize", place); addEventListener("scroll", place, true);
  }
  let this_int = 0;
  function end() { clearInterval(this_int); spot && spot.remove(); card && card.remove(); spot = card = null; try { localStorage.setItem(LSK, "1"); } catch (e) {} }
  function button() {
    const nav = document.querySelector(".wb-nav"); if (!nav || document.getElementById("tourBtn")) return !!nav;
    const b = document.createElement("button"); b.className = "t"; b.id = "tourBtn"; b.textContent = "Guided tour"; b.style.marginLeft = "8px";
    b.onclick = (e) => { e.stopPropagation(); begin(); }; nav.appendChild(b); return true;
  }
  const wait = setInterval(() => {
    if (!W() || !document.getElementById("lines") || !document.querySelector("#lines .w")) return;
    if (!button()) return;
    clearInterval(wait);
    let seen = false; try { seen = localStorage.getItem(LSK) === "1"; } catch (e) {}
    if (!seen || params.get("tour")) begin();
  }, 300);
})();
