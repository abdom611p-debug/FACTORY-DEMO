"""
Fix TF.js graph models exported by Ultralytics (onnx2tf path) that encode depthwise convolutions
(DWConv in YOLO11 / YOLO26 heads) as a grouped Conv2D with a [kh, kw, 1, C] kernel — tfjs-converter
runs them as a dense Conv2D and the detections come out wrong.

Rewrites each such node to DepthwiseConv2dNative and relabels the kernel as [kh, kw, C, 1]
(same memory layout, so the weight shards are untouched). Same fix as assets/models/pose_n.

usage: python scripts/tfjs_fix_depthwise.py platform/assets/models/<model>/model.json
"""
import json
import sys


def fix(path: str) -> int:
    d = json.load(open(path, encoding="utf-8"))
    nodes = {n["name"]: n for n in d["modelTopology"]["node"]}
    manifest = {w["name"]: w for g in d["weightsManifest"] for w in g["weights"]}
    fixed = 0
    for n in d["modelTopology"]["node"]:
        if n["op"] not in ("Conv2D", "_FusedConv2D") or len(n.get("input", [])) < 2:
            continue
        k = nodes.get(n["input"][1])
        dims = k and k.get("attr", {}).get("value", {}).get("tensor", {}).get("tensorShape", {}).get("dim")
        if not dims or len(dims) != 4:
            continue
        kh, kw, cin, cout = (int(x.get("size", 0)) for x in dims)
        if cin != 1 or cout <= 1:
            continue
        n["op"] = "DepthwiseConv2dNative" if n["op"] == "Conv2D" else "FusedDepthwiseConv2dNative"
        dims[2]["size"], dims[3]["size"] = str(cout), "1"
        if k["name"] in manifest:
            manifest[k["name"]]["shape"] = [kh, kw, cout, 1]
        fixed += 1
    json.dump(d, open(path, "w", encoding="utf-8"))
    return fixed


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p, "→ depthwise convs fixed:", fix(p))
