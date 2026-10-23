# Editors' files (branch `annotations`)

`annotations/<type>/<login>.json`, written only by `<login>`:

```
{schema: "papreg.workbench/0.1", type, login, updated, pages: {<page_id or task_id>: {at, data, model?}}, log: [{at, page, what, n}]}
```

| type | key | data |
|---|---|---|
| corrections | page_id | `edits{"<line>:<word>": {corrected, method: confirmed|candidate|peer|manual, at}}`, `dipl{<line>: {text, at}}`, `apprE[]`, `apprD[]` (approved lines, edition / diplomatic), `stress{}` |
| apparatus | page_id | `app[{gi, span, type, text, hand, at}]` (gi = word index on the side) |
| entities | page_id | `ne[{gi, span, type: person|place|org|date, source, at}]`, `rej[]` (rejected suggestions) |
| structure | page_id | `dsSeg[[gi, part]]` (diplomatic parts changed by hand; absent = rule-based) |
| tasks | task_id | `{status: claimed|in progress|done|released, page}` |
| telemetry | page_id | `sessions[{opened, active_min, decisions, words_on_page, clausulae_on_page}]` (gaps over 2 min not counted) |

Merge rule (app and consolidation): per key the record with the later `at` wins; logs are united. Consolidation (to be written):
corrections of all editors → per word the majority / adjudicated form → re-alignment and retraining set (pilot2), CEI/TEI for GAMS;
divergent corrections of two editors on the same word → senior review queue.
