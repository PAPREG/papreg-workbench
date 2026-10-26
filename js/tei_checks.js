/* PAPREG Editorial Workbench — rules the TEI export must pass (docs/tei_rules.md). There is no ODD that validates the export yet:
   this is a check against these rules, not a schema validation. window.TEI_CHECKS.run(xmlString, pageText) -> [{id, text, ok, detail}] */
"use strict";
(function () {
  const NS = "http://www.tei-c.org/ns/1.0";
  const RULES = [
    ["wellformed", "well formed; every xml:id unique; every # pointer (facs, target, corresp, hand, ana, new, source) resolves"],
    ["facs", "every facs resolves to a zone of the surface"],
    ["facing", "no annotation or text points at a facing-page zone"],
    ["inscriptio", "every entry has an inscriptio, is in-eundem-modum, or continues the previous folio (part F)"],
    ["parts", "part F only on the first entry, I only on the last, M only on a single-entry page"],
    ["handshift", "every add place=line-end follows a handShift"],
    ["classes", "the entity classes of classDecl are the hotkeys N1 to N9"],
    ["resp", "resp values are #rules, #model, #editor, #formulae or a declared respStmt"],
    ["nosim", "no simulated layer is present: nothing carries ana=#simulated"],
    ["bandresp", "every line-end addition, marginal address and recipient note (the sources of a band recipient) carries a resp"],
    ["witness", "witness lines are standoff only: they never stand in the text"],
    ["witnesstoken", "every witness-token annotation has an ana (same, differs, missing, ocr, plus); a plus token has no target; every other token targets a register word"],
    ["boundary", "every boundary annotation targets a register token or points to the following register word (next); its ana is agree, witness-only or reading-only"],
    ["archive", "the name of the holding archive occurs neither in the file nor in the interface"]
  ];
  function run(x, pageText) {
    const d = new DOMParser().parseFromString(x, "application/xml"), res = [], add = (id, ok, detail) => res.push({ id, text: RULES.find(r => r[0] === id)[1], ok, detail: detail || "" });
    const err = d.querySelector("parsererror");
    if (err) { RULES.forEach(r => res.push({ id: r[0], text: r[1], ok: false, detail: "not well formed" })); return res; }
    const all = [...d.getElementsByTagNameNS(NS, "*")], q = (n) => [...d.getElementsByTagNameNS(NS, n)], ids = all.map(e => e.getAttribute("xml:id")).filter(Boolean), idset = new Set(ids);
    const dangling = [], dup = ids.filter((v, i, a) => a.indexOf(v) !== i);
    all.forEach(e => ["facs", "target", "corresp", "hand", "ana", "new", "source"].forEach(a => (e.getAttribute(a) || "").split(/\s+/).filter(Boolean).forEach(r => { if (r[0] === "#" && !idset.has(r.slice(1))) dangling.push(e.localName + "@" + a + "=" + r); })));
    add("wellformed", !dangling.length && !dup.length, dangling.concat(dup).slice(0, 3).join(" "));
    const zones = new Set(q("zone").map(z => z.getAttribute("xml:id"))), facing = new Set(q("zone").filter(z => z.getAttribute("type") === "facing-page").map(z => z.getAttribute("xml:id")));
    const facsBad = [], facingHit = [];
    all.forEach(e => ["facs", "target"].forEach(a => (e.getAttribute(a) || "").split(/\s+/).filter(Boolean).forEach(r => { const id = r.replace(/^#/, ""); if (a === "facs" && !zones.has(id)) facsBad.push(id); if (facing.has(id) && e.localName !== "zone") facingHit.push(e.localName); })));
    add("facs", !facsBad.length, facsBad.slice(0, 2).join(" ")); add("facing", !facingHit.length, facingHit.slice(0, 2).join(" "));
    const entries = q("div").filter(e => e.getAttribute("type") === "entry"), noIns = entries.filter(e => !e.getAttribute("part") && e.getAttribute("subtype") !== "in-eundem-modum" && ![...e.children].some(c => c.localName === "div" && c.getAttribute("type") === "inscriptio")).map(e => e.getAttribute("n"));
    add("inscriptio", !noIns.length, noIns.join(","));
    const pb = entries.filter((e, i) => { const p = e.getAttribute("part"); return (p === "F" && i !== 0) || (p === "I" && i !== entries.length - 1) || (p === "M" && entries.length > 1); }).map(e => e.getAttribute("n"));
    add("parts", !pb.length, pb.join(","));
    const ns = q("add").filter(a => a.getAttribute("place") === "line-end" && !(a.previousElementSibling && a.previousElementSibling.localName === "handShift")).length; add("handshift", ns === 0, String(ns));
    const cls = q("taxonomy").filter(t => t.getAttribute("xml:id") === "entity-classes").map(t => [...t.children].map(c => c.getAttribute("xml:id")).join(","))[0], want = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => "N" + i).join(",");
    add("classes", cls === want, cls || "");
    const respOk = new Set(["#rules", "#model", "#editor", "#formulae"].concat(q("respStmt").map(r => "#" + r.getAttribute("xml:id")))), badResp = all.map(e => e.getAttribute("resp")).filter(r => r && !respOk.has(r));
    add("resp", !badResp.length, badResp.slice(0, 2).join(" "));
    add("nosim", !/#simulated|simulated/i.test(x), "");
    const nr = q("add").filter(a => a.getAttribute("place") === "line-end" && !a.getAttribute("resp")).length + q("note").filter(n => (n.getAttribute("subtype") === "address" || n.getAttribute("type") === "recipient") && !n.getAttribute("resp")).length; add("bandresp", nr === 0, String(nr));
    const wt = q("annotation").filter(a => a.getAttribute("type") === "witness"), wbad = wt.filter(a => a.parentNode.parentNode.localName !== "standOff").length + q("div").filter(e => e.getAttribute("type") === "text").flatMap(e => [...e.getElementsByTagNameNS(NS, "*")]).filter(e => e.getAttribute("type") === "witness").length; add("witness", wbad === 0, String(wbad));
    const wtk = q("annotation").filter(a => a.getAttribute("type") === "witness-token"), wbad2 = wtk.filter(a => { const an = a.getAttribute("ana"), tg = a.getAttribute("target"); return !an || (an === "#plus" ? !!tg : !tg && an !== "#ocr"); }).length; add("witnesstoken", wbad2 === 0, String(wbad2));
    const bdn = q("annotation").filter(a => a.getAttribute("type") === "boundary").filter(a => !["#agree", "#witness-only", "#reading-only"].includes(a.getAttribute("ana")) || !(a.getAttribute("target") || a.getAttribute("next"))).length; add("boundary", bdn === 0, String(bdn));
    add("archive", !(/vatican/i.test(x) || /vatican/i.test(pageText || "")), "");
    return res;
  }
  window.TEI_CHECKS = { rules: RULES, run };
})();
