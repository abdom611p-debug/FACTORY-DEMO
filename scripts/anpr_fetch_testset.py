"""Fetch a random sample of EALPR plate crops + derive ground-truth text (class-id → char solved from crop file names)."""
import json, os, random, re, socket, urllib.parse, urllib.request, concurrent.futures as cf
from collections import defaultdict

socket.setdefaulttimeout(30)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "anpr", "ealpr")
os.makedirs(OUT, exist_ok=True)
RAW = "https://raw.githubusercontent.com/ahmedramadan96/EALPR/HEAD/"
tree = [x["path"] for x in json.load(urllib.request.urlopen("https://api.github.com/repos/ahmedramadan96/EALPR/git/trees/HEAD?recursive=1"))["tree"]]

chars_by_plate = defaultdict(list)  # plate id → chars (from crop names)
for p in tree:
    m = re.search(r"/Characters/(\d+_license_plate_\d+)-(.)-\d+\.png$", p)
    if m:
        chars_by_plate[m.group(1)].append(m.group(2))
def _idx(pat, cond):
    out = {}
    for p in tree:
        if cond(p):
            m = re.search(pat, p)
            if m:
                out[m.group(1)] = p
    return out


labels = _idx(r"/(\d+_license_plate_\d+)\.txt$", lambda p: "Characters Labeling/" in p)
plates = _idx(r"/(\d+_license_plate_\d+)\.png$", lambda p: p.startswith("EALPR- Plates dataset/"))
ids = sorted(set(labels) & set(plates) & set(chars_by_plate))
print("plates with labels+crops:", len(ids))


def get(path):
    return urllib.request.urlopen(RAW + urllib.parse.quote(path)).read()


# 1) download ALL label files (small) to solve the class-id → char mapping
with cf.ThreadPoolExecutor(16) as ex:
    lab_txt = dict(zip(ids, ex.map(lambda i: get(labels[i]).decode(), ids)))

cand = {}
for i in ids:
    rows = [l.split() for l in lab_txt[i].strip().splitlines() if l.strip()]
    cls = [int(r[0]) for r in rows]
    if len(cls) != len(chars_by_plate[i]):
        continue
    cs = set(chars_by_plate[i])
    for c in cls:
        cand[c] = cand[c] & cs if c in cand else set(cs)
# propagate uniquely-resolved ids
changed = True
while changed:
    changed = False
    fixed = {next(iter(v)) for v in cand.values() if len(v) == 1}
    for k, v in cand.items():
        if len(v) > 1 and v - fixed != v:
            cand[k] = v - fixed if v - fixed else v
            changed = True
mapping = {k: next(iter(v)) for k, v in cand.items() if len(v) == 1}
print("resolved classes:", len(mapping), "/", len(cand), {k: v for k, v in sorted(mapping.items())})

# 2) ground truth: sort by x, digits (left) then letters (left→right visual)
gt = {}
for i in ids:
    rows = sorted(([float(x) for x in l.split()] for l in lab_txt[i].strip().splitlines() if l.strip()), key=lambda r: r[1])
    try:
        seq = [mapping[int(r[0])] for r in rows]
    except KeyError:
        continue
    digits = "".join(c for c in seq if c in "٠١٢٣٤٥٦٧٨٩")
    letters = [c for c in seq if c not in "٠١٢٣٤٥٦٧٨٩"]
    gt[i] = {"digits": digits, "letters_visual_ltr": letters}

random.seed(11)
sample = random.sample(sorted(gt), 300)
with cf.ThreadPoolExecutor(16) as ex:
    for i, data in zip(sample, ex.map(lambda i: get(plates[i]), sample)):
        open(os.path.join(OUT, i + ".png"), "wb").write(data)
json.dump({i: gt[i] for i in sample}, open(os.path.join(OUT, "gt.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("saved", len(sample))
