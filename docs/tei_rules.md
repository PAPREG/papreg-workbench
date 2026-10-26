# Validation rules of the TEI export (checked by `tests/tei_test.mjs`)

There is no ODD for the project yet; these rules are the checks the export must pass.

1. Well formed; every `xml:id` unique; every `#` pointer (`facs`, `target`, `corresp`, `hand`, `ana`, `new`) resolves.
2. Every `facs` resolves to a `zone` of the surface.
3. No annotation or text points at a `zone type="facing-page"`.
4. Every entry has an `inscriptio`, is `subtype="in-eundem-modum"`, or has `part="F"` (continues the previous folio).
5. `part="F"` only on the first entry, `part="I"` only on the last, `part="M"` only on a single entry page.
6. Every `<add place="line-end">` is directly preceded by a `<handShift>`.
7. The entity classes of `classDecl` (`N1`…`N9`) are the hotkeys of the interface.
8. `resp` is `#rules`, `#model`, `#editor`, `#formulae` or a declared respStmt; a part that differs from the rule-based proposal carries `#editor` and an editorial note saying what moved.
9. The name of the holding archive occurs neither in the file nor in the interface.
10. Every simulated diplomatic line carries `ana="#simulated"`, `resp="#rules"` and `cert="low"`; a line the editor has corrected carries `resp="#editor"`.
11. Every line-end addition, marginal address and recipient note (the sources of a band recipient) carries a `resp`; the truncated margin head is `#rules` and ends in an ellipsis when cut.
12. Witness lines (`annotation type="witness"`) stand in the standoff only; they never stand in the text and never replace the reading.
