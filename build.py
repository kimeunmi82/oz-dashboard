"""data -> site/data/*.json. Run: python3 build.py   (standard library only)

Add a metric: write a function returning JSON-serializable data, register it in AGGREGATES.
"""
import csv, json, os, re, statistics as st, sys, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
DATA, OUT = ROOT / "data", ROOT / "site" / "data"

SHEET_ID = "1nPuY8AKFAs2r9da4xUBV3WMKdLEBZJGpmd3kP7xKNvU"
TABS = {}       # {"claim": gid}; empty = auto-discover all tabs except README

BASE = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"


def fetch():
    tabs = TABS or {
        n: g for n, g in re.findall(
            r'name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)"',
            urllib.request.urlopen(f"{BASE}/htmlview").read().decode()
        ) if n.lower() != "readme"
    }
    DATA.mkdir(exist_ok=True)
    for name, gid in tabs.items():
        body = urllib.request.urlopen(f"{BASE}/export?format=csv&gid={gid}").read()
        (DATA / f"{name}.csv").write_bytes(body)
        print(f"fetched {name} ({len(body):,} bytes)")


def table(name):
    """All values are strings; '' means NULL."""
    with open(DATA / f"{name}.csv", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def check():
    claim, patient, inst = table("claim"), table("patient"), table("institution")
    jids, yids = {r["jid"] for r in patient}, {r["yid"] for r in inst}
    return {
        "claim.mid unique": len({r["mid"] for r in claim}) == len(claim),
        "claim.jid in patient": all(r["jid"] in jids for r in claim),
        "claim.yid in institution": all(r["yid"] in yids for r in claim),
        "total = self + insurer": all(
            int(r["rvd_rpe_tamt_amt"]) == int(r["rvd_slf_brdn_amt"] or 0) + int(r["rvd_insup_brdn_amt"] or 0) for r in claim
        ),
    }


# --- scope: respiratory (main_sick starts with J), outpatient (fom_tp_cd 031) ---
MIN_N = 8          # institutions below this many claims are not ranked
FLAG_RATIO = 1.5   # institution median / class median at or above this is flagged
CHANGE_FLAG = 0.10 # monthly claim count change vs baseline at or above +/-10% is flagged
CLASSES = {"01": "상급종합", "11": "종합병원", "21": "병원", "31": "의원"}
DX = {"J209": "급성 기관지염 J209", "J304": "알레르기비염 J304", "J00": "급성 비인두염 J00",
      "J029": "급성 인두염 J029", "J039": "급성 편도염 J039"}
# Antibiotic rule: drug_ingredient.class_no in these (61x antibiotics except 616 antifungal/anti-TB and 617 antineoplastic, 621 sulfonamides),
# minus ingredients whose name marks an antiviral/antifungal (class 618 also holds e.g. acyclovir).
ABX_CLASSES = {"611", "612", "613", "614", "615", "618", "619", "621"}
NON_ABX_NAME = re.compile(r"vir\b|vir |conazole|fungin|amphotericin|nystatin|terbinafine", re.I)

_cache = {}


def pct(v, p):
    v = sorted(v); k = (len(v) - 1) * p; f = int(k); c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)


