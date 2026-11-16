"""Reference cost engine: rank every plan in a county by estimated total yearly cost.

The browser version will be a port of this file. Steps per plan:
  1. Premium for the household by age (3-oldest-children rule), minus the tax credit.
  2. Pick the CSR silver variant the household qualifies for.
  3. Simulate the household's care year against the plan's parsed cost-sharing rules,
     once for each of N resampled sets of matched MEPS person-years.
  4. Report typical (median), bad year (p90), and worst case (net premium + family MOOP).
"""
import json
import pathlib
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
FPL_BASE, FPL_PER_PERSON = 15960, 5680           # 2026 guidelines, used for 2027 coverage

# Rev. Proc. 2026-26 applicable percentage table for 2027
AP_TABLE = [(0, 133, 2.15, 2.15), (133, 150, 3.23, 4.30), (150, 200, 4.30, 6.78),
            (200, 250, 6.78, 8.66), (250, 300, 8.66, 10.22), (300, 400, 10.22, 10.22)]

# MEPS pool usage column -> (service rule key, price key(s) with weights, unit)
EVENT_MAP = [
    ("preventive_visits", "preventive", [("primary_care_visit", 1.0)]),
    ("primary_care_visits", "primary_care", [("primary_care_visit", 1.0)]),
    ("specialist_visits", "specialist", [("specialist_visit", 1.0)]),
    ("mental_health_visits", "mental_health_outpatient", [("mental_health_visit", 1.0)]),
    ("therapy_visits", "rehab", [("therapy_visit", 1.0)]),
    ("other_office_visits", "other_practitioner", [("other_practitioner_visit", 1.0)]),
    ("prenatal_visits", "prenatal", [("specialist_visit", 1.0)]),
    ("hospital_outpatient_visits", "outpatient_facility", [("hospital_outpatient_visit", 1.0)]),
    ("outpatient_surgeries", "outpatient_facility",
     [("outpatient_surgery_hospital", 0.6), ("outpatient_surgery_asc", 0.4)]),
    ("er_visits", "er", [("er_visit", 1.0)]),
    ("lab_visits", "lab", [("lab_panel", 1.0)]),
    ("basic_imaging", "xray", [("xray", 1.0)]),
    ("advanced_imaging", "advanced_imaging",
     [("advanced_imaging_freestanding", 0.5), ("advanced_imaging_hospital", 0.5)]),
    ("generic_rx_30day", "rx_generic", [("rx_generic_fill", 1.0)]),
    ("brand_rx_30day", "rx_brand_preferred", [("rx_brand_fill", 1.0)]),
    ("specialty_rx_30day", "rx_specialty", [("rx_specialty_fill", 1.0)]),
]
STAY_MIX = [("inpatient_medical_stay", 0.56), ("inpatient_surgical_stay", 0.44)]
BIRTH_MIX = [("vaginal_delivery_stay", 0.67), ("cesarean_delivery_stay", 0.33)]


@dataclass
class Member:
    age: int
    sex: str = "F"               # F, M, or skip
    profile: str = "typical"     # healthy, typical, ongoing
    tobacco: bool = False


@dataclass
class Household:
    zip_code: str
    income: float
    members: list = field(default_factory=list)

    @property
    def fpl_pct(self):
        fpl = FPL_BASE + FPL_PER_PERSON * (len(self.members) - 1)
        return 100 * self.income / fpl


