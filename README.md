# PAPREG Editorial Workbench

Client-side editor for the machine reading of the registers of Honorius III (Reg. Vat. 9–13), PAPREG project (FWF resubmission,
section 1.5.4). This repository holds **only the app** (static HTML + JavaScript, GitHub Pages). It holds no data.


| what | where |
|---|---|
| app (this repo, public) | `index.html` (editor), `js/wb.js` (data, login, tasks, saving), `config.json` |
| page data, page index, review queue (private) | data repository, branch `main`: `pages/RV<v>/<folio>.json`, `pages/index.json`, `tasks/review_queue.json` |
| editors' work (private) | same repository, branch `annotations`: `annotations/<type>/<login>.json`, one file per editor and type |
| images | **never on GitHub** (rights of the Vatican Apostolic Archive): read from the editor's local folder, or from a URL template |

Types of editors' files: `corrections` (word corrections, diplomatic lines, approvals, stress), `apparatus`, `entities`,
`structure` (diplomatic parts), `tasks` (claimed / finished review tasks), `telemetry` (active time, decisions; for the
words-per-hour and clause-ends-per-hour figures). Every editor writes only their own files, so editors never overwrite each other;
the others' corrections of the same side are shown as agreement (✓) and disagreement marks.

## How it works

1. Open the app, paste a GitHub fine-grained token (Contents: read and write on the data repository only). The login is the token's
   GitHub user; without write access the app is read-only.
2. **Task view.** Each editor sees their tasks (review queue, round by round: sides chosen per scribal hand, weak hands first;
   double-keyed sides go to two editors) and takes the next ones with one button; hard sides can be reserved for seniors
   (`seniors` in `config.json`). Every other side can also be opened from the page list.
3. **Page view.** The editor engine of the PAPREG pilot demo: calibrated word triage (likely error ≥ 50 %, uncertain 20–50 %),
   top-three candidates with the cadence each would give, accents and cursus recomputed in the browser after every change (port of
   the pilot-1 classifier M1), two layers (diplomatic / edition), apparatus, named entities, diplomatic structure, special
   characters, TEI export. A side's task is done when all its lines are approved.
   The TEI export (tests: `tests/tei_test.mjs`) holds what the editor has decided in the text (names; `add`, `del`, `subst` from the apparatus
   types *add. supra lin.*, *add. in marg.*, *del.*, *corr. ex*, *in ras.*; hands as `handNote` / `handShift`; marginal lines the editor has
   marked as additions or notes) and, as standoff annotations, what is only proposed (cursus class of the clause ends, word confidence, marginal
   text that may be an addition, siglum candidates). The facsimile carries the line zones; the images are not part of it.
4. **Saving.** 60 s after the last change, or at once after 25 changes, one commit with the changed files (Git Data API); on a race
   the remote file is merged (newer record per side wins) and the commit retried. A copy stays in the browser (localStorage).

## Setup

1. Data repository: a private repository of the organisation (`org` in `config.json`) holding the export of
   `pilot2_ocr_vs_htr/scripts/131_workbench_export.py` on `main`. Its name is not written in this public app: after login the app
   finds it among the repositories the token can read (the one with `pages/index.json`). The branch `annotations` is created by the app at the first save.
2. Collaborators of the data repository with role *Write* = editors. Each editor gets a fine-grained token for that repository only
   (resource owner: the organisation; Contents: read and write).
3. This repository: GitHub Pages (Settings → Pages: branch `main`, root).
4. Images: each editor keeps the register images locally (folders `RVAT9` … `RVAT13` as delivered) and chooses that folder once
   ("image folder"); the browser remembers it. Alternatively `images.mode = "url"` with a template for a local or institutional
   image server.

## Try it without login

The login page has "Open the test side": one side shipped with the app (`sample/`, machine reading only), no login, edits kept in
the browser. Direct link: `?test=1&page=RV9/154v`. A guided tour (`js/tour.js`) starts on the first visit and shows, step by step, the
reading and its uncertainty marks, Tab / 1–3 / Ctrl+Z / Enter (each practised before the tour goes on), the cadence marks, the views,
apparatus, names and special characters, the page panel, saving and tasks; "Guided tour" in the header restarts it
(`&tour=1` forces it). Tests: `tests/smoke_local.mjs`, `tests/tour_test.mjs`.

## Local test without GitHub (development)

Serve the parent directory so that a local copy of the data repository is reachable as `../workbench-data/`
(`localData` in `config.local.json`), and open `?config=config.local.json`:

```
cd .. && python3 -m http.server 8090        # run from the app directory
# http://localhost:8090/papreg_workbench/?config=config.local.json          (task view)
# http://localhost:8090/papreg_workbench/?config=config.local.json&page=RV9/154v
```

Edits then stay in the browser (localStorage).

## Status (2026-10-23)

Skeleton: login, task view and delegation, page loading, per-type per-editor saving, peers, local images, telemetry. Not yet:
the diplomatic layer from the reader (empty), entity suggestions of the NER head, model history file, the server-side merge of the
editors' files into training data and into CEI/TEI for GAMS, supervisory dashboard (telemetry is collected, not yet shown).
See `docs/`.

Fonts: Junicode (SIL Open Font License, `fonts/OFL.txt`).
