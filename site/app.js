/* Plan cost estimator - the site. Loads the packed data, runs the engine in the
   browser, and walks the user through the guided flow. Nothing typed here leaves
   the page: there is no backend and no analytics on answers. */
import { Engine } from "./assets/engine.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app"), navEl = $("#nav"), progEl = $("#progress"), modeChip = $("#mode-chip");

const state = {
  mode: "quick",            // quick | detailed
  screen: "welcome",
  dir: 1,
  zip: "", county: null,    // [fips, ra, name, multi]
  income: "",
  members: [blankMember(42)],
  careIdx: 0,               // which member the health/care screen shows
  scenario: "typical",
  results: null,
  shownTiers: 1,
};
let data = null, engine = null, ratesCache = {}, drugs = null, poolStats = {};

function blankMember(age = 30) {
  return { age, sex: "skip", profile: "typical", tobacco: false,
           conditions: [], drugs: [], custom: null, edits: {} };
}

/* ---------------- data loading ---------------- */
async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }

async function loadCore() {
  if (data) return;
  const [plans, rules, prices, zipCounty, countyPlans, pool] = await Promise.all([
    j("assets/data/plans.json"), j("assets/data/rules.json"), j("assets/data/prices.json"),
    j("assets/data/zip_county.json"), j("assets/data/county_plans.json"), j("assets/data/pool.json"),
  ]);
  data = { plans, rules, prices, zipCounty, countyPlans, pool, rates: {} };
}

async function engineFor(ra) {
  if (!ratesCache[ra]) ratesCache[ra] = await j(`assets/data/rates/ra_${ra}.json`);
  const d = { ...data, rates: ratesCache[ra] };
  engine = new Engine(d);
  return engine;
}

async function loadDrugs() { if (!drugs) drugs = (await j("assets/data/drug_lookup.json")).drugs; return drugs; }

/* Typical yearly numbers for "people like you", straight from the pool. */
function typicalFor(member) {
  const key = `${member.age}|${member.sex}|${member.profile}`;
  if (poolStats[key]) return poolStats[key];
  const e = engine || new Engine({ ...data, rates: {} });
  const rows = e.matchPool({ age: member.age, sex: member.sex, profile: member.profile });
  const { idx } = e.pool;
  const w = rows.reduce((s, r) => s + r[idx.w], 0);
  const avg = (c) => rows.reduce((s, r) => s + (r[idx[c]] || 0) * r[idx.w], 0) / w;
  const out = {
    preventive_visits: avg("preventive_visits"), primary_care_visits: avg("primary_care_visits"),
    specialist_visits: avg("specialist_visits"), mental_health_visits: avg("mental_health_visits"),
    therapy_visits: avg("therapy_visits"), er_visits: avg("er_visits"),
    lab_visits: avg("lab_visits"), basic_imaging: avg("basic_imaging"),
    advanced_imaging: avg("advanced_imaging"),
    generic_rx_30day: avg("generic_rx_30day"), brand_rx_30day: avg("brand_rx_30day"),
    specialty_rx_30day: avg("specialty_rx_30day"),
  };
  poolStats[key] = out;
  return out;
}

/* ---------------- flow definition ---------------- */
const QUICK = ["welcome", "zip", "household", "income", "health", "review", "results"];
const DETAILED = ["welcome", "zip", "household", "income", "health", "care", "review", "results"];
const flow = () => (state.mode === "detailed" ? DETAILED : QUICK);
const stepIndex = () => flow().indexOf(state.screen);
const BAR_STEPS = () => flow().length - 2;   // welcome and results sit outside the bar

const CHEERS = ["Let's begin", "Nice start", "Halfway there", "Almost there", "Last step", "Last step"];

