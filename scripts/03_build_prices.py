"""Build the 2027 allowed-amount price list for the Pasco County engine.

Each price = 2027 Medicare payment for the service in Florida x the decided multiplier
(employer markup x marketplace discount x Florida factor, from the spec's Assumptions).

Sources on disk (data/raw/):
  rvu27a/           2027 physician fee schedule RVUs and GPCIs (Jan release)
  opps27/           2027 OPPS final rule Addendum B (national rates)
  asc27/            2027 ASC final rule Addendum AA (national rates)
  ipps27/           FY2027 IPPS standardized amounts (Table 1A-1D) and DRG weights (Table 5)
  ascwage/          FY2027 pre-reclass wage index by CBSA (Tampa 45294 = 0.8682)
  clfs/             Clinical lab fee schedule (2026Q1; lab rates are flat national)

Output: data/processed/prices.json  (one row per service the engine prices)
Run:  python scripts/03_build_prices.py
"""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

CF_2027 = 32.6286                      # PFS conversion factor, non-APM
GPCI = {"pw": 0.977, "pe": 0.971, "mp": 1.540}   # FL locality 99, Rest of Florida (Pasco)
WI = 0.8682                            # Tampa CBSA 45294, FY2027 pre-reclass wage index
OPPS_WAGE = 0.60 * WI + 0.40           # OPPS: 60% labor share
ASC_WAGE = 0.50 * WI + 0.50            # ASC: 50% labor share
IPPS_LABOR, IPPS_NONLABOR, IPPS_CAPITAL = 4246.37, 2602.61, 540.03  # FY27, WI<=1, full update

# Decided multipliers (employer x marketplace x Florida), from the spec
MULT = {"office": 0.96, "other_phys": 1.13, "hosp_phys": 2.00,
        "inpatient": 2.19, "outpatient": 2.35, "asc": 1.44}


def load_pfs():
    r = pd.read_csv(RAW / "rvu27a" / "PPRRVU2027_Jan.csv", skiprows=9, dtype=str, low_memory=False)
    r.columns = ["hcpcs", "mod", "desc", "status", "not_used", "work", "pe_nonfac", "pe_nf_ind",
                 "pe_fac", "pe_f_ind", "mp", "tot_nonfac", "tot_fac", "pctc", "glob", "pre",
                 "intra", "post"] + list(r.columns[18:])
    for c in ["work", "pe_nonfac", "pe_fac", "mp"]:
        r[c] = pd.to_numeric(r[c], errors="coerce")
    r["mod"] = r["mod"].fillna("")
    return r.set_index(["hcpcs", "mod"])


def pfs_price(r, code, setting="nonfac", mod=""):
    row = r.loc[(code, mod)]
    pe = row.pe_nonfac if setting == "nonfac" else row.pe_fac
    return CF_2027 * (row.work * GPCI["pw"] + pe * GPCI["pe"] + row.mp * GPCI["mp"])


def opps_price(code):
    b = pd.read_excel(RAW / "opps27" / "2027 FR Addendum B.11.10.26.xlsx", skiprows=7, dtype=str, header=None)
    b.columns = [f"c{i}" for i in range(len(b.columns))]
    row = b[b.c0.astype(str).str.strip() == code].iloc[0]
    return float(row.c6) * OPPS_WAGE          # c6 = national unadjusted payment rate


def asc_price(code):
    aa = pd.read_excel(RAW / "asc27" / "2027 FR ASC Addenda.xlsx", sheet_name=0, skiprows=3, dtype=str, header=None)
    aa.columns = [f"c{i}" for i in range(len(aa.columns))]
    row = aa[aa.c0.astype(str).str.strip() == code].iloc[0]
    return float(row.c7) * ASC_WAGE


def ipps_stay(weight):
    operating = (IPPS_LABOR * WI + IPPS_NONLABOR) * weight
    capital = IPPS_CAPITAL * weight * WI      # approximation: capital geographic factor ~ WI
    return operating + capital


def clfs(code):
    d = pd.read_csv(RAW / "clfs" / "CLFS 2026 Q1V1.csv", skiprows=8, header=None, dtype=str,
                    encoding="latin-1")
    row = d[(d[1].astype(str).str.strip() == code) & (d[2].isna())].iloc[0]
    return float(row[5])


