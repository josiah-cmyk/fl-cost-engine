"""Compress the weekly NADAC file into a drug-name lookup the browser can load.

NADAC is what pharmacies pay per unit (tablet, mL, gram). The price a plan is billed is
estimated as units x NADAC x MARKUP + DISPENSE, from the Meritain claims analysis showing
employer plans reimburse about 1.1x to 1.4x NADAC on generics.

One row per distinct drug description (latest effective date wins across NDCs):
  name            "LISINOPRIL 10 MG TABLET"
  unit            EA / ML / GM
  per_unit        NADAC per unit, dollars
  cls             G generic, B brand, BB brand biologic/authorized
  otc             1 if over the counter
  fill            estimated price for a default 30-day fill (30 EA, 90 ML, 30 GM -
                  inhalers and creams vary, so this is a default, not a promise)
  tier_guess      rx_generic / rx_brand_preferred / rx_specialty (specialty = fill > $600,
                  the common specialty-tier threshold shape; plans differ)

Output: data/processed/drug_lookup.json (also a .min.json without notes for the site)
Run:  python scripts/04_build_drug_lookup.py
"""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
MARKUP = 1.25
DISPENSE = 10.50
DEFAULT_UNITS = {"EA": 30, "ML": 90, "GM": 30}

n = pd.read_csv(ROOT / "data" / "raw" / "nadac.csv", dtype=str)
n["per_unit"] = pd.to_numeric(n["NADAC Per Unit"], errors="coerce")
n["eff"] = pd.to_datetime(n["Effective Date"], errors="coerce")
n = n.dropna(subset=["per_unit", "NDC Description"])
n = n.sort_values("eff").drop_duplicates("NDC Description", keep="last")

cls = n["Classification for Rate Setting"].map(
    lambda s: "G" if s == "G" else ("BB" if str(s).startswith("B-") else "B"))
units = n["Pricing Unit"].map(DEFAULT_UNITS).fillna(30)
# Injectables and other high-cost units: a 30-day supply is a couple of pens or vials,
# not 30. Liquids over $1/mL (insulins, solutions) default to 30 mL, not 90.
units = units.mask(n["Pricing Unit"].eq("EA") & (n["per_unit"] > 100), 2)
units = units.mask(n["Pricing Unit"].eq("ML") & (n["per_unit"] > 1), 30)
units = units.mask(n["Pricing Unit"].eq("ML") & (n["per_unit"] > 5), 10)   # insulins and similar
units = units.mask(n["Pricing Unit"].eq("ML") & (n["per_unit"] > 50), 3)   # GLP-1 and other pens
fill = units * n["per_unit"] * MARKUP + DISPENSE

tier = pd.Series("rx_brand_preferred", index=n.index)
tier[cls.eq("G")] = "rx_generic"
tier[fill > 600] = "rx_specialty"

out = pd.DataFrame({
    "name": n["NDC Description"].str.strip(),
    "unit": n["Pricing Unit"],
    "per_unit": n["per_unit"].round(5),
    "cls": cls,
    "otc": n["OTC"].eq("Y").astype(int),
    "units_default": units.astype(int),
    "fill": fill.round(2),
    "tier_guess": tier,
}).sort_values("name")

meta = {"source": "Medicaid NADAC weekly file", "as_of": str(n["As of Date"].iloc[-1]),
        "markup": MARKUP, "dispense_fee": DISPENSE, "default_units": DEFAULT_UNITS,
        "note": "fill = default units x NADAC x markup + dispensing fee; the site should let "
                "people adjust quantity, and treat tier_guess as a guess - the plan's own "
                "formulary tier wins when known"}
proc = ROOT / "data" / "processed"
(proc / "drug_lookup.json").write_text(json.dumps(
    {"meta": meta, "drugs": out.to_dict("records")}, separators=(",", ":")))
print(f"{len(out):,} drugs | generics {cls.eq('G').mean():.0%} | "
      f"specialty-tier guesses {tier.eq('rx_specialty').mean():.1%}")
print(f"size {(proc / 'drug_lookup.json').stat().st_size/1e6:.1f} MB")
for q in ["LISINOPRIL 10 MG TABLET", "ATORVASTATIN 20 MG TABLET", "HUMIRA PEN 40 MG/0.8 ML"]:
    r = out[out.name == q]
    if len(r):
        print(q, "-> fill", float(r.fill.iloc[0]), r.tier_guess.iloc[0])
