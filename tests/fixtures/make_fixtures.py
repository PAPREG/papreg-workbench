"""Test data trees for tests/modes_test.mjs: the sample page with no witnesses (none/) and with the synthetic witnesses of wit/source/ (wit/).
The layers point to the sample's files (no copy); only the manifest and, in wit/, witnesses.json are written here.
witnesses.json is built by the pipeline's own code (pilot2_ocr_vs_htr/src/workbench_layers.py).  usage: python3 tests/fixtures/make_fixtures.py"""
import json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(os.path.dirname(HERE)); SAMPLE = os.path.join(APP, "sample")
sys.path.insert(0, os.path.expanduser("~/github/PAPREG/pilots/pilot2_ocr_vs_htr/src"))
import workbench_layers as WL
PID = "RV9/154v"; SP = os.path.join(SAMPLE, "pages", PID); man = json.load(open(os.path.join(SP, "page.json")))
for name in ("none", "wit"):
    root = os.path.join(HERE, name); pdir = os.path.join(root, "pages", PID); os.makedirs(pdir, exist_ok=True)
    up = os.path.relpath(SP, pdir)
    layers = {k: {**v, "file": f"{up}/{v['file']}"} for k, v in man["layers"].items() if k != "witnesses"}
    if name == "wit":
        rd = lambda n: json.load(open(os.path.join(root, "source", n)))
        st = json.load(open(os.path.join(SP, "structure.json"))); tx = json.load(open(os.path.join(SP, "text.json")))
        json.dump(WL.witness_layer(tx, st, rd("witness.json"), rd("regests.json"), [], generator="tests/fixtures/make_fixtures.py (synthetic witnesses)"),
                  open(os.path.join(pdir, "witnesses.json"), "w"), ensure_ascii=False, separators=(",", ":"))
        layers["witnesses"] = {"file": "witnesses.json", "generator": "tests/fixtures/make_fixtures.py (synthetic witnesses)"}
    json.dump({**man, "layers": layers}, open(os.path.join(pdir, "page.json"), "w"), ensure_ascii=False, indent=1)
    for f in ("pages/index.json", "tasks/review_queue.json"):
        os.makedirs(os.path.dirname(os.path.join(root, f)), exist_ok=True); shutil.copy(os.path.join(SAMPLE, f), os.path.join(root, f))
print("fixtures: none/, wit/")
