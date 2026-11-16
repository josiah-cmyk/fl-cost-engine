"""Pack the processed tables into compact JSON the browser engine loads.

web/data/
  plans.json        every plan variant the engine can rank (compact field names)
  rules.json        plan_id -> {service: [copay, coins, afterDed, noCharge, unitCode]}
  prices.json       service price list (allowed amounts)
  zip_county.json   FL zip -> [county_fips, rating_area, county_name, multi_county]
  county_plans.json county_fips -> [base_plan_id, ...]
  rates/ra_<n>.json base_plan_id -> {age: [premium, tobacco]}, one file per rating area
  pool.json         copied from ../meps-utilization (resampling pool)
Run:  python scripts/05_pack_web.py
"""
import json
import pathlib
import shutil

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
WEB = ROOT / "web" / "data"
(WEB / "rates").mkdir(parents=True, exist_ok=True)

plans = pd.read_parquet(PROC / "plans.parquet")
keep = ["plan_id", "base_plan_id", "issuer", "plan_name", "plan_type", "metal", "variant",
        "ded_person", "ded_family", "moop_person", "moop_family", "hsa_eligible"]
pj = plans[keep].astype(object).where(pd.notna(plans[keep]), None).to_dict("records")
(WEB / "plans.json").write_text(json.dumps(pj, separators=(",", ":"), allow_nan=False))

rules = pd.read_parquet(PROC / "rules.parquet")
unit_code = {"visit": 0, "day": 1, "stay": 2}
rj = {}
for pid, g in rules.groupby("plan_id"):
    rj[pid] = {r.service: [round(float(r.copay), 2), round(float(r.coinsurance), 4),
                           int(r.after_deductible), int(r.no_charge),
                           unit_code.get(r.copay_unit, 0), int(r.covered)]
               for r in g.itertuples()}
(WEB / "rules.json").write_text(json.dumps(rj, separators=(",", ":")))

shutil.copy(PROC / "prices.json", WEB / "prices.json")
shutil.copy(PROC / "drug_lookup.json", WEB / "drug_lookup.json")

zipc = pd.read_parquet(PROC / "zip_county.parquet")
zj = {r.zip: [r.county_fips, int(r.rating_area), r.county_name, int(r.multi_county)]
      for r in zipc.itertuples()}
(WEB / "zip_county.json").write_text(json.dumps(zj, separators=(",", ":")))

service = pd.read_parquet(PROC / "service_areas.parquet")
pairs = plans[["base_plan_id", "issuer_id", "service_area_id"]].drop_duplicates()
cp = {}
for r in service.merge(pairs, on=["issuer_id", "service_area_id"]).itertuples():
    cp.setdefault(r.county_fips, set()).add(r.base_plan_id)
(WEB / "county_plans.json").write_text(json.dumps(
    {k: sorted(v) for k, v in cp.items()}, separators=(",", ":")))

rates = pd.read_parquet(PROC / "rates.parquet")
for ra, g in rates.groupby("rating_area"):
    out = {}
    for r in g.itertuples():
        out.setdefault(r.base_plan_id, {})[int(r.age)] = [
            round(float(r.premium), 2),
            round(float(r.premium_tobacco), 2) if pd.notna(r.premium_tobacco) else None]
    (WEB / "rates" / f"ra_{int(ra)}.json").write_text(json.dumps(out, separators=(",", ":")))

pool_src = ROOT.parent / "meps-utilization" / "web" / "pool.json"
if pool_src.exists():
    shutil.copy(pool_src, WEB / "pool.json")

sizes = {p.name: round(p.stat().st_size / 1e6, 2) for p in sorted(WEB.glob("*.json"))}
print(json.dumps(sizes, indent=0))
print("rates files:", len(list((WEB / 'rates').glob('*.json'))),
      "biggest MB:", round(max(p.stat().st_size for p in (WEB / 'rates').glob('*.json')) / 1e6, 2))
