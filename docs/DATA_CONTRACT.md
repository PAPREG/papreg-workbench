# Data repository (private) — contract with the app

Produced by the project's export script from the reading of the HTR-paper model (calibration of the word-error probabilities on
held-out dev pages). No image and no expert transcription is in it.

```
pages/index.json              {generated, volumes[], pages[{page_id, volume, folio, lines, words, hand, expected_errors, task_id}]}
pages/RV<v>/<folio>.json      one side (format below)
tasks/review_queue.json       {round, generated, tasks[{task_id, round, page_id, hand, priority, est_cer, coverage, lines,
                               difficulty: easy|medium|hard, double_key: 0|1, assignee: null|<login>, reason}]}
meta/calibration.json         isotonic step functions P(error | n-best word posterior), in-lexicon / OOV; test-page check
models/history.json           (optional) {kind, note, points[{version, train_lines, wer, cer, alpha, beta}]}
```

Side (`schema: papreg.page/0.2`):

```
page_id, source{shelfmark, volume, folio, folio_number, side, pontificate, image_file, image_dir, page_width_px, page_height_px},
hand, est_cer_agreement, task_id,
model{name, version, training, decoding, calibration, wer_test, cer_test, test_words, auroc, ece},
thresholds{risk_high, risk_medium}, cadence_rules{classifier, window_tokens, min_tokens, tail_words, final_mono, type_table,
canonical, suffix_rules_p}, stats{lines, words, low, medium, expected_errors, clausulae, clausulae_at_risk}, notes[],
lines[{line_id, line_index, polygon[[x,y] relative], bbox[x,y,w,h relative], diplomatic_text, expanded_text,
       words[{text, p_error, posterior, is_oov, in_cadence, clausula?, acc[[reading, n_syll, m|p|pp, source, syllables[]]],
              candidates?[{text, p, source: n-best|lexicon, acc, cursus?}]}]}],
clausulae[{clausula_id, tokens[[line, word]], end[line, word], cursus, cursus_detail, janson, at_risk, risk_tokens}]
```