function go(screen, dir = 1) {
  state.dir = dir;
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
const next = () => { const f = flow(), i = stepIndex(); if (i < f.length - 1) go(f[i + 1], 1); };
const back = () => { const f = flow(), i = stepIndex(); if (i > 0) go(f[i - 1], -1); };

/* ---------------- shared chrome ---------------- */
function renderChrome() {
  modeChip.innerHTML = state.screen === "welcome" ? "" :
    `<button class="chip ${state.mode === "detailed" ? "dark" : ""}" id="mode-toggle">
       ${state.mode === "detailed" ? "Detailed estimate" : "Quick estimate"} · switch</button>`;
  const tgl = $("#mode-toggle");
  if (tgl) tgl.onclick = () => { state.mode = state.mode === "quick" ? "detailed" : "quick"; render(); };

  const i = stepIndex(), n = BAR_STEPS();
  if (i >= 1 && i <= n) {
    const pct = ((i - 1) + 0.4) / n * 100;
    const names = { zip: "Where you live", household: "Who's covered", income: "Income",
                    health: "Health", care: "Care and prescriptions", review: "Review" };
    progEl.innerHTML = `
      <div class="gl-wrap"><div class="gl-inner wrap" role="progressbar" aria-valuemin="0"
           aria-valuemax="${n}" aria-valuenow="${i}" aria-valuetext="Step ${i} of ${n}">
        <div class="gl-meta"><span class="gl-step">Step ${i} of ${n} · ${names[state.screen]}</span>
          <span class="gl-cheer">${CHEERS[Math.min(i, n) - 0]}</span></div>
        <div class="gl-track">
          <div class="gl-clip" id="gl-clip"><span class="gl-glow"></span>
            <div class="gl-fill"><span class="gl-shim"></span></div></div>
          <span class="gl-orbwrap" id="gl-orb"><span class="gl-orb"></span></span>
        </div></div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $("#gl-clip").style.clipPath = `inset(-14px ${100 - pct}% -14px -14px round 999px)`;
      $("#gl-orb").style.transform = `translateX(-${100 - pct}%)`;
    }));
  } else progEl.innerHTML = "";
}

function nav(buttons) {
  navEl.innerHTML = `<div class="sticky-nav wrap">${buttons}</div>`;
  const b = $("#btn-back"); if (b) b.onclick = back;
  const f = $("#btn-next"); if (f) f.onclick = () => f.disabled || advance();
}
const backBtn = `<button class="btn ghost back" id="btn-back" aria-label="Back">
  <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M14 9H4M8 5L4 9l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
const arrow = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function advance() {
  if (state.screen === "zip") {
    const c = data.zipCounty[state.zip];
    if (!c) return;
    state.county = c;
  }
  if (state.screen === "review") { await runResults(); return; }
  next();
}

/* ---------------- screens ---------------- */
const screens = {};

screens.welcome = () => {
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <div style="position:relative;height:150px;display:flex;align-items:center;justify-content:center">
      <span class="breathe" style="position:absolute;width:150px;height:150px;border-radius:999px;background:var(--mint)"></span>
      <div class="float card" style="position:relative;width:250px;padding:14px 16px;box-shadow:0 10px 24px rgba(22,33,31,0.08)">
        <span style="font-size:12px;color:var(--muted)">Example plan, typical year</span>
        <span style="font-size:26px;font-weight:700;display:block">$9,800</span>
        <span aria-hidden="true" style="display:flex;height:8px;border-radius:4px;overflow:hidden"><span style="width:77%;background:var(--teal)"></span><span style="width:23%;background:#7FC3B7"></span></span>
        <span style="font-size:12px;color:#2E3A38">Premium after tax credit, plus your care</span>
      </div>
    </div>
    <h1 class="q-title">Find the 2027 plan that really costs you the least</h1>
    <p class="q-sub">The cheapest premium isn't always the cheapest plan. We add what your care would likely cost on each plan, then rank every plan sold in your county.</p>
    <ul class="pill-row" style="list-style:none;margin:0;padding:0">
      <li class="assure">Free</li><li class="assure">Nothing you type is saved</li><li class="assure">No ads from insurers</li>
    </ul>
    <div class="stack" style="gap:12px">
      <button class="btn big" id="start-quick">Start quick estimate ${arrow}</button>
      <button class="btn ghost" id="start-detailed">Detailed estimate · adds conditions, visits and your prescriptions</button>
    </div>
    <p class="disclaimer">Estimates only, not a quote or advice. Plan data comes from the federal 2027 marketplace files. Enroll and get your official tax credit at <a href="https://www.healthcare.gov" rel="noopener">HealthCare.gov</a>. Not affiliated with HealthCare.gov or any insurer.</p>
  </div>`;
  $("#start-quick").onclick = () => { state.mode = "quick"; go("zip"); };
  $("#start-detailed").onclick = () => { state.mode = "detailed"; go("zip"); };
  nav("");
};

screens.zip = () => {
  const c = data.zipCounty[state.zip];
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <span class="assure">${lock} Only used to find your county</span>
    <h1 class="q-title">Where do you live?</h1>
    <p class="q-sub">Plans and prices are set county by county.</p>
    <div class="field" style="max-width:280px"><label for="zip">ZIP code</label>
      <input id="zip" class="input-big" style="letter-spacing:0.08em" type="text" inputmode="numeric"
             autocomplete="postal-code" maxlength="5" value="${state.zip}"></div>
    <div id="zip-status">${c ? zipOk(c) : ""}</div>
    <details class="why"><summary>Why we ask</summary>
      <p style="color:#2E3A38;max-width:620px">Insurers choose which counties they sell in, and prices change from one county to the next. We only use your ZIP code to find your county. Nothing you type is saved or sent anywhere.</p></details>
  </div>`;
  const inp = $("#zip");
  inp.oninput = () => {
    state.zip = inp.value.trim();
    const cc = data.zipCounty[state.zip];
    state.county = cc || null;
    $("#zip-status").innerHTML = cc ? zipOk(cc)
      : (state.zip.length === 5 ? `<span class="warn-chip">That ZIP doesn't look like a Florida ZIP code</span>` : "");
    $("#btn-next").disabled = !cc;
  };
  nav(`${backBtn}<button class="btn big" id="btn-next" ${c ? "" : "disabled"}>Continue ${arrow}</button>`);
};
const lock = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.8"/></svg>`;
const zipOk = (c) => `<span class="assure reveal" role="status" style="font-size:16px;padding:8px 14px">
  ✓ ${c[2]}, Florida${c[3] ? " · crosses county lines, we use the main county" : ""}</span>`;

screens.household = () => {
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <span class="assure">Takes about 20 seconds</span>
    <h1 class="q-title">Who needs coverage in 2027?</h1>
    <p class="q-sub">Everyone on your tax return who will be on the plan.</p>
    <div id="members" class="stack" style="gap:12px"></div>
    <button class="btn ghost" id="add" style="border-style:dashed">+ Add a person</button>
    <p class="disclaimer">Sex only shapes the care estimate. It never changes your premium, and you can skip it.</p>
  </div>`;
  const wrap = $("#members");
  state.members.forEach((m, i) => {
    const el = document.createElement("fieldset");
    el.className = "card stack"; el.style.gap = "12px"; el.style.margin = "0";
    el.innerHTML = `
      <legend style="font-weight:700;padding:0 4px">${i === 0 ? "You" : "Person " + (i + 1)}</legend>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="age${i}" style="font-weight:600;font-size:14px">Age on Jan 1, 2027</label>
        <input id="age${i}" class="input" type="number" min="0" max="64" value="${m.age}" style="width:84px;text-align:center"></div>
      <div class="seg" role="radiogroup" aria-label="Sex">
        ${["M", "F", "skip"].map((v) => `<button data-sex="${v}" class="${m.sex === v ? "on" : ""}">${v === "M" ? "Male" : v === "F" ? "Female" : "Skip"}</button>`).join("")}</div>
      <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600">
        Uses tobacco <input type="checkbox" data-tob ${m.tobacco ? "checked" : ""} style="accent-color:var(--teal);width:20px;height:20px"></label>
      ${state.members.length > 1 ? `<button class="btn plain" data-del style="align-self:flex-start;font-size:14px;text-decoration:underline">Remove</button>` : ""}`;
    el.querySelector(`#age${i}`).onchange = (e) => { m.age = Math.max(0, Math.min(64, +e.target.value || 0)); };
    el.querySelectorAll("[data-sex]").forEach((b) => b.onclick = () => { m.sex = b.dataset.sex; screens.household(); });
    el.querySelector("[data-tob]").onchange = (e) => { m.tobacco = e.target.checked; };
    const del = el.querySelector("[data-del]");
    if (del) del.onclick = () => { state.members.splice(i, 1); screens.household(); };
    wrap.appendChild(el);
  });
  $("#add").onclick = () => { state.members.push(blankMember(10)); screens.household(); };
  nav(`${backBtn}<button class="btn big" id="btn-next">Continue ${arrow}</button>`);
};

screens.income = () => {
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <span class="assure">${lock} Never saved or shared</span>
    <h1 class="q-title">What do you expect your household to earn in 2027?</h1>
    <p class="q-sub">Your best guess is fine. Last year's tax return is a good start.</p>
    <div class="field" style="max-width:320px"><label for="inc">Household income before taxes</label>
      <div style="display:flex;align-items:center;gap:6px;border:2px solid var(--teal);border-radius:12px;background:var(--card);padding:0 16px">
        <span style="font-size:26px;font-weight:600;color:var(--muted)">$</span>
        <input id="inc" type="text" inputmode="numeric" value="${state.income ? Number(state.income).toLocaleString() : ""}"
               style="font-size:26px;font-weight:600;border:0;outline:none;width:100%;padding:12px 0;background:none"></div></div>
    <div id="credit"></div>
    <details class="why"><summary>What counts as income?</summary>
      <p style="color:#2E3A38;max-width:620px">Modified adjusted gross income: usually the adjusted gross income on your tax return, plus any untaxed Social Security, tax-exempt interest and foreign income. Include everyone on your tax return.</p></details>
  </div>`;
  const inp = $("#inc");
  const show = async () => {
    const v = Number(inp.value.replace(/[^0-9]/g, ""));
    state.income = v || "";
    $("#btn-next").disabled = !v;
    if (!v || !state.county) { $("#credit").innerHTML = ""; return; }
    const e = await engineFor(state.county[1]);
    const hh = { zip: state.zip, income: v, members: state.members };
    const fpl = e.fplPct(hh);
    const aptc = e.aptcMonthly(hh, state.county[0]);
    const csr = e.csrVariant(fpl);
    const csrNote = fpl < 100 ?
      `Below the poverty line, Florida has no tax credit and no expanded Medicaid. We'll still rank plans by full price, and your kids may qualify for low-cost KidCare.` :
      fpl > 400 ? `Above four times the poverty line there's no tax credit in 2027, so the full premium applies.` :
      csr !== "base" ? `You also qualify for extra help with deductibles and copays on silver plans.` :
      `Your income gets a tax credit but is above the cutoff for extra deductible help, which ends at 250% of the poverty level.`;
    $("#credit").innerHTML = `
      <div class="card reveal" role="status" style="background:var(--mint-soft);border-color:var(--mint-line)">
        <span style="font-size:14px;color:#2E3A38">Estimated tax credit</span>
        <div style="font-size:36px;font-weight:700;letter-spacing:-0.02em;color:var(--teal)">
          $${Math.round(aptc).toLocaleString()}<span style="font-size:16px;color:var(--muted);font-weight:500"> a month</span></div>
        <p style="margin:6px 0 0;font-size:15px;color:#2E3A38">${aptc > 0 ? `That's about $${Math.round(aptc * 12).toLocaleString()} off your premiums for the year. ` : ""}${csrNote}</p></div>`;
  };
  inp.oninput = () => { inp.value = inp.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","); show(); };
  show();
  nav(`${backBtn}<button class="btn big" id="btn-next" ${state.income ? "" : "disabled"}>Continue ${arrow}</button>`);
};

