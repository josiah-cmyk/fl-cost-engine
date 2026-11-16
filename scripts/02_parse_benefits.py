"""Parse cost-sharing strings into structured rules the engine can run.

For each plan variant and each service the tool prices, produce:
  copay, copay_per_day, copay_per_stay, coinsurance (0-1),
  before_deductible (True = cost sharing applies with no deductible first),
  after_deductible (True = deductible must be met first),
  covered, excluded_from_moop

String grammar seen in the 2027 file (CopayInnTier1 / CoinsInnTier1):
  "$X" / "$X.00"                     flat copay, no deductible
  "$X Copay after deductible"        copay once the deductible is met
  "$X Copay with deductible"        copay counts toward/alongside deductible (treated as copay + deductible path)
  "$X Copay per Day" (+ after ded)   per inpatient day
  "$X Copay per Stay" (+ after ded)  per admission
  "No Charge"                        $0, no deductible
  "No Charge after deductible"       covered 100% once deductible met
  "X%" / "X.00%"                     coinsurance on the allowed amount, no deductible
  "X% Coinsurance after deductible"  coinsurance once deductible met
  "Not Applicable"                   the other field (copay vs coins) carries the rule

Output: data/processed/rules.parquet (one row per plan_id x service)
Run:  python scripts/02_parse_benefits.py
"""
import pathlib
import re

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "processed"

# Benefit name -> the service key the engine prices
SERVICES = {
    "Primary Care Visit to Treat an Injury or Illness": "primary_care",
    "Specialist Visit": "specialist",
    "Other Practitioner Office Visit (Nurse, Physician Assistant)": "other_practitioner",
    "Preventive Care/Screening/Immunization": "preventive",
    "Urgent Care Centers or Facilities": "urgent_care",
    "Emergency Room Services": "er",
    "Inpatient Hospital Services (e.g., Hospital Stay)": "inpatient_facility",
    "Inpatient Physician and Surgical Services": "inpatient_physician",
    "Outpatient Facility Fee (e.g., Ambulatory Surgery Center)": "outpatient_facility",
    "Outpatient Surgery Physician/Surgical Services": "outpatient_physician",
    "Laboratory Outpatient and Professional Services": "lab",
    "X-rays and Diagnostic Imaging": "xray",
    "Imaging (CT/PET Scans, MRIs)": "advanced_imaging",
    "Mental/Behavioral Health Outpatient Services": "mental_health_outpatient",
    "Mental/Behavioral Health Inpatient Services": "mental_health_inpatient",
    "Outpatient Rehabilitation Services": "rehab",
    "Generic Drugs": "rx_generic",
    "Preferred Brand Drugs": "rx_brand_preferred",
    "Non-Preferred Brand Drugs": "rx_brand_nonpreferred",
    "Specialty Drugs": "rx_specialty",
    "Delivery and All Inpatient Services for Maternity Care": "maternity_delivery",
    "Prenatal and Postnatal Care": "prenatal",
}

MONEY = re.compile(r"\$([0-9,]+(?:\.[0-9]+)?)")
PCT = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%")


def parse_pair(copay_s, coins_s):
    """Return a rule dict from the copay and coinsurance strings."""
    c = (copay_s or "").strip()
    k = (coins_s or "").strip()
    rule = {"copay": 0.0, "copay_unit": "visit", "coinsurance": 0.0,
            "after_deductible": False, "no_charge": False, "parse_note": ""}

    def is_na(s):
        return s in ("", "Not Applicable", "nan")

    c_na, k_na = is_na(c), is_na(k)

    # --- copay side ---
    copay_active = False
    if not c_na:
        low = c.lower()
        m = MONEY.search(c)
        amt = float(m.group(1).replace(",", "")) if m else 0.0
        if "no charge" in low:
            if "after deductible" in low:
                rule["after_deductible"] = True
            rule["no_charge"] = True
        elif m:
            rule["copay"] = amt
            copay_active = amt > 0
            if "per day" in low:
                rule["copay_unit"] = "day"
            elif "per stay" in low:
                rule["copay_unit"] = "stay"
            if "after deductible" in low or "with deductible" in low:
                rule["after_deductible"] = True

    # --- coinsurance side ---
    if not k_na:
        low = k.lower()
        m = PCT.search(k)
        pct = float(m.group(1)) / 100 if m else 0.0
        if "no charge" in low:
            if "after deductible" in low:
                rule["after_deductible"] = True
            if not copay_active:
                rule["no_charge"] = True
        elif m:
            if pct > 0:
                rule["coinsurance"] = pct
            if "after deductible" in low:
                rule["after_deductible"] = True

    # A $0 copay with no coinsurance and no deductible = free
    if rule["copay"] == 0 and rule["coinsurance"] == 0 and not rule["after_deductible"]:
        rule["no_charge"] = True
    return rule


def main():
    b = pd.read_parquet(OUT / "benefits.parquet")
    b = b[b.BenefitName.isin(SERVICES)].copy()
    b["service"] = b.BenefitName.map(SERVICES)

    rows = []
    for r in b.itertuples(index=False):
        covered = (r.IsCovered or "") == "Covered"
        rule = parse_pair(r.CopayInnTier1, r.CoinsInnTier1) if covered else \
            {"copay": 0.0, "copay_unit": "visit", "coinsurance": 0.0,
             "after_deductible": False, "no_charge": False, "parse_note": "not covered"}
        qty = pd.to_numeric(r.LimitQty, errors="coerce") if (r.QuantLimitOnSvc or "") == "Yes" else np.nan
        rows.append({
            "plan_id": r.PlanId, "service": r.service, "covered": covered,
            "copay": rule["copay"], "copay_unit": rule["copay_unit"],
            "coinsurance": rule["coinsurance"], "after_deductible": rule["after_deductible"],
            "no_charge": rule["no_charge"],
            "limit_qty": qty, "limit_unit": r.LimitUnit if not pd.isna(qty) else None,
            "excl_from_moop": (r.IsExclFromInnMOOP or "") == "Yes",
            "copay_raw": r.CopayInnTier1, "coins_raw": r.CoinsInnTier1,
        })
    rules = pd.DataFrame(rows)
    rules.to_parquet(OUT / "rules.parquet", index=False)

    # Coverage check: every plan variant should have every service
    n_plans = rules.plan_id.nunique()
    counts = rules.groupby("service").plan_id.nunique()
    missing = counts[counts < n_plans]
    print(f"rules: {len(rules):,} rows, {n_plans} plans, {rules.service.nunique()} services")
    if len(missing):
        print("services missing from some plans:\n", missing.to_string())
    # Parse audit: anything with text we didn't consume meaningfully
    odd = rules[(~rules.no_charge) & (rules.copay == 0) & (rules.coinsurance == 0) & rules.covered]
    print(f"covered rows parsed to free-after-deductible-or-zero: {len(odd):,}")
    print(odd[["copay_raw", "coins_raw"]].value_counts().head(10).to_string())


if __name__ == "__main__":
    main()