def main():
    r = load_pfs()


    prices = {}

    def add(key, medicare, mult_key, note):
        prices[key] = {"medicare_2027": round(medicare, 2), "multiplier": MULT[mult_key],
                       "allowed": round(medicare * MULT[mult_key], 2), "note": note}

    # ---- Office and professional (PFS non-facility, office multiplier) ----
    add("primary_care_visit", 0.6 * pfs_price(r, "99213") + 0.4 * pfs_price(r, "99214"),
        "office", "60/40 blend of 99213 and 99214, non-facility, Rest of Florida")
    add("specialist_visit", 0.75 * pfs_price(r, "99214") + 0.25 * pfs_price(r, "99204"),
        "office", "75% established 99214, 25% new patient 99204")
    add("urgent_care_visit", pfs_price(r, "99214") * 1.2,
        "office", "99214 plus 20% for facility overhead (S9083-style global fees vary)")
    add("mental_health_visit", pfs_price(r, "90837"), "office", "90837, 60-minute psychotherapy")
    add("therapy_visit", 3 * pfs_price(r, "97110"), "office", "3 units of 97110")
    add("other_practitioner_visit", pfs_price(r, "99213"), "office", "99213")
    add("prenatal_postnatal_bundle", pfs_price(r, "59400"), "other_phys",
        "59400 global obstetric care (all prenatal visits, delivery professional fee, postpartum)")

    # ---- Labs and imaging outside hospitals (other-physician multiplier) ----
    add("lab_panel", clfs("80053") + clfs("85025"), "other_phys",
        "CMP + CBC at the national lab fee schedule (flat, no geography)")
    add("xray", pfs_price(r, "71046"), "other_phys", "71046 chest x-ray 2 views, global, freestanding")
    add("advanced_imaging_freestanding", 0.5 * pfs_price(r, "70553") + 0.5 * pfs_price(r, "74177"),
        "other_phys", "MRI brain and CT abd/pelvis, global, freestanding center")

    # ---- Hospital outpatient (OPPS facility + PFS facility-setting professional) ----
    er_fac = 0.25 * opps_price("99283") + 0.50 * opps_price("99284") + 0.25 * opps_price("99285")
    er_prof = (0.25 * pfs_price(r, "99283", "fac") + 0.50 * pfs_price(r, "99284", "fac")
               + 0.25 * pfs_price(r, "99285", "fac"))
    prices["er_visit"] = {
        "medicare_2027": round(er_fac + er_prof, 2),
        "multiplier": None,
        "allowed": round(er_fac * MULT["outpatient"] + er_prof * MULT["hosp_phys"], 2),
        "note": "Facility (OPPS 25/50/25 blend of levels 3-5, wage-adjusted) x 2.35 "
                "+ ER physician (PFS facility) x 2.00"}

    hosp_img_fac = 0.5 * opps_price("70553") + 0.5 * opps_price("74177")
    img_prof = 0.5 * pfs_price(r, "70553", "fac", "26") + 0.5 * pfs_price(r, "74177", "fac", "26")
    prices["advanced_imaging_hospital"] = {
        "medicare_2027": round(hosp_img_fac + img_prof, 2), "multiplier": None,
        "allowed": round(hosp_img_fac * MULT["outpatient"] + img_prof * MULT["hosp_phys"], 2),
        "note": "OPPS imaging APC x 2.35 + radiologist read x 2.00"}

    surg_fac = 0.5 * opps_price("45380") + 0.5 * opps_price("29881")
    surg_prof = 0.5 * pfs_price(r, "45380", "fac") + 0.5 * pfs_price(r, "29881", "fac")
    prices["outpatient_surgery_hospital"] = {
        "medicare_2027": round(surg_fac + surg_prof, 2), "multiplier": None,
        "allowed": round(surg_fac * MULT["outpatient"] + surg_prof * MULT["hosp_phys"], 2),
        "note": "Colonoscopy/knee arthroscopy blend: OPPS x 2.35 + surgeon x 2.00"}

    asc_fac = 0.5 * asc_price("45380") + 0.5 * asc_price("29881")
    prices["outpatient_surgery_asc"] = {
        "medicare_2027": round(asc_fac + surg_prof, 2), "multiplier": None,
        "allowed": round(asc_fac * MULT["asc"] + surg_prof * MULT["other_phys"], 2),
        "note": "Same procedures in a surgery center: ASC rate x 1.44 + independent surgeon x 1.13"}

    hosp_clinic = opps_price("G0463")
    prices["hospital_outpatient_visit"] = {
        "medicare_2027": round(hosp_clinic + pfs_price(r, "99214", "fac"), 2), "multiplier": None,
        "allowed": round(hosp_clinic * MULT["outpatient"] + pfs_price(r, "99214", "fac") * MULT["hosp_phys"], 2),
        "note": "G0463 clinic facility fee x 2.35 + professional x 2.00"}

    # ---- Inpatient (IPPS: FY27 standardized amounts x DRG weight, Tampa wage index) ----
    med_w = (0.7886 + 0.8613 + 0.7645 + 0.8633 + 0.8691 + 1.0749 + 1.9320) / 7
    surg_w = (1.9560 + 1.2969) / 2
    stays = {
        "inpatient_medical_stay": (med_w, "common medical DRGs (pneumonia, heart failure, GI, "
                                          "cellulitis, viral, COPD, sepsis), avg weight"),
        "inpatient_surgical_stay": (surg_w, "joint replacement and gyn surgery DRGs, avg weight"),
        "vaginal_delivery_stay": (0.6802 + 0.2022, "DRG 807 mother + DRG 795 normal newborn"),
        "cesarean_delivery_stay": (0.9127 + 0.2022, "DRG 788 mother + DRG 795 normal newborn"),
    }
    for key, (w, note) in stays.items():
        fac = ipps_stay(w)
        prof = {"inpatient_medical_stay": pfs_price(r, "99223", "fac") + 2 * pfs_price(r, "99232", "fac"),
                "inpatient_surgical_stay": pfs_price(r, "99223", "fac") + 2 * pfs_price(r, "99232", "fac"),
                "vaginal_delivery_stay": 0.0,   # professional fee inside the 59400 global bundle
                "cesarean_delivery_stay": 0.0}[key]
        prices[key] = {"medicare_2027": round(fac + prof, 2), "multiplier": None,
                       "allowed": round(fac * MULT["inpatient"] + prof * MULT["hosp_phys"], 2),
                       "note": note + f"; IPPS FY27 amounts, Tampa wage index {WI}"}

    # ---- Drugs (decided per-fill averages; the site looks up real drugs in NADAC) ----
    for key, amt in [("rx_generic_fill", 22.0), ("rx_brand_fill", 385.0), ("rx_specialty_fill", 3420.0)]:
        prices[key] = {"medicare_2027": None, "multiplier": None, "allowed": amt,
                       "note": "Decided average per 30-day fill, before rebates; NADAC lookup overrides"}

    (OUT / "prices.json").write_text(json.dumps(prices, indent=1))
    for k, v in prices.items():
        print(f"{k:32s} medicare {str(v['medicare_2027']):>10s}  allowed {v['allowed']:>9.2f}")


if __name__ == "__main__":
    main()
