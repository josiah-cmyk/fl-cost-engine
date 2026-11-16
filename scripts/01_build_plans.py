"""Build clean Florida plan tables from the 2027 Exchange PUFs.

Outputs (data/processed/):
  plans.parquet        one row per plan variant: metal, CSR type, deductibles, MOOPs
  rates.parquet        premium by plan, rating area and age (plus tobacco rate)
  service_areas.parquet  plan -> counties sold in
  zip_county.parquet   Florida ZIP -> county (largest overlap wins; flag multi-county ZIPs)
  benefits.parquet     Florida benefit rows for the parser (next script)
Run:  python scripts/01_build_plans.py
"""
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)
PUF = RAW / "puf2027"


def money(s):
    return pd.to_numeric(
        s.astype(str).str.replace(r"[$,]", "", regex=True).replace(
            {"Not Applicable": np.nan, "nan": np.nan, "": np.nan}),
        errors="coerce")


# ---------------- Plan attributes ----------------
pa = pd.read_csv(PUF / "plan-attributes-puf" / "plan-attributes-puf.csv", dtype=str, low_memory=False)
fl = pa[(pa.StateCode == "FL") & (pa.MarketCoverage == "Individual") & (pa.DentalOnlyPlan == "No")].copy()

plans = pd.DataFrame({
    "plan_id": fl.PlanId,                       # 14 chars: standard component + variant
    "base_plan_id": fl.StandardComponentId,
    "issuer_id": fl.IssuerId,
    "issuer": fl.IssuerMarketPlaceMarketingName,
    "plan_name": fl.PlanMarketingName,
    "variant_name": fl.PlanVariantMarketingName,
    "plan_type": fl.PlanType,                   # HMO, EPO, PPO, POS
    "metal": fl.MetalLevel,
    "csr_type": fl.CSRVariationType,
    "actuarial_value": pd.to_numeric(fl.IssuerActuarialValue.str.replace("%", ""), errors="coerce"),
    "service_area_id": fl.ServiceAreaId,
    "network_id": fl.NetworkId,
    "hsa_eligible": fl.IsHSAEligible.eq("Yes"),
    "national_network": fl.NationalNetwork.eq("Yes"),
    "drug_ded_integrated": fl.MedicalDrugDeductiblesIntegrated.eq("Yes"),
    "drug_moop_integrated": fl.MedicalDrugMaximumOutofPocketIntegrated.eq("Yes"),
    "multi_tier_network": fl.MultipleInNetworkTiers.eq("Yes"),
    "ded_person": money(fl.TEHBDedInnTier1Individual),
    "ded_family": money(fl.TEHBDedInnTier1FamilyPerGroup),
    "ded_family_per_person": money(fl.TEHBDedInnTier1FamilyPerPerson),
    "moop_person": money(fl.TEHBInnTier1IndividualMOOP),
    "moop_family": money(fl.TEHBInnTier1FamilyPerGroupMOOP),
    "moop_family_per_person": money(fl.TEHBInnTier1FamilyPerPersonMOOP),
    "med_ded_person": money(fl.MEHBDedInnTier1Individual),
    "med_ded_family": money(fl.MEHBDedInnTier1FamilyPerGroup),
    "med_moop_person": money(fl.MEHBInnTier1IndividualMOOP),
    "med_moop_family": money(fl.MEHBInnTier1FamilyPerGroupMOOP),
    "drug_ded_person": money(fl.DEHBDedInnTier1Individual),
    "drug_ded_family": money(fl.DEHBDedInnTier1FamilyPerGroup),
    "drug_moop_person": money(fl.DEHBInnTier1IndividualMOOP),
    "drug_moop_family": money(fl.DEHBInnTier1FamilyPerGroupMOOP),
    "default_coins": fl.TEHBDedInnTier1Coinsurance,
    "copays_before_pcp_ded": fl.BeginPrimaryCareDeductibleCoinsuranceAfterNumberOfCopays,
})
# Where the deductible/MOOP are split medical vs drug, fill the combined columns
plans["ded_person"] = plans.ded_person.fillna(plans.med_ded_person)
plans["ded_family"] = plans.ded_family.fillna(plans.med_ded_family)
plans["moop_person"] = plans.moop_person.fillna(plans.med_moop_person)
plans["moop_family"] = plans.moop_family.fillna(plans.med_moop_family)

variant_map = {
    "Standard Silver On Exchange Plan": "base",
    "Standard Silver Off Exchange Plan": "off",
    "Standard Bronze On Exchange Plan": "base",
    "Standard Gold On Exchange Plan": "base",
    "Standard Platinum On Exchange Plan": "base",
    "Standard Catastrophic On Exchange Plan": "base",
    "Standard Expanded Bronze On Exchange Plan": "base",
    "On Exchange Variant": "base",
    "Off Exchange Variant": "off",
    "73% AV Level Silver Plan": "csr73",
    "87% AV Level Silver Plan": "csr87",
    "94% AV Level Silver Plan": "csr94",
    "Zero Cost Sharing Plan Variation": "zero_cs",
    "Limited Cost Sharing Plan Variation": "limited_cs",
}
plans["variant"] = plans.csr_type.map(variant_map).fillna("base")
plans = plans[plans.variant != "off"]