screens.health = () => {
  const i = Math.min(state.careIdx, state.members.length - 1);
  const m = state.members[i];
  const t = typicalFor(m);
  const visits = (t.primary_care_visits + t.specialist_visits + t.preventive_visits + t.mental_health_visits).toFixed(0);
  const fills = (t.generic_rx_30day + t.brand_rx_30day + t.specialty_rx_30day).toFixed(0);
  const tHealthy = typicalFor({ ...m, profile: "healthy" });
  const tOngoing = typicalFor({ ...m, profile: "ongoing" });
  const opts = [
    ["healthy", "Generally healthy", "Few visits, no ongoing conditions",
     `About ${Math.round(tHealthy.primary_care_visits + tHealthy.specialist_visits + tHealthy.preventive_visits + tHealthy.mental_health_visits)} visits a year`],
    ["typical", "Typical for their age", "Not sure? This is a safe choice",
     `About ${visits} visits and ${fills} prescription fills`],
    ["ongoing", "Ongoing condition", "Diabetes, blood pressure, asthma, depression or similar",
     `About ${Math.round(tOngoing.primary_care_visits + tOngoing.specialist_visits + tOngoing.preventive_visits + tOngoing.mental_health_visits)} visits and ${Math.round(tOngoing.generic_rx_30day + tOngoing.brand_rx_30day + tOngoing.specialty_rx_30day)} fills`],
  ];
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <span class="assure">No right or wrong answer</span>
    <h1 class="q-title">How healthy ${i === 0 ? "are you" : `is ${label(i)}`} in a typical year?</h1>
    <div class="pill-row" role="group" aria-label="Choose a person">
      ${state.members.map((mm, k) => `<button class="pill ${k === i ? "on" : ""}" data-person="${k}" style="${k === i ? "background:var(--ink);color:#fff;border-color:var(--ink)" : ""}">${label(k)} · ${mm.age}</button>`).join("")}</div>
    <div class="stack" role="radiogroup" aria-label="Health" style="gap:10px">
      ${opts.map(([v, title, sub, stat]) => `
        <button class="choice ${m.profile === v ? "on" : ""}" data-prof="${v}" role="radio" aria-checked="${m.profile === v}">
          <span><span class="t">${title}</span><span class="s">${sub}</span>
            <span class="s" style="margin-top:6px;border-top:1px solid var(--line-soft);padding-top:6px;color:#2E3A38">${stat}</span></span>
          ${m.profile === v ? `<span class="check-pop">✓</span>` : ""}</button>`).join("")}
    </div>
    <p class="disclaimer">Numbers are for privately insured people ${m.sex === "F" ? "(women)" : m.sex === "M" ? "(men)" : ""} ${bandLabel(m.age)}, from a national survey of about 24,000 people a year.</p>
    ${state.mode === "quick" ? `<div class="card" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;background:var(--bg)">
      <span style="font-size:15px;color:#2E3A38">Have conditions, regular visits or prescriptions to count exactly?</span>
      <button class="btn plain" id="to-detailed" style="color:var(--teal);font-weight:600">Switch to the detailed estimate</button></div>` : ""}
  </div>`;
  app.querySelectorAll("[data-person]").forEach((b) => b.onclick = () => { state.careIdx = +b.dataset.person; screens.health(); });
  app.querySelectorAll("[data-prof]").forEach((b) => b.onclick = () => { m.profile = b.dataset.prof; m.custom = null; screens.health(); });
  const td = $("#to-detailed"); if (td) td.onclick = () => { state.mode = "detailed"; render(); };
  const last = i === state.members.length - 1;
  nav(`${backBtn}<button class="btn big" id="btn-next">${last ? "Continue" : "Next: " + label(i + 1)} ${arrow}</button>`);
  $("#btn-next").onclick = () => {
    if (!last) { state.careIdx = i + 1; screens.health(); window.scrollTo(0, 0); }
    else { state.careIdx = 0; next(); }
  };
}
const label = (i) => (i === 0 ? "You" : "Person " + (i + 1));
const bandLabel = (age) => {
  const b = [[0, 1], [2, 12], [13, 17], [18, 25], [26, 34], [35, 44], [45, 54], [55, 64]].find(([lo, hi]) => age >= lo && age <= hi);
  return b ? `${b[0]} to ${b[1]}` : "";
};

const CONDS = [["hypertension", "High blood pressure"], ["high_cholesterol", "High cholesterol"],
  ["diabetes_no_insulin", "Diabetes, no insulin"], ["diabetes_insulin", "Diabetes, uses insulin"],
  ["asthma_copd", "Asthma or COPD"], ["heart_disease", "Heart disease"],
  ["depression_anxiety", "Depression or anxiety"], ["adhd", "ADHD"],
  ["arthritis_back", "Arthritis or back pain"], ["cancer_active", "Cancer in treatment"]];

screens.care = () => {
  const i = Math.min(state.careIdx, state.members.length - 1);
  const m = state.members[i];
  if (m.conditions.length && m.profile !== "ongoing") m.profile = "ongoing";
  const t = typicalFor(m);
  const fields = [
    ["preventive_visits", "Checkups and screenings", "Free on every plan"],
    ["primary_care_visits", "Primary care visits", ""],
    ["specialist_visits", "Specialist visits", ""],
    ["mental_health_visits", "Therapy or counseling sessions", ""],
    ["therapy_visits", "Physical therapy or chiropractor", ""],
  ];
  const val = (k) => (m.edits[k] ?? Math.round(t[k]));
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <h1 class="q-title">What care ${i === 0 ? "do you" : `does ${label(i)}`} expect in 2027?</h1>
    <p class="q-sub">We've filled in what's typical. Change anything you know will be different.</p>
    <div class="pill-row">${state.members.map((mm, k) => `<button class="pill ${k === i ? "on" : ""}" data-person="${k}" style="${k === i ? "background:var(--ink);color:#fff;border-color:var(--ink)" : ""}">${label(k)} · ${mm.age}</button>`).join("")}</div>
    <section class="card stack" style="gap:12px">
      <h2 style="margin:0;font-size:18px">Ongoing conditions</h2>
      <div class="pill-row">${CONDS.map(([k, name]) => `
        <label class="pill ${m.conditions.includes(k) ? "on" : ""}"><input type="checkbox" data-cond="${k}" ${m.conditions.includes(k) ? "checked" : ""}>${name}</label>`).join("")}</div>
      <p class="disclaimer" style="margin:0">Picking any condition switches this person's starting numbers to the ongoing-condition profile. List their prescriptions below for exact drug costs.</p>
    </section>
    <section class="card stack" style="gap:0">
      <h2 style="margin:0 0 6px;font-size:18px">Visits in a year</h2>
      ${fields.map(([k, name, note]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line-soft)">
          <div><b>${name}</b><div style="font-size:13px;color:var(--muted)">${note ? note + " · " : ""}typical: ${Math.round(t[k])}</div></div>
          <div class="stepper"><button data-dn="${k}" aria-label="Fewer">−</button>
            <output id="v-${k}" style="${m.edits[k] != null ? "color:var(--teal)" : ""}">${val(k)}</output>
            <button data-up="${k}" aria-label="More">+</button></div></div>`).join("")}
    </section>
    <section class="card stack" style="gap:12px">
      <h2 style="margin:0;font-size:18px">Prescriptions</h2>
      <div style="position:relative">
        <input id="drug-q" class="input" style="width:100%" type="search" placeholder="Start typing a drug name, like lisinopril or Ozempic" autocomplete="off">
        <div id="drug-hits" class="card" style="position:absolute;left:0;right:0;top:100%;z-index:5;padding:0;max-height:260px;overflow:auto;display:none"></div></div>
      <ul class="drug-list stack" style="list-style:none;margin:0;padding:0;gap:8px">
        ${m.drugs.map((d, k) => `<li><span><b>${d.name}</b> <span style="font-size:13px;color:var(--muted)">· about $${Math.round(d.fill).toLocaleString()} a fill · monthly</span></span>
          <button class="btn plain" data-deldrug="${k}" style="font-size:14px;text-decoration:underline">Remove</button></li>`).join("")}
      </ul>
      <p class="disclaimer" style="margin:0">Prices come from the government's weekly pharmacy cost file, with a typical markup. Listing drugs replaces the average prescription numbers above for this person.</p>
    </section>
  </div>`;
  app.querySelectorAll("[data-person]").forEach((b) => b.onclick = () => { state.careIdx = +b.dataset.person; screens.care(); });
  app.querySelectorAll("[data-cond]").forEach((c) => c.onchange = () => {
    const k = c.dataset.cond;
    m.conditions = c.checked ? [...m.conditions, k] : m.conditions.filter((x) => x !== k);
    screens.care();
  });
  const bump = (k, d) => { m.edits[k] = Math.max(0, val(k) + d); $(`#v-${k}`).textContent = m.edits[k]; $(`#v-${k}`).style.color = "var(--teal)"; };
  app.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => bump(b.dataset.up, 1));
  app.querySelectorAll("[data-dn]").forEach((b) => b.onclick = () => bump(b.dataset.dn, -1));
  app.querySelectorAll("[data-deldrug]").forEach((b) => b.onclick = () => { m.drugs.splice(+b.dataset.deldrug, 1); screens.care(); });

  const q = $("#drug-q"), hits = $("#drug-hits");
  q.oninput = async () => {
    const term = q.value.trim().toUpperCase();
    if (term.length < 3) { hits.style.display = "none"; return; }
    const list = (await loadDrugs()).filter((d) => d.name.includes(term)).slice(0, 12);
    hits.innerHTML = list.map((d, k) => `<button class="drug-hit" data-hit="${k}">
      <span>${d.name}</span><span style="color:var(--muted)">$${Math.round(d.fill).toLocaleString()}</span></button>`).join("") ||
      `<div style="padding:12px;color:var(--muted)">No match. Try another spelling, or pick the closest generic.</div>`;
    hits.style.display = "block";
    hits.querySelectorAll("[data-hit]").forEach((b) => b.onclick = () => {
      const d = list[+b.dataset.hit];
      m.drugs.push({ name: d.name, fill: d.fill, tier: d.tier_guess, perYear: 12 });
      q.value = ""; hits.style.display = "none"; screens.care();
    });
  };
  const last = i === state.members.length - 1;
  nav(`${backBtn}<button class="btn big" id="btn-next">${last ? "Continue" : "Next: " + label(i + 1)} ${arrow}</button>`);
  $("#btn-next").onclick = () => {
    if (!last) { state.careIdx = i + 1; screens.care(); window.scrollTo(0, 0); }
    else { state.careIdx = 0; next(); }
  };
};

screens.review = () => {
  const profiles = state.members.map((m, i) => `${label(i)}: ${
    m.profile === "healthy" ? "healthy" : m.profile === "typical" ? "typical" : "ongoing condition"}`).join(" · ");
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <span class="assure">You can change anything later</span>
    <h1 class="q-title">Ready to compare plans</h1>
    <div class="card" style="padding:0;overflow:hidden">
      ${[["Where you live", `${state.zip} · ${state.county[2]}`, "zip"],
         ["Who's covered", state.members.map((m) => m.age).join(", ") + (state.members.some((m) => m.tobacco) ? " · tobacco" : " · no tobacco"), "household"],
         ["Income", `$${Number(state.income).toLocaleString()}`, "income"],
         ["Health", profiles, "health"]].map(([t, v, s]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--line-soft)">
          <span><span style="display:block;font-size:13px;color:var(--muted)">${t}</span><b>${v}</b></span>
          <button class="btn plain" data-edit="${s}" style="color:var(--teal);font-weight:600">Edit</button></div>`).join("")}
    </div>
    <div class="card stack" style="gap:10px">
      <h2 style="margin:0;font-size:18px">What you'll see</h2>
      <p style="margin:0;font-size:15px;color:#2E3A38"><b>Typical year</b>: what half of households like yours would spend or less. Plans are ranked by this.
      <b>Bad year</b>: a rough year, about 1 in 10. <b>Worst case</b>: premiums plus the plan's out-of-pocket limit.</p>
    </div>
  </div>`;
  app.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => go(b.dataset.edit, -1));
  nav(`${backBtn}<button class="btn big" id="btn-next">Compare plans ${arrow}</button>`);
};

/* ---------------- results ---------------- */
async function runResults() {
  app.innerHTML = `<div class="narrow stack" style="align-items:center;padding:48px 0">
    <div class="gl-track" style="width:min(420px,80%)"><div class="gl-clip" style="clip-path:inset(-14px 20% -14px -14px round 999px)">
      <span class="gl-glow"></span><div class="gl-fill"><span class="gl-shim"></span></div></div></div>
    <p style="color:var(--muted)">Pricing every plan in ${state.county[2]} against ${state.members.length === 1 ? "your care" : "your household's care"}…</p></div>`;
  navEl.innerHTML = "";
  await new Promise((r) => setTimeout(r, 30));
  const e = await engineFor(state.county[1]);
  const members = state.members.map((m) => {
    const out = { age: m.age, sex: m.sex === "skip" ? null : m.sex, profile: m.profile, tobacco: m.tobacco };
    const edited = Object.keys(m.edits).length > 0 || m.drugs.length > 0;
    if (state.mode === "detailed" && edited) {
      const t = typicalFor(m);
      const row = {};
      for (const k of Object.keys(t)) row[k] = m.edits[k] ?? t[k];
      ["er_visits", "lab_visits", "basic_imaging", "advanced_imaging"].forEach((k) => { row[k] = t[k]; });
      if (m.drugs.length) { row.generic_rx_30day = 0; row.brand_rx_30day = 0; row.specialty_rx_30day = 0; }
      out.custom = row;
      out.drugs = m.drugs.map((d) => ({ tier: d.tier, fill: d.fill, perYear: d.perYear }));
    }
    return out;
  });
  const hh = { zip: state.zip, income: Number(state.income), members };
  state.results = e.rank(hh, 300, 7);
  state.scenario = "typical";
  state.shownTiers = 1;
  go("results");
}

function explain(p) {
  const r = data.rules[p.plan_id] || {};
  const pcp = r.primary_care, spec = r.specialist;
  if (p.metal.includes("Bronze") && p.ded_person >= 5000)
    return `Low premium, but you pay full price for most care until the $${Math.round(p.ded_person).toLocaleString()} deductible.`;
  if (pcp && pcp[0] > 0 && !pcp[2] && spec && spec[0] > 0 && !spec[2])
    return `Doctor visits are flat copays ($${pcp[0]} primary, $${spec[0]} specialist), so most care skips the deductible.`;
  if (pcp && pcp[3]) return `Primary care is free on this plan; the deductible applies mainly to bigger care.`;
  if (p.ded_person === 0) return `No deductible: cost sharing starts at copays right away.`;
  return `A middle ground: copays for routine care, the deductible for bigger events.`;
}

screens.results = () => {
  const res = state.results;
  const key = { typical: "typical_total", bad: "bad_year_total", worst: "worst_total" }[state.scenario];
  const plans = [...res.plans].sort((a, b) => a[key] - b[key]);
  const low = plans[0][key];
  const margin = Math.max(300, low * 0.05);
  const topTier = plans.filter((p) => p[key] - low <= margin);
  const rest = plans.filter((p) => p[key] - low > margin);
  const nextCut = rest.length ? `${rest.length} more plans, $${Math.round((rest[0][key] - low)).toLocaleString()} to $${Math.round((rest[rest.length - 1][key] - low)).toLocaleString()} above the leaders` : "";
  const maxShown = Math.max(...topTier.map((p) => p.worst_total), low * 1.6);
  const scenName = { typical: "typical year", bad: "bad year", worst: "worst case" }[state.scenario];

  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    <div class="card" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px">
      <span><b>${res.county} · ${state.members.length} ${state.members.length > 1 ? "people" : "person"}</b>
        <span style="font-size:13px;color:var(--muted);display:block">$${Number(state.income).toLocaleString()} income · tax credit $${Math.round(res.aptc_month).toLocaleString()}/mo${res.variant !== "base" ? " · extra silver savings applied" : ""}</span></span>
      <button class="btn ghost" id="edit-answers" style="min-height:44px;padding:8px 14px;font-size:14px">Edit answers</button></div>

    <div class="seg" role="group" aria-label="Scenario" style="max-width:440px">
      ${[["typical", "Typical year"], ["bad", "Bad year"], ["worst", "Worst case"]].map(([v, name]) =>
        `<button data-scen="${v}" class="${state.scenario === v ? "on" : ""}" aria-pressed="${state.scenario === v}">${name}</button>`).join("")}</div>

    <div><h2 style="margin:0;font-size:20px">Top tier: within $${Math.round(margin).toLocaleString()} of the lowest</h2>
      <p class="tier-note">Close enough to call a tie for a ${scenName}. Choose on your doctors and pharmacy.</p></div>

    <div class="stack" style="gap:12px">
      ${topTier.map((p, i) => planCard(p, i, low, key, maxShown)).join("")}
    </div>
    ${rest.length ? `<button class="btn ghost" id="more">${state.shownTiers > 1 ? "Showing all plans" : "Next tier: " + nextCut}</button>` : ""}
    ${state.shownTiers > 1 ? `<div class="stack" style="gap:12px">${rest.slice(0, 30).map((p, i) => planCard(p, topTier.length + i, low, key, maxShown)).join("")}</div>` : ""}

    <aside class="callout"><b>Before you enroll, call your doctors.</b>
      <p style="margin:4px 0 0;font-size:14px;color:#2E3A38">Ask if they take the exact plan name for 2027. Online directories are often out of date.</p></aside>
    <p class="disclaimer">Estimates, not a quote or advice. Care costs are simulated from how 24,000 privately insured Americans used care, priced at Florida marketplace rates; your year will differ. Premiums and the tax credit use the official 2027 files. Enroll at <a href="https://www.healthcare.gov" rel="noopener">HealthCare.gov</a> by December 15 for January 1 coverage.</p>
  </div>`;
  $("#edit-answers").onclick = () => go("review", -1);
  app.querySelectorAll("[data-scen]").forEach((b) => b.onclick = () => { state.scenario = b.dataset.scen; screens.results(); });
  const more = $("#more"); if (more) more.onclick = () => { state.shownTiers = 2; screens.results(); };
  app.querySelectorAll("[data-math]").forEach((b) => b.onclick = () => {
    const el = $(`#math-${b.dataset.math}`);
    const open = el.style.display !== "none";
    el.style.display = open ? "none" : "block";
    b.setAttribute("aria-expanded", String(!open));
  });
  nav("");
}

