"""data/*.csv -> Supabase raw tables (upsert, safe to re-run). Run: python3 load_raw.py   (standard library only)

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (the secret key; never ship it to the browser).
Run build.py first if data/*.csv is missing (it downloads the sheet).
"""
import csv, json, os, sys, urllib.request
from pathlib import Path

DATA = Path(__file__).parent / "data"
BATCH = 1000

# Parents before children (foreign keys). table -> primary-key columns
TABLES = {
    "patient": "jid", "institution": "yid", "sido_code": "sido_cd", "code_table": "code_type,code",
    "sick_master": "sickcd", "drug_ingredient": "gnl_cd", "hospital_open": "hosp_id",
    "claim": "mid", "claim_sick": "mid,sick_sno", "claim_rx": "mid,ln_no",
}


def post(url, key, table, pk, rows):
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/{table}?on_conflict={pk}",
        data=json.dumps(rows, ensure_ascii=False).encode(), method="POST",
        headers={"apikey": key, "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req).close()


def main():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key): sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
    for table, pk in TABLES.items():
        with open(DATA / f"{table}.csv", encoding="utf-8", newline="") as f:
            rows = [{k: (v if v != "" else None) for k, v in r.items()} for r in csv.DictReader(f)]
        for i in range(0, len(rows), BATCH):
            post(url, key, table, pk, rows[i:i + BATCH])
        print(f"loaded {table} ({len(rows):,} rows)")


if __name__ == "__main__":
    main()