# ---------------- Rates ----------------
rates = pd.read_csv(PUF / "rate-puf" / "rate-puf.csv", dtype=str)
rfl = rates[rates.StateCode == "FL"].copy()
rfl = rfl[rfl.PlanId.isin(set(plans.base_plan_id))]
rfl["age"] = rfl.Age.replace({"0-14": "14", "64 and over": "64"})
rfl["age"] = pd.to_numeric(rfl.age, errors="coerce")
out_rates = pd.DataFrame({
    "base_plan_id": rfl.PlanId,
    "rating_area": rfl.RatingAreaId.str.replace("Rating Area ", "", regex=False).astype(int),
    "age": rfl.age.astype(int),
    "premium": pd.to_numeric(rfl.IndividualRate, errors="coerce"),
    "premium_tobacco": pd.to_numeric(rfl.IndividualTobaccoRate, errors="coerce"),
}).dropna(subset=["premium"])

# ---------------- Service areas ----------------
sa = pd.read_csv(PUF / "service-area-puf" / "service-area-puf.csv", dtype=str)
sfl = sa[(sa.StateCode == "FL") & (sa.MarketCoverage == "Individual") & (sa.DentalOnlyPlan == "No")].copy()
# County is a 5-digit FIPS; CoverEntireState Yes means every county
fips = sorted(sfl.loc[sfl.County.notna(), "County"].unique())
rows = []
for _, r in sfl.iterrows():
    counties = fips if r.CoverEntireState == "Yes" else [r.County]
    for c in counties:
        rows.append({"issuer_id": r.IssuerId, "service_area_id": r.ServiceAreaId, "county_fips": c,
                     "partial_county": r.PartialCounty == "Yes", "zip_codes": r.ZipCodes})
service = pd.DataFrame(rows).drop_duplicates(["issuer_id", "service_area_id", "county_fips"])

# ---------------- ZIP to county ----------------
z = pd.read_csv(RAW / "zcta_county_2020.txt", sep="|", dtype=str)
z = z[z.GEOID_COUNTY_20.str.startswith("12")].copy()
z["overlap"] = pd.to_numeric(z.AREALAND_PART, errors="coerce")
z = z.sort_values("overlap", ascending=False)
zc = z.drop_duplicates("GEOID_ZCTA5_20").rename(columns={
    "GEOID_ZCTA5_20": "zip", "GEOID_COUNTY_20": "county_fips", "NAMELSAD_COUNTY_20": "county_name"})
multi = z.groupby("GEOID_ZCTA5_20").GEOID_COUNTY_20.nunique()
zc["multi_county"] = zc.zip.map(multi).gt(1)
zip_county = zc[["zip", "county_fips", "county_name", "multi_county"]].dropna(subset=["zip"])

# Florida rating areas are county-based: build county -> rating area from CMS's published list.
# CMS numbers Florida rating areas 1..67 in county FIPS order (alphabetical), per the
# state rating area page; verify during the check step against a few known counties.
fl_counties = sorted(zip_county.county_fips.unique())
county_ra = pd.DataFrame({"county_fips": fl_counties, "rating_area": range(1, len(fl_counties) + 1)})
zip_county = zip_county.merge(county_ra, on="county_fips", how="left")

# ---------------- Benefits (Florida only, for the parser) ----------------
usecols = ["StateCode", "PlanId", "StandardComponentId", "BenefitName", "CopayInnTier1",
           "CoinsInnTier1", "IsEHB", "IsCovered", "QuantLimitOnSvc", "LimitQty", "LimitUnit",
           "IsExclFromInnMOOP", "Explanation"]
bcs = pd.read_csv(PUF / "benefits-and-cost-sharing-puf" / "benefits-and-cost-sharing-puf.csv",
                 dtype=str, usecols=usecols, chunksize=500_000)
parts = [c[c.StateCode == "FL"] for c in bcs]
benefits = pd.concat(parts, ignore_index=True)
benefits = benefits[benefits.PlanId.isin(set(plans.plan_id))]

plans.to_parquet(OUT / "plans.parquet", index=False)
out_rates.to_parquet(OUT / "rates.parquet", index=False)
service.to_parquet(OUT / "service_areas.parquet", index=False)
zip_county.to_parquet(OUT / "zip_county.parquet", index=False)
benefits.to_parquet(OUT / "benefits.parquet", index=False)
print(f"plans {len(plans):,} | rates {len(out_rates):,} | service {len(service):,} | "
      f"zips {len(zip_county):,} | benefit rows {len(benefits):,}")
print("variants:", plans.variant.value_counts().to_dict())
