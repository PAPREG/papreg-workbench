# Data repository (private) — contract with the app

Produced by the project's pipeline (pilot2_ocr_vs_htr) from the reading of the HTR-paper model (calibration of the word-error
probabilities on held-out dev pages). No image and no expert transcription is in it. The app's test side (`sample/`) has the same
layout, so the demo runs exactly as the live app.

```
pages/index.json              {generated, volumes[], pages[{page_id, volume, folio, lines, words, hand, expected_errors, task_id}]}
pages/RV<v>/<folio>/          one side: a directory of layers (below)
tasks/review_queue.json       {round, generated, tasks[{task_id, round, page_id, hand, priority, est_cer, coverage, lines,
                               difficulty: easy|medium|hard, double_key: 0|1, assignee: null|<login>, reason}]}
meta/calibration.json         isotonic step functions P(error | n-best word posterior), in-lexicon / OOV; test-page check
models/history.json           (optional) {kind, note, points[{version, train_lines, wer, cer, alpha, beta}]}
```

## A side: one layer per pipeline step (`schema: papreg.page/0.3`)

Each layer is the output of one step and is written only by it; the app reads the layers and computes none of them (the editor's
work is stored apart, on the `annotations` branch, see `ANNOTATIONS.md`). Code: `pilot2_ocr_vs_htr/src/workbench_layers.py`.

| file | written by | required | content |
|---|---|---|---|
| `page.json` | every step (manifest) | yes | `schema, page_id, source{shelfmark, volume, folio, folio_number, side, pontificate, image_file, image_dir, page_width_px, page_height_px}, task_id, layers{<name>: {file, generator}}` |
| `text.json` | scripts/131 (reading) | yes | `model, thresholds, stats, hand, est_cer_agreement, notes, labels, zone_split, initials, initial_restored, address_groups, lines[]` |
| `cursus.json` | scripts/131 (pilot-1 rules, M1) | no | `cadence_rules, clausulae[]` |
| `ner.json` | scripts/131 (Span-NER + NER head) | no | `source, suggestions[{line_index, word_index, span, type, label, score, source}]` |
| `structure.json` | scripts/138 (diplomatic rules) | yes | `parts[line][word]` (rule-based part of every word: inscriptio … datatio, nota, margo), `rules[[line, word, part]]` (segmentation), `proposal` (the page's own, if any), `entries[{n, cont, iem, from[line, word], to[line, word]}]`, `margin_classes{line: {cls, why}}` |
| `witnesses.json` | scripts/136 (texts) + 138 (alignment) | no | `editions[{line, source, text, cite, letter, align}], regests[{entry, source, n, text, date}], concordance[{entry, pressutti, register_no}]`, `alignment{edition[{source, letter, lines[], cite, cells[]}], regest[{entry, n, cells[]}]}` |
| `formulas.json` | scripts/139 | no | `formulas[{gi, span, kind: herde|chancery, herde[{key, label, branch: a|b|fragment, identity}], herde_n, register_letters}]`, `formula_source{herde, register{letters, left_out, rule}, reading, script}`; references only, no text of Herde or of the register edition |

Lines of `text.json`:

```
lines[{line_id, line_index, zone?, zones?, split?, ink?, polygon[[x,y] relative], bbox[x,y,w,h relative], diplomatic_text, expanded_text,
       words[{text, p_error, posterior, is_oov, in_cadence, clausula?, add?, acc[[reading, n_syll, m|p|pp, source, syllables[]]],
              candidates?[{text, p, source: n-best|lexicon, acc, cursus?}]}]}]
clausulae[{clausula_id, tokens[[line, word]], end[line, word], cursus, cursus_detail, janson, at_risk, risk_tokens}]     (cursus.json)
```

Alignment cells (`witnesses.json`): `{k: same|differs|ocr|cand|plus|missing|cont, ref[line, word], refs[[line, word]…], form, merge?: 2:1|1:2, next?[line, word]}`
in text order; `plus` (witness text the reading lacks) stands before the word `next`. The app recomputes only `same` / `differs` of a pair
whose register word the editor has corrected.

The app loads `page.json`, then all listed layers in parallel (`js/wb.js`, `loadPage`). A missing required layer stops the page with
an error; a missing optional layer is listed in `D.missing`. Test side only: `page.synthetic.jpg` (generated, scripts/137) and, git-ignored,
`page.jpg` and `strips/` (internal build).

Pipeline order for a new side: `131` (text, cursus, ner, structure) → `136` (witnesses, where public-domain witnesses exist).
`138 <data root>` rebuilds structure.json (and witnesses.json) of every side, and splits one-file sides of `papreg.page/0.2`.