function planCard(p, i, low, key, maxShown) {
  const diff = p[key] - low;
  const typPct = Math.min(100, p[key] / maxShown * 100);
  const worstPct = Math.min(100, p.worst_total / maxShown * 100);
  return `
  <article class="plan-card ${i === 0 ? "winner" : ""}">
    ${i === 0 ? `<span class="badge">Lowest cost</span>` : `<span class="badge soft">+$${Math.round(diff).toLocaleString()}</span>`}
    <div class="plan-top">
      <div><h3 class="plan-name">${p.issuer}</h3>
        <div class="plan-meta">${p.plan}</div>
        <div class="plan-meta">${p.metal} · ${p.type} · $${Math.round(p.ded_person ?? 0).toLocaleString()} deductible · $${Math.round(p.moop_person ?? 0).toLocaleString()} out-of-pocket max</div></div>
      <div class="plan-price"><b>$${p[key].toLocaleString()}</b><span>for 2027</span></div></div>
    <div class="cost-bar" aria-hidden="true"><span class="worst" style="width:${worstPct}%"></span><span class="typ" style="width:${typPct}%"></span></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#2E3A38">
      <span>$${p.net_premium_month.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo after credit</span>
      <span>Worst case $${p.worst_total.toLocaleString()}</span></div>
    <p style="margin:0;font-size:14px">${explain(p)}</p>
    <div><button class="btn ghost" data-math="${i}" aria-expanded="false" style="min-height:44px;padding:8px 14px;font-size:14px">Show the math</button></div>
    <div class="math" id="math-${i}" style="display:none"><table>
      <tr><td>Premiums for the year</td><td>$${Math.round(p.premium_month * 12).toLocaleString()}</td></tr>
      <tr><td>Tax credit</td><td>−$${Math.round((p.premium_month - p.net_premium_month) * 12).toLocaleString()}</td></tr>
      <tr><td>Your share of care (${{ typical_total: "typical year", bad_year_total: "bad year", worst_total: "at the plan's limit" }[key]})</td>
        <td>$${(p[key] - Math.round(p.net_premium_month * 12)).toLocaleString()}</td></tr>
      <tr><td><b>Total</b></td><td><b>$${p[key].toLocaleString()}</b></td></tr></table>
      <p class="disclaimer" style="margin:8px 0 0">Simulated across 300 versions of your household's year. Half of simulated years cost this much or less in the typical view; the bad year is the 90th percentile.</p></div>
  </article>`;
}

/* ---------------- boot ---------------- */
const enter = () => (state.dir >= 0 ? "enter-fwd" : "enter-back");
function render() { renderChrome(); screens[state.screen](); }
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) go(g.dataset.go, -1);
});
loadCore().then(render).catch((err) => {
  app.innerHTML = `<div class="narrow card"><b>Couldn't load the plan data.</b>
    <p>Refresh to try again. (${err.message})</p></div>`;
});
