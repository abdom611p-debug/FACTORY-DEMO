"""Build a YOLO character-detection dataset from EALPR, excluding the 300 held-out test plates."""
import json, os, random, re, socket, urllib.parse, urllib.request, concurrent.futures as cf

socket.setdefaulttimeout(40)
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "anpr")
OUT = os.path.join(HERE, "ealpr_yolo")
RAW = "https://raw.githubusercontent.com/ahmedramadan96/EALPR/HEAD/"
test_ids = set(json.load(open(os.path.join(HERE, "ealpr", "gt.json"), encoding="utf-8")))
tree = [x["path"] for x in json.load(urllib.request.urlopen("https://api.github.com/repos/ahmedramadan96/EALPR/git/trees/HEAD?recursive=1"))["tree"]]


def idx(pat, cond):
    out = {}
    for p in tree:
        if cond(p):
            m = re.search(pat, p)
            if m:
                out[m.group(1)] = p
    return out


labels = idx(r"/(\d+_license_plate_\d+)\.txt$", lambda p: "Characters Labeling/" in p)
plates = idx(r"/(\d+_license_plate_\d+)\.png$", lambda p: p.startswith("EALPR- Plates dataset/"))
ids = sorted((set(labels) & set(plates)) - test_ids)
random.seed(1)
random.shuffle(ids)
val = set(ids[:150])
for split in ("train", "val"):
    os.makedirs(os.path.join(OUT, "images", split), exist_ok=True)
    os.makedirs(os.path.join(OUT, "labels", split), exist_ok=True)


def get(path):
    for _ in range(3):
        try:
            return urllib.request.urlopen(RAW + urllib.parse.quote(path)).read()
        except Exception:
            pass
    return None


def one(i):
    split = "val" if i in val else "train"
    img, lab = get(plates[i]), get(labels[i])
    if not img or lab is None:
        return 0
    open(os.path.join(OUT, "images", split, i + ".png"), "wb").write(img)
    open(os.path.join(OUT, "labels", split, i + ".txt"), "wb").write(lab)
    return 1


with cf.ThreadPoolExecutor(16) as ex:
    n = sum(ex.map(one, ids))
names = ['أ', 'ب', 'ج', 'د', 'ر', 'س', 'ص', 'ط', 'ع', 'ف', 'ق', 'ل', 'م', 'ن', 'ه', 'و', 'ى', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
# latin names so the model can reuse app/models/anpr.py's mapping
latin = ['alf', 'baa', 'geem', 'dal', 'raa', 'sen', 'sad', 'taa', 'ain', 'faa', 'kaf', 'lam', 'meem', 'non', 'haa', 'waaw', 'yaa', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
with open(os.path.join(OUT, "data.yaml"), "w", encoding="utf-8") as f:
    f.write(f"path: {OUT.replace(os.sep, '/')}\ntrain: images/train\nval: images/val\nnames:\n" + "".join(f"  {k}: '{v}'\n" for k, v in enumerate(latin)))
print("downloaded", n, "train", n - len(val), "val", len(val))