class Engine:
    def __init__(self):
        self.plans = pd.read_parquet(PROC / "plans.parquet")
        self.rates = pd.read_parquet(PROC / "rates.parquet")
        self.service = pd.read_parquet(PROC / "service_areas.parquet")
        self.zipc = pd.read_parquet(PROC / "zip_county.parquet").set_index("zip")
        self.prices = {k: v["allowed"] for k, v in
                       json.loads((PROC / "prices.json").read_text()).items()}
        rules = pd.read_parquet(PROC / "rules.parquet")
        self.rules = {pid: g.set_index("service").to_dict("index")
                      for pid, g in rules.groupby("plan_id")}
        pool = pd.read_parquet(ROOT.parent / "meps-utilization" / "data" / "processed" / "persons.parquet")
        g = lambda c: pool[c] if c in pool else 0.0
        pool["preventive_visits"] = g("office_preventive") + g("outpatient_preventive")
        pool["primary_care_visits"] = g("office_primary_care")
        pool["specialist_visits"] = g("office_specialist")
        pool["mental_health_visits"] = g("office_mental_health") + g("outpatient_mental_health")
        pool["therapy_visits"] = g("office_therapy")
        pool["other_office_visits"] = g("office_other")
        pool["prenatal_visits"] = g("office_prenatal")
        pool["hospital_outpatient_visits"] = g("outpatient_visit")
        pool["outpatient_surgeries"] = g("outpatient_surgery")
        pool["er_visits"] = g("er_visit")
        pool["hospital_stays"] = g("inpatient_medical") + g("inpatient_surgical")
        pool["births"] = g("inpatient_birth")
        pool["hospital_nights"] = g("n_nights")
        pool["lab_visits"] = g("n_lab")
        pool["basic_imaging"] = g("n_xray") + g("n_ultrasound") + g("n_mammogram")
        pool["advanced_imaging"] = g("n_mri_ct")
        self.pool = pool

    # ---------------- premiums and subsidy ----------------
    def county(self, zip_code):
        row = self.zipc.loc[zip_code]
        return row.county_fips, int(row.rating_area), row.county_name

    def plans_in_county(self, county_fips):
        sa = self.service[self.service.county_fips == county_fips][["issuer_id", "service_area_id"]]
        return self.plans.merge(sa.drop_duplicates(), on=["issuer_id", "service_area_id"])

    def household_premium(self, base_plan_id, rating_area, members):
        r = self.rates[(self.rates.base_plan_id == base_plan_id)
                       & (self.rates.rating_area == rating_area)]
        if r.empty:
            return np.nan
        by_age = r.set_index("age")
        kids = sorted([m for m in members if m.age < 21], key=lambda m: -m.age)
        billable = [m for m in members if m.age >= 21] + kids[:3]
        total = 0.0
        for m in billable:
            age = min(max(m.age, 14), 64)
            row = by_age.loc[age]
            total += row.premium_tobacco if (m.tobacco and pd.notna(row.premium_tobacco)) else row.premium
        return total

    def slcsp(self, county_fips, rating_area, members):
        plans = self.plans_in_county(county_fips)
        silver = plans[(plans.metal == "Silver") & (plans.variant == "base")]
        prems = sorted({round(self.household_premium(b, rating_area, members), 2)
                        for b in silver.base_plan_id.unique()} - {np.nan})
        return prems[1] if len(prems) > 1 else (prems[0] if prems else np.nan)

    def applicable_pct(self, fpl_pct):
        if fpl_pct < 100 or fpl_pct > 400:
            return None
        for lo, hi, ap_lo, ap_hi in AP_TABLE:
            if lo <= fpl_pct <= hi:
                frac = 0 if hi == lo else (fpl_pct - lo) / (hi - lo)
                return ap_lo + (ap_hi - ap_lo) * frac
        return None

    def aptc_monthly(self, hh, county_fips, rating_area):
        ap = self.applicable_pct(hh.fpl_pct)
        if ap is None:
            return 0.0
        bench = self.slcsp(county_fips, rating_area, hh.members)
        return max(0.0, bench - (hh.income * ap / 100) / 12)

    def csr_variant(self, fpl_pct):
        if fpl_pct <= 150:
            return "csr94"
        if fpl_pct <= 200:
            return "csr87"
        if fpl_pct <= 250:
            return "csr73"
        return "base"

    # ---------------- the care-year simulation ----------------
    def match_pool(self, member):
        p = self.pool
        d = p[p.age_band == self._band(member.age)]
        if member.sex in ("F", "M"):
            ds = d[d.sex == member.sex]
            if len(ds) >= 100:
                d = ds
        if member.profile == "healthy":
            dp = d[d.profile_healthy == 1]
        elif member.profile == "ongoing":
            dp = d[d.profile_ongoing == 1]
        else:
            dp = d
        return dp if len(dp) >= 100 else d

    @staticmethod
    def _band(age):
        for lo, hi, name in [(0, 1, "0-1"), (2, 12, "2-12"), (13, 17, "13-17"), (18, 25, "18-25"),
                             (26, 34, "26-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64")]:
            if lo <= age <= hi:
                return name
        return "55-64"

    def person_events(self, row):
        """Turn one MEPS person-year into a list of (rule_key, allowed_price, count)."""
        events = []
        for col, rule_key, price_mix in EVENT_MAP:
            n = float(row.get(col, 0) or 0)
            if n <= 0:
                continue
            price = sum(self.prices[k] * w for k, w in price_mix)
            events.append((rule_key, price, n))
        stays = float(row.get("hospital_stays", 0) or 0)
        if stays > 0:
            price = sum(self.prices[k] * w for k, w in STAY_MIX)
            nights = max(1.0, float(row.get("hospital_nights", 0) or 0) / stays)
            events.append(("inpatient_facility", price, stays, nights))
        births = float(row.get("births", 0) or 0)
        if births > 0:
            price = sum(self.prices[k] * w for k, w in BIRTH_MIX) + self.prices["prenatal_postnatal_bundle"]
            events.append(("maternity_delivery", price, births, 3.0))
        return events

    def simulate_family(self, plan_id, member_rows, plan):
        """One simulated year: member_rows is one sampled MEPS person per member."""
        rules = self.rules.get(plan_id, {})
        ded_p = plan.ded_person if pd.notna(plan.ded_person) else 0.0
        ded_f = plan.ded_family if pd.notna(plan.ded_family) else ded_p * 2
        moop_p = plan.moop_person if pd.notna(plan.moop_person) else 9200.0
        moop_f = plan.moop_family if pd.notna(plan.moop_family) else moop_p * len(member_rows)
        fam_ded_used = fam_oop = 0.0
        total_oop = 0.0

        for row in member_rows:
            ded_used = oop = 0.0
            for ev in self.person_events(row):
                rule_key, price, count = ev[0], ev[1], ev[2]
                nights = ev[3] if len(ev) > 3 else 1.0
                r = rules.get(rule_key)
                if r is None or not r.get("covered", True):
                    r = {"copay": 0.0, "coinsurance": 0.3, "after_deductible": True,
                         "no_charge": False, "copay_unit": "visit"}
                if rule_key == "preventive":
                    continue
                whole, frac = int(count), count - int(count)
                reps = [1.0] * whole + ([frac] if frac > 0.05 else [])
                for scale in reps:
                    if fam_oop >= moop_f or oop >= moop_p:
                        break
                    p = price * scale
                    pay = 0.0
                    if r["no_charge"] and not r["after_deductible"]:
                        pay = 0.0
                    elif r["after_deductible"]:
                        ded_room = max(0.0, min(ded_p - ded_used, ded_f - fam_ded_used))
                        ded_pay = min(p, ded_room)
                        after = p - ded_pay
                        ded_used += ded_pay
                        fam_ded_used += ded_pay
                        if after > 0:
                            if r["copay"] > 0:
                                per = r["copay"] * (nights if r["copay_unit"] == "day" else 1.0)
                                pay = ded_pay + min(per * scale, after)
                            elif r["coinsurance"] > 0:
                                pay = ded_pay + after * r["coinsurance"]
                            else:
                                pay = ded_pay
                        else:
                            pay = ded_pay
                    elif r["copay"] > 0:
                        per = r["copay"] * (nights if r["copay_unit"] == "day" else 1.0)
                        pay = min(per * scale, p)
                    elif r["coinsurance"] > 0:
                        pay = p * r["coinsurance"]
                    headroom = min(moop_p - oop, moop_f - fam_oop)
                    pay = max(0.0, min(pay, headroom))
                    oop += pay
                    fam_oop += pay
            total_oop += oop
        return total_oop

    # ---------------- rank the plans ----------------
    def rank(self, hh: Household, n_sims=300, seed=7):
        rng = np.random.default_rng(seed)
        county_fips, ra, county_name = self.county(hh.zip_code)
        plans = self.plans_in_county(county_fips)
        variant = self.csr_variant(hh.fpl_pct)
        aptc = self.aptc_monthly(hh, county_fips, ra)

        eligible = []
        for b, grp in plans.groupby("base_plan_id"):
            want = grp[grp.variant == variant] if (grp.metal == "Silver").any() else grp[grp.variant == "base"]
            pick = want.iloc[0] if len(want) else grp[grp.variant == "base"].iloc[0]
            if pick.metal == "Catastrophic" and any(m.age >= 30 for m in hh.members):
                continue
            eligible.append(pick)

        samples = []
        for m in hh.members:
            pool = self.match_pool(m)
            idx = rng.choice(pool.index, size=n_sims, replace=True,
                             p=(pool.weight / pool.weight.sum()).values)
            samples.append(pool.loc[idx].reset_index(drop=True))

        results = []
        for pick in eligible:
            prem = self.household_premium(pick.base_plan_id, ra, hh.members)
            if pd.isna(prem):
                continue
            net_prem_yr = max(0.0, prem - aptc) * 12
            oops = np.array([
                self.simulate_family(pick.plan_id,
                                     [samples[j].iloc[i] for j in range(len(hh.members))], pick)
                for i in range(n_sims)])
            moop_f = pick.moop_family if pd.notna(pick.moop_family) else (pick.moop_person * len(hh.members) if pd.notna(pick.moop_person) else 18400)
            results.append({
                "plan_id": pick.plan_id, "issuer": pick.issuer, "plan": pick.plan_name,
                "metal": pick.metal, "type": pick.plan_type, "variant": pick.variant,
                "premium_month": round(prem, 2), "net_premium_month": round(max(0, prem - aptc), 2),
                "ded_person": pick.ded_person, "moop_person": pick.moop_person,
                "typical_total": round(net_prem_yr + np.median(oops)),
                "bad_year_total": round(net_prem_yr + np.percentile(oops, 90)),
                "worst_total": round(net_prem_yr + moop_f),
                "median_oop": round(np.median(oops)),
            })
        out = pd.DataFrame(results).sort_values("typical_total").reset_index(drop=True)
        return {"county": county_name, "rating_area": ra, "fpl_pct": round(hh.fpl_pct, 1),
                "variant": variant, "aptc_month": round(aptc, 2), "plans": out}
