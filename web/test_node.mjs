// Compare the JS engine with the Python reference. Run: node web/test_node.mjs
import { readFileSync } from "node:fs";
import { Engine } from "./engine.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = {
  plans: load("data/plans.json"),
  rules: load("data/rules.json"),
  prices: load("data/prices.json"),
  zipCounty: load("data/zip_county.json"),
  countyPlans: load("data/county_plans.json"),
  rates: load("data/rates/ra_51.json"),
  pool: load("data/pool.json"),
};
const ref = load("reference.json");

const eng = new Engine(data);
const hh = { zip: "34655", income: 78000, members: [
  { age: 42, sex: "M", profile: "typical" },
  { age: 40, sex: "F", profile: "healthy" },
  { age: 9, sex: "F", profile: "healthy" }] };

let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "ok " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
};

const t0 = Date.now();
const res = eng.rank(hh, 300, 7);
console.log(`ranked ${res.plans.length} plans in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

check("plan count", res.plans.length === ref.n_plans, `${res.plans.length} vs ${ref.n_plans}`);
check("aptc exact", Math.abs(res.aptc_month - ref.aptc) < 0.01, `${res.aptc_month} vs ${ref.aptc}`);
check("fpl", Math.abs(res.fpl_pct - ref.fpl) < 0.1);
check("variant", res.variant === ref.variant);

// Premiums must match the reference to the cent
let premBad = 0;
const prem = Object.fromEntries(res.plans.map((p) => [p.plan_id, p.premium_month]));
for (const [pid, v] of Object.entries(ref.premiums))
  if (prem[pid] == null || Math.abs(prem[pid] - v) > 0.01) premBad++;
check("premiums exact (50 plans)", premBad === 0, `${premBad} mismatched`);

// Typical totals: simulation uses a different RNG, so allow sampling noise
let worst = 0, worstPid = "";
const typ = Object.fromEntries(res.plans.map((p) => [p.plan_id, p.typical_total]));
for (const [pid, v] of Object.entries(ref.typical_by_plan)) {
  const d = Math.abs((typ[pid] ?? 1e9) - v) / Math.max(v, 1000);
  if (d > worst) { worst = d; worstPid = pid; }
}
check("typical totals within 6% of Python", worst < 0.06,
  `worst ${(worst * 100).toFixed(1)}% at ${worstPid}`);

// Top-10 overlap
const jsTop = new Set(res.plans.slice(0, 10).map((p) => p.plan_id));
const overlap = ref.top10.filter((p) => jsTop.has(p.plan_id)).length;
check("top-10 overlap >= 8", overlap >= 8, `${overlap}/10`);

// Hand cases ported from the Python checks
const silverCopay = res.plans.find((p) => p.plan_id === "24J01070160004-01");
const planObj = data.plans.find((p) => p.plan_id && p.metal === "Silver" &&
  data.rules[p.plan_id]?.specialist?.[0] > 0 && !data.rules[p.plan_id].specialist[2]);
const rowZero = Object.fromEntries(data.pool.columns.map((c) => [c, 0]));
const mkRow = (o) => data.pool.columns.map((c) => (o[c] ?? 0));
const two = eng.simulateFamily(planObj.plan_id, [mkRow({ specialist_visits: 2 })], planObj);
check("2 specialist visits = 2 copays",
  Math.abs(two - 2 * data.rules[planObj.plan_id].specialist[0]) < 0.01,
  `${two} vs ${2 * data.rules[planObj.plan_id].specialist[0]}`);

const big = eng.simulateFamily(planObj.plan_id,
  [mkRow({ hospital_stays: 3, hospital_nights: 15, er_visits: 4, specialty_rx_30day: 12 })], planObj);
check("big year capped at person MOOP", big <= (planObj.moop_person ?? 1e9) + 0.01,
  `${big} vs ${planObj.moop_person}`);

console.log(fail === 0 ? "ALL CHECKS PASS" : `${fail} CHECKS FAILED`);
process.exit(fail === 0 ? 0 : 1);
