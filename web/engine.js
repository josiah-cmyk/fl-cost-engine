/* Florida marketplace cost engine - browser port of engine/engine.py.
   No dependencies. Load the data files, then:

     const eng = new Engine(data);
     const res = eng.rank({ zip: "34655", income: 78000,
       members: [{age:42, sex:"M", profile:"typical"},
                 {age:40, sex:"F", profile:"healthy"},
                 {age:9,  sex:"F", profile:"healthy"}] });

   data = { plans, rules, prices, zipCounty, countyPlans, rates, pool }
   where rates is the shard for the household's rating area. */

const FPL_BASE = 15960, FPL_PER_PERSON = 5680;        // 2026 guidelines for 2027 coverage
const AP_TABLE = [[0, 133, 2.15, 2.15], [133, 150, 3.23, 4.30], [150, 200, 4.30, 6.78],
                  [200, 250, 6.78, 8.66], [250, 300, 8.66, 10.22], [300, 400, 10.22, 10.22]];
const BANDS = ["0-1", "2-12", "13-17", "18-25", "26-34", "35-44", "45-54", "55-64"];
const BAND_HI = [1, 12, 17, 25, 34, 44, 54, 64];

const EVENT_MAP = [
  ["preventive_visits", "preventive", [["primary_care_visit", 1]]],
  ["primary_care_visits", "primary_care", [["primary_care_visit", 1]]],
  ["specialist_visits", "specialist", [["specialist_visit", 1]]],
  ["mental_health_visits", "mental_health_outpatient", [["mental_health_visit", 1]]],
  ["therapy_visits", "rehab", [["therapy_visit", 1]]],
  ["other_office_visits", "other_practitioner", [["other_practitioner_visit", 1]]],
  ["prenatal_visits", "prenatal", [["specialist_visit", 1]]],
  ["hospital_outpatient_visits", "outpatient_facility", [["hospital_outpatient_visit", 1]]],
  ["outpatient_surgeries", "outpatient_facility",
   [["outpatient_surgery_hospital", 0.6], ["outpatient_surgery_asc", 0.4]]],
  ["er_visits", "er", [["er_visit", 1]]],
  ["lab_visits", "lab", [["lab_panel", 1]]],
  ["basic_imaging", "xray", [["xray", 1]]],
  ["advanced_imaging", "advanced_imaging",
   [["advanced_imaging_freestanding", 0.5], ["advanced_imaging_hospital", 0.5]]],
  ["generic_rx_30day", "rx_generic", [["rx_generic_fill", 1]]],
  ["brand_rx_30day", "rx_brand_preferred", [["rx_brand_fill", 1]]],
  ["specialty_rx_30day", "rx_specialty", [["rx_specialty_fill", 1]]],
];
const STAY_MIX = [["inpatient_medical_stay", 0.56], ["inpatient_surgical_stay", 0.44]];
const BIRTH_MIX = [["vaginal_delivery_stay", 0.67], ["cesarean_delivery_stay", 0.33]];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export class Engine {
  constructor(data) {
    this.plans = data.plans;
    this.rules = data.rules;
    this.prices = {};
    for (const [k, v] of Object.entries(data.prices)) this.prices[k] = v.allowed;
    this.zipCounty = data.zipCounty;
    this.countyPlans = data.countyPlans;
    this.rates = data.rates;           // shard for this rating area
    this.pool = this.indexPool(data.pool);
  }

  indexPool(pool) {
    const cols = pool.columns, rows = pool.rows;
    const idx = {}; cols.forEach((c, i) => (idx[c] = i));
    return { cols, rows, idx };
  }

  band(age) { for (let i = 0; i < BAND_HI.length; i++) if (age <= BAND_HI[i]) return i; return 7; }

  fplPct(hh) {
    const fpl = FPL_BASE + FPL_PER_PERSON * (hh.members.length - 1);
    return (100 * hh.income) / fpl;
  }

  applicablePct(fpl) {
    if (fpl < 100 || fpl > 400) return null;
    for (const [lo, hi, a, b] of AP_TABLE)
      if (fpl >= lo && fpl <= hi) return a + (b - a) * (hi === lo ? 0 : (fpl - lo) / (hi - lo));
    return null;
  }

  csrVariant(fpl) {
    if (fpl <= 150) return "csr94";
    if (fpl <= 200) return "csr87";
    if (fpl <= 250) return "csr73";
    return "base";
  }

  householdPremium(basePlanId, members) {
    const byAge = this.rates[basePlanId];
    if (!byAge) return null;
    const kids = members.filter((m) => m.age < 21).sort((x, y) => y.age - x.age);
    const billable = members.filter((m) => m.age >= 21).concat(kids.slice(0, 3));
    let total = 0;
    for (const m of billable) {
      const age = Math.min(Math.max(m.age, 14), 64);
      const row = byAge[age];
      if (!row) return null;
      total += m.tobacco && row[1] != null ? row[1] : row[0];
    }
    return total;
  }

  slcsp(countyFips, members) {
    const bases = this.countyPlans[countyFips] || [];
    const silver = new Set(
      this.plans.filter((p) => p.metal === "Silver" && p.variant === "base")
        .map((p) => p.base_plan_id));
    const prems = [...new Set(bases.filter((b) => silver.has(b))
      .map((b) => this.householdPremium(b, members))
      .filter((x) => x != null).map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
    return prems.length > 1 ? prems[1] : prems[0] ?? null;
  }

  aptcMonthly(hh, countyFips) {
    const ap = this.applicablePct(this.fplPct(hh));
    if (ap == null) return 0;
    const bench = this.slcsp(countyFips, hh.members);
    if (bench == null) return 0;
    return Math.max(0, bench - (hh.income * ap) / 100 / 12);
  }

  matchPool(member) {
    const { rows, idx } = this.pool;
    const bandI = this.band(member.age);
    const sexVal = member.sex === "F" ? 1 : member.sex === "M" ? 0 : null;
    let d = rows.filter((r) => r[idx.age_band] === bandI);
    if (sexVal != null) {
      const ds = d.filter((r) => r[idx.sex] === sexVal);
      if (ds.length >= 100) d = ds;
    }
    let dp = d;
    if (member.profile === "healthy") dp = d.filter((r) => r[idx.profile_healthy] === 1);
    else if (member.profile === "ongoing") dp = d.filter((r) => r[idx.profile_ongoing] === 1);
    return dp.length >= 100 ? dp : d;
  }

  sampler(rows, rng) {
    const { idx } = this.pool;
    const cum = new Float64Array(rows.length);
    let s = 0;
    for (let i = 0; i < rows.length; i++) { s += rows[i][idx.w]; cum[i] = s; }
    return () => {
      const u = rng() * s;
      let lo = 0, hi = rows.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
      return rows[lo];
    };
  }

  personEvents(row) {
    const { idx } = this.pool, get = (c) => (idx[c] != null ? row[idx[c]] || 0 : 0);
    const events = [];
    for (const [col, ruleKey, mix] of EVENT_MAP) {
      const n = get(col);
      if (n <= 0) continue;
      let price = 0;
      for (const [k, w] of mix) price += this.prices[k] * w;
      events.push([ruleKey, price, n, 1]);
    }
    const stays = get("hospital_stays");
    if (stays > 0) {
      let price = 0;
      for (const [k, w] of STAY_MIX) price += this.prices[k] * w;
      events.push(["inpatient_facility", price, stays, Math.max(1, get("hospital_nights") / stays)]);
    }
    const births = get("births");
    if (births > 0) {
      let price = this.prices["prenatal_postnatal_bundle"];
      for (const [k, w] of BIRTH_MIX) price += this.prices[k] * w;
      events.push(["maternity_delivery", price, births, 3]);
    }
    return events;
  }

  simulateFamily(planId, memberRows, plan, extraEvents) {
    const rules = this.rules[planId] || {};
    const dedP = plan.ded_person ?? 0, dedF = plan.ded_family ?? dedP * 2;
    const moopP = plan.moop_person ?? 9200;
    const moopF = plan.moop_family ?? moopP * memberRows.length;
    let famDed = 0, famOop = 0, total = 0;

    for (let mi = 0; mi < memberRows.length; mi++) {
      const row = memberRows[mi];
      let ded = 0, oop = 0;
      const events = this.personEvents(row).concat(extraEvents ? extraEvents[mi] || [] : []);
      for (const [ruleKey, price, count, nights] of events) {
        if (ruleKey === "preventive") continue;
        let r = rules[ruleKey];
        // [copay, coins, afterDed, noCharge, unitCode, covered]
        if (!r || !r[5]) r = [0, 0.3, 1, 0, 0, 1];
        const whole = Math.floor(count), frac = count - whole;
        const reps = Array(whole).fill(1);
        if (frac > 0.05) reps.push(frac);
        for (const scale of reps) {
          if (famOop >= moopF || oop >= moopP) break;
          const p = price * scale;
          let pay = 0;
          const [copay, coins, afterDed, noCharge, unitCode] = r;
          if (noCharge && !afterDed) pay = 0;
          else if (afterDed) {
            const room = Math.max(0, Math.min(dedP - ded, dedF - famDed));
            const dedPay = Math.min(p, room);
            const after = p - dedPay;
            ded += dedPay; famDed += dedPay;
            if (after > 0) {
              if (copay > 0) {
                const per = copay * (unitCode === 1 ? nights : 1);
                pay = dedPay + Math.min(per * scale, after);
              } else if (coins > 0) pay = dedPay + after * coins;
              else pay = dedPay;
            } else pay = dedPay;
          } else if (copay > 0) {
            const per = copay * (unitCode === 1 ? nights : 1);
            pay = Math.min(per * scale, p);
          } else if (coins > 0) pay = p * coins;
          pay = Math.max(0, Math.min(pay, Math.min(moopP - oop, moopF - famOop)));
          oop += pay; famOop += pay;
        }
      }
      total += oop;
    }
    return total;
  }

  rank(hh, nSims = 300, seed = 7) {
    const rng = mulberry32(seed);
    const [countyFips, ratingArea, countyName] = this.zipCounty[hh.zip];
    const fpl = this.fplPct(hh);
    const variant = this.csrVariant(fpl);
    const aptc = this.aptcMonthly(hh, countyFips);
    const bases = new Set(this.countyPlans[countyFips] || []);

    const byBase = new Map();
    for (const p of this.plans) {
      if (!bases.has(p.base_plan_id)) continue;
      if (!byBase.has(p.base_plan_id)) byBase.set(p.base_plan_id, []);
      byBase.get(p.base_plan_id).push(p);
    }
    const eligible = [];
    for (const grp of byBase.values()) {
      const isSilver = grp.some((p) => p.metal === "Silver");
      const want = grp.find((p) => p.variant === (isSilver ? variant : "base"))
        || grp.find((p) => p.variant === "base");
      if (!want) continue;
      if (want.metal === "Catastrophic" && hh.members.some((m) => m.age >= 30)) continue;
      eligible.push(want);
    }

    const samples = hh.members.map((m) => {
      if (m.custom) {
        const row = this.pool.cols.map((c) => m.custom[c] ?? 0);
        return Array.from({ length: nSims }, () => row);
      }
      const pool = this.matchPool(m), draw = this.sampler(pool, rng);
      return Array.from({ length: nSims }, draw);
    });

    const results = [];
    for (const pick of eligible) {
      const prem = this.householdPremium(pick.base_plan_id, hh.members);
      if (prem == null) continue;
      const netPremYr = Math.max(0, prem - aptc) * 12;
      const extras = hh.members.map((m) => (m.drugs || []).map((d) => [
        d.tier || "rx_brand_preferred", d.fill, d.perYear ?? 12, 1]));
      const oops = [];
      for (let i = 0; i < nSims; i++)
        oops.push(this.simulateFamily(pick.plan_id, samples.map((s) => s[i]), pick, extras));
      oops.sort((a, b) => a - b);
      const moopF = pick.moop_family ?? (pick.moop_person != null ? pick.moop_person * hh.members.length : 18400);
      results.push({
        plan_id: pick.plan_id, issuer: pick.issuer, plan: pick.plan_name,
        metal: pick.metal, type: pick.plan_type, variant: pick.variant,
        premium_month: Math.round(prem * 100) / 100,
        net_premium_month: Math.round(Math.max(0, prem - aptc) * 100) / 100,
        ded_person: pick.ded_person, moop_person: pick.moop_person,
        typical_total: Math.round(netPremYr + quantile(oops, 0.5)),
        bad_year_total: Math.round(netPremYr + quantile(oops, 0.9)),
        worst_total: Math.round(netPremYr + moopF),
        median_oop: Math.round(quantile(oops, 0.5)),
      });
    }
    results.sort((a, b) => a.typical_total - b.typical_total);
    return { county: countyName, rating_area: ratingArea, fpl_pct: Math.round(fpl * 10) / 10,
             variant, aptc_month: Math.round(aptc * 100) / 100, plans: results };
  }
}