def scope():
    """Respiratory outpatient claims with institution/patient fields and Rx joined. Cached."""
    if "j" in _cache: return _cache["j"]
    claim, pat = table("claim"), {r["jid"]: r for r in table("patient")}
    ins = {r["yid"]: r for r in table("institution")}
    region = {r["region_cd"]: r["region_nm"] for r in table("sido_code")}
    drug = {r["gnl_cd"]: r for r in table("drug_ingredient")}
    rx = defaultdict(list)
    for r in table("claim_rx"):
        d = drug[r["gnl_cd"]]
        r["abx"] = d["class_no"] in ABX_CLASSES and not NON_ABX_NAME.search(d["gnl_nm"])
        r["name"], r["class_no"] = d["gnl_nm"], d["class_no"]
        rx[r["mid"]].append(r)
    rows = []
    for r in claim:
        if not (r["main_sick"].startswith("J") and r["fom_tp_cd"] == "031"): continue
        i, p = ins[r["yid"]], pat[r["jid"]]
        age = int(r["recu_fr_dd"][:4]) - int(p["birth_yr"])
        lines = rx.get(r["mid"], [])
        rows.append(dict(yid=r["yid"], dx=r["main_sick"], month=r["recu_fr_dd"][:7], amt=int(r["rvd_rpe_tamt_amt"]),
                         cl=CLASSES.get(i["cl_cd"], i["cl_cd"]), region=region.get(i["region_cd"], "기타"),
                         band=min(age // 10, 8), sex=p["sex_tp_cd"], rx=lines, abx=any(x["abx"] for x in lines), rxamt=sum(int(x["amt"] or 0) for x in lines)))
    _cache["j"] = rows
    return rows


def scope_j_all():
    """All respiratory claims (main_sick starts with J), outpatient and inpatient, with institution class. Cached."""
    if "jall" in _cache: return _cache["jall"]
    ins = {r["yid"]: r for r in table("institution")}
    rows = [dict(jid=r["jid"], month=r["recu_fr_dd"][:7], amt=int(r["rvd_rpe_tamt_amt"]),
                 cl=CLASSES.get(ins[r["yid"]]["cl_cd"], ins[r["yid"]]["cl_cd"]))
            for r in table("claim") if r["main_sick"].startswith("J")]
    _cache["jall"] = rows
    return rows


def monthly_cost_cls():
    """Month x institution class totals of rvd_rpe_tamt_amt (KRW) over respiratory claims, zero-filled."""
    rows = scope_j_all()
    tot, cnt = defaultdict(int), defaultdict(int)
    for r in rows: tot[(r["month"], r["cl"])] += r["amt"]; cnt[(r["month"], r["cl"])] += 1
    return [dict(month=m, group=g, total=tot[(m, g)], n=cnt[(m, g)])
            for m in sorted({r["month"] for r in rows}) for g in CLASSES.values()]


def monthly_patients():
    """Distinct patients (jid) with a respiratory claim in each month."""
    p = defaultdict(set)
    for r in scope_j_all(): p[r["month"]].add(r["jid"])
    return [dict(month=m, patients=len(v)) for m, v in sorted(p.items())]


def kpi():
    j, claims = scope(), table("claim")
    total = len(claims)
    all_j = sum(1 for r in claims if r["main_sick"].startswith("J"))
    cls = {c["cl"]: c["median"] for c in cls_summary()}
    insts = inst_stats()
    return [dict(metric="j_claims", value=len(j)), dict(metric="j_share", value=round(all_j / total * 100, 1)),
            dict(metric="median_cost", value=round(st.median(r["amt"] for r in j))),
            dict(metric="gap_ratio", value=round(cls["상급종합"] / cls["의원"], 2)),
            dict(metric="abx_rate", value=round(sum(r["abx"] for r in j) / len(j) * 100, 1)),
            dict(metric="outlier_inst", value=sum(1 for r in insts if r["ratio"] >= FLAG_RATIO)),
            dict(metric="inst_checked", value=len(insts)),
            # respiratory (main_sick J) claims, outpatient + inpatient: row count, sum of rvd_rpe_tamt_amt (KRW), distinct jid
            dict(metric="claims_total", value=len(scope_j_all())),
            dict(metric="total_cost", value=sum(r["amt"] for r in scope_j_all())),
            dict(metric="patients_total", value=len({r["jid"] for r in scope_j_all()}))]


def cls_summary():
    """Per class: P25/median/P75 and an age-decade x sex standardized median (direct standardization)."""
    j = scope()
    w = Counter((r["band"], r["sex"]) for r in j)
    out = []
    for cl in CLASSES.values():
        rows = [r for r in j if r["cl"] == cl]
        strata = defaultdict(list)
        for r in rows: strata[(r["band"], r["sex"])].append(r["amt"])
        num = den = 0
        for k, wt in w.items():
            if len(strata.get(k, [])) >= 3: num += wt * st.median(strata[k]); den += wt
        a = [r["amt"] for r in rows]
        out.append(dict(cl=cl, n=len(a), p25=round(pct(a, .25)), median=round(st.median(a)), p75=round(pct(a, .75)),
                        adj_median=round(num / den)))
    return out


def dx_cls():
    j, out = scope(), []
    for d, nm in DX.items():
        for cl in CLASSES.values():
            a = [r["amt"] for r in j if r["dx"] == d and r["cl"] == cl]
            out.append(dict(dx=nm, cl=cl, n=len(a), median=round(st.median(a)) if a else 0))
    return out


def region():
    j, out = scope(), []
    for g in ["수도권", "강원충청권", "호남제주권", "영남권"]:
        a = [r["amt"] for r in j if r["region"] == g]
        out.append(dict(region=g, n=len(a), median=round(st.median(a)), p25=round(pct(a, .25)), p75=round(pct(a, .75))))
    return out


def monthly():
    m = defaultdict(list)
    for r in scope(): m[r["month"]].append(r["amt"])
    return [dict(month=k, n=len(v), median=round(st.median(v))) for k, v in sorted(m.items())]


def monthly_compare():
    """Claim count per month vs previous month (MoM) and same month last year (YoY, primary). None = no baseline."""
    m = monthly()
    n = {r["month"]: r["n"] for r in m}
    def prev(mo, months):
        y, k = int(mo[:4]), int(mo[5:]) - months
        while k < 1: y, k = y - 1, k + 12
        return f"{y}-{k:02d}"
    out = []
    for r in m:
        mo = r["month"]; yo, pm = n.get(prev(mo, 12)), n.get(prev(mo, 1))
        yoy = (r["n"] - yo) / yo if yo else None
        mom = (r["n"] - pm) / pm if pm else None
        out.append(dict(month=mo, n=r["n"], yoy_n=yo, yoy=round(yoy, 3) if yoy is not None else None,
                        mom_n=pm, mom=round(mom, 3) if mom is not None else None,
                        flag=(1 if yoy is not None and abs(round(yoy, 3)) >= CHANGE_FLAG else 0)))  # judged on the displayed (rounded) value
    return out


def inst_stats():
    if "inst" in _cache: return _cache["inst"]
    med = {c["cl"]: c["median"] for c in cls_summary()}
    by = defaultdict(list)
    for r in scope(): by[r["yid"]].append(r)
    out = []
    for y, rows in by.items():
        if len(rows) < MIN_N: continue
        cl, m = rows[0]["cl"], st.median(r["amt"] for r in rows)
        out.append(dict(yid=y, cl=cl, region=rows[0]["region"], n=len(rows), median=round(m),
                        class_median=med[cl], ratio=round(m / med[cl], 2)))
    out.sort(key=lambda r: -r["ratio"])
    _cache["inst"] = out
    return out


def inst_outliers():
    return inst_stats()[:12]


def rx_class():
    """Top ingredients in respiratory outpatient claims: share of claims that include the ingredient."""
    j, cc, meta = scope(), Counter(), {}
    for r in j:
        for x in r["rx"]: meta[x["name"]] = x
        for nm in {x["name"] for x in r["rx"]}: cc[nm] += 1
    return [dict(name=k, class_no=meta[k]["class_no"], abx=int(meta[k]["abx"]), claims=v, share=round(v / len(j), 3))
            for k, v in cc.most_common(8)]


def abx_by_cls():
    j, out = scope(), []
    for cl in CLASSES.values():
        rows = [r for r in j if r["cl"] == cl]
        out.append(dict(cl=cl, n=len(rows), abx_claims=sum(r["abx"] for r in rows), rate=round(sum(r["abx"] for r in rows) / len(rows) * 100, 1)))
    return out


def abx_by_dx():
    j, out = scope(), []
    for d, nm in DX.items():
        rows = [r for r in j if r["dx"] == d]
        out.append(dict(dx=nm, n=len(rows), abx_claims=sum(r["abx"] for r in rows), rate=round(sum(r["abx"] for r in rows) / len(rows) * 100, 1)))
    return out


AGGREGATES = {"kpi": kpi, "cls_summary": cls_summary, "dx_cls": dx_cls, "region": region,
              "monthly": monthly, "monthly_compare": monthly_compare, "inst_outliers": inst_outliers, "rx_class": rx_class, "abx_by_cls": abx_by_cls, "abx_by_dx": abx_by_dx,
              "monthly_cost_cls": monthly_cost_cls, "monthly_patients": monthly_patients}


def push(rows):
    """Upsert metrics into Supabase when SUPABASE_URL and SUPABASE_SERVICE_KEY are set; otherwise skip."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        print("skip supabase upsert (SUPABASE_URL / SUPABASE_SERVICE_KEY not set)")
        return
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/metrics?on_conflict=id",
        data=json.dumps(rows, ensure_ascii=False).encode(), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req).close()
    print(f"upserted {len(rows)} metrics to supabase")


def main():
    rows = []
    if SHEET_ID: fetch()
    results = check()
    for k, ok in results.items(): print("PASS" if ok else "FAIL", k)
    if not all(results.values()): sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in AGGREGATES.items():
        d = fn()
        (OUT / f"{name}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"built site/data/{name}.json ({len(d)} rows)")
        rows.append({"id": name, "data": d})
    push(rows)


if __name__ == "__main__":
    main()
