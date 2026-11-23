import { axBody } from "./axel.js";
/* ClearYear - the site. Loads the packed data, runs the engine in the
   browser, and walks the user through the guided flow. Nothing typed here leaves
   the page: there is no backend and no analytics on answers. */
import { Engine } from "./assets/engine.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app"), navEl = $("#nav"), progEl = $("#progress"), modeChip = $("#mode-chip");

/* ---------------- Axel the axolotl + motion setup ---------------- */
const G = typeof gsap !== "undefined" ? gsap : null;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!G) document.documentElement.classList.add("no-gsap");

const axolotl = (cls = "", w = 120) =>
  `<svg class="ax ${cls}" width="${w}" viewBox="0 0 220 190" fill="none" aria-hidden="true">${axBody()}</svg>`;

/* He peeks into the corner of a question screen. */
const guide = (pose = "ax-tilt", side = "right") =>
  side === "peek"
    ? `<div class="ax-guide peek" id="ax-here" aria-hidden="true"><div class="peek-box">
         <div class="peek-clip"><div class="peek-ax">${axolotl(pose, 108)}</div></div>
         <svg class="peek-water" viewBox="0 0 140 30"><path d="M4 12 Q22 6 40 12 T76 12 T112 12 T136 12 Q140 27 70 29 Q0 27 4 12Z" fill="#5BC9E2"/><path d="M16 15 Q30 11 44 15 M70 16 Q84 12 98 16" stroke="#DFF6FA" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
       </div></div>`
    : `<div class="ax-guide ${side === "left" ? "left" : ""}" id="ax-here" aria-hidden="true">${axolotl(pose, 108)}</div>`;

/* When he leaves a screen going forward, Axel hops and dives out of sight with a splash.
   He does it in a fixed overlay so the next screen can render right away. */
function diveOut() {
  const src = $("#ax-here .ax");
  if (!src || !G || RM) return;
  const r = src.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0) return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:30;pointer-events:none`;
  const fish = src.cloneNode(true);
  fish.style.cssText = "position:absolute;inset:0;width:100%";
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.innerHTML = `<svg viewBox="0 0 120 50" width="${r.width * 1.1}"><ellipse class="ring" cx="60" cy="38" rx="44" ry="9" stroke="#35C4DC" stroke-width="3" fill="none"/>
    <circle class="drop" cx="40" cy="30" r="4" fill="#7ED7EA"/><circle class="drop" cx="60" cy="24" r="5" fill="#A5E9FF"/><circle class="drop" cx="82" cy="30" r="4" fill="#7ED7EA"/></svg>`;
  layer.append(fish, splash);
  document.body.append(layer);
  const tl = G.timeline({ onComplete: () => layer.remove() });
  tl.to(fish, { y: -22, rotation: -10, duration: 0.2, ease: "power2.out" })
    .to(fish, { y: r.height * 0.9, rotation: 28, scale: 0.75, autoAlpha: 0, duration: 0.34, ease: "power2.in" })
    .fromTo(splash.querySelector(".ring"), { scale: 0.2, transformOrigin: "50% 50%", autoAlpha: 1 },
      { scale: 1.3, autoAlpha: 0, duration: 0.5, ease: "power2.out" }, "-=0.1")
    .fromTo(splash.querySelectorAll(".drop"), { y: 0, autoAlpha: 1 },
      { y: (i) => [-18, -26, -18][i], x: (i) => [-10, 0, 10][i], autoAlpha: 0, duration: 0.45, ease: "power2.out" }, "<");
}

const bubbles = (n = 5) => `<span class="bubbles" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
  const s = 6 + ((i * 7) % 12);
  return `<span style="left:${8 + (i * 83) % 86}%;width:${s}px;height:${s}px;animation-delay:${(i * 1.3) % 5}s;animation-duration:${5.5 + (i % 3)}s"></span>`;
}).join("")}</span>`;

const check = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const icoPin = `<svg class="ico-bob" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18Z" fill="#FF7E67" stroke="#E8604A" stroke-width="1.6"/><circle cx="10" cy="8.4" r="2.3" fill="#fff"/></svg>`;
const icoHeart = `<svg class="ico-bob" width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 17S2.5 12.2 2.5 7.3A3.9 3.9 0 0 1 10 5.6a3.9 3.9 0 0 1 7.5 1.7C17.5 12.2 10 17 10 17Z" fill="#FF7E67" stroke="#E8604A" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const icoLeaf = `<svg class="ico-bob" width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.5 3.5C9 4 4.5 8.5 4 16c7.5-.5 12-5 12.5-12.5Z" fill="#43A96C" stroke="#2E7D53" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 13.5C9 11 12 8 14.5 5.5" stroke="#2E7D53" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const icoSun = `<svg class="ico-bob" width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="4" fill="#FFD166" stroke="#E8A935" stroke-width="1.5"/><path d="M10 1.5v2.2M10 16.3v2.2M1.5 10h2.2M16.3 10h2.2M4 4l1.6 1.6M14.4 14.4 16 16M16 4l-1.6 1.6M5.6 14.4 4 16" stroke="#E8A935" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const icoCoin = `<svg class="ico-bob" width="26" height="26" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#FFD166" stroke="#E8A935" stroke-width="1.6"/><circle cx="10" cy="10" r="4.6" stroke="#E8A935" stroke-width="1.2" opacity="0.7"/><path d="M7.5 6.5 9 5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const icoShell = `<svg class="ico-bob" width="26" height="26" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3C5.5 3 2.5 7 3 12l2.4 4h9.2L17 12c.5-5-2.5-9-7-9Z" fill="#FFB4A3" stroke="#E8604A" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 4v12M6.3 5.5 7.8 16M13.7 5.5 12.2 16" stroke="#E8604A" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const icoSparkle = `<svg class="ico-twinkle" width="26" height="26" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5Z" fill="#7ED7EA" stroke="#1793AC" stroke-width="1.3" stroke-linejoin="round"/><circle cx="15.5" cy="15" r="1.6" fill="#FFD166"/></svg>`;

/* One choreographed entrance per screen: content rises, Axel swims in. */
function animateIn() {
  if (!G || RM) return;
  const root = app.firstElementChild;
  if (!root) return;
  const dir = state.dir >= 0 ? 1 : -1;
  const kids = [...root.children].filter((el) => el.id !== "ax-here");
  G.fromTo(kids, { opacity: 0, x: 26 * dir },
    { opacity: 1, x: 0, duration: 0.45, ease: "power3.out",
      stagger: (i) => Math.min(i, 5) * 0.06, clearProps: "transform" });
  const ax = $("#ax-here");
  if (!ax) return;
  // After a dive he resurfaces a beat later on the new screen.
  const wait = dir > 0 ? 0.32 : 0.12;
  if (ax.classList.contains("peek")) {
    // Peeks up out of the water, then the tilt loop takes over.
    G.fromTo(ax.querySelector(".peek-ax"), { y: 70 }, { y: 0, duration: 0.8, ease: "back.out(1.6)", delay: wait + 0.1, clearProps: "transform" });
  } else {
    G.fromTo(ax, { opacity: 0, x: 70 * dir, y: 14, rotation: 8 * dir },
      { opacity: 1, x: 0, y: 0, rotation: 0, duration: 0.7, ease: "back.out(1.4)", delay: wait, clearProps: "transform,opacity" });
  }
}

/* Results arrival: he pops up out of his pond with a splash. Plays once per run. */
function pondArrive() {
  if (!G || RM || state.pondShown) return;
  state.pondShown = true;
  const ax = $(".pond-ax"), ring = $(".pond-ring");
  if (!ax) return;
  const tl = G.timeline({ delay: 0.25 });
  tl.fromTo(ax, { y: 90 }, { y: 0, duration: 0.9, ease: "back.out(1.7)" })
    .call(() => ax.querySelector(".ax").classList.add("ax-tada"), null, 0.55)
    .fromTo(ring, { scale: 0.3, autoAlpha: 1, transformOrigin: "50% 50%" }, { scale: 1.4, autoAlpha: 0, duration: 0.7, ease: "power2.out" }, "<0.15")
    .fromTo(".pond h2, .pond .pond-note", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.08 }, "<0.2");
}

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
  const done = () => { render(); window.scrollTo({ top: 0, behavior: "instant" }); };
  const root = app.firstElementChild;
  if (G && !RM && root) {
    G.killTweensOf("#app, #app *");
    if (dir > 0) diveOut();
    G.to(root,{ opacity: 0, x: -22 * dir, duration: 0.16, ease: "power2.in", onComplete: done });
  } else done();
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
          <span class="gl-orbwrap" id="gl-orb"><span class="gl-rider">${axolotl("", 42)}</span></span>
        </div></div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $("#gl-clip").style.clipPath = `inset(-14px ${100 - pct}% -14px -14px round 999px)`;
      $("#gl-orb").style.transform = `translateX(-${100 - pct}%)`;
    }));
  } else progEl.innerHTML = "";
}

function nav(buttons) {
  navEl.innerHTML = buttons ? `<div class="sticky-nav wrap">${buttons}</div>` : "";
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
    <div id="hero" style="position:relative;height:210px;display:flex;align-items:center;justify-content:center">
      <span class="breathe" style="position:absolute;width:190px;height:190px;border-radius:999px;background:var(--lagoon-soft)"></span>
      ${bubbles(6)}
      <div id="ax-hero" style="position:relative">${axolotl("ax-wave", 190)}</div>
      <div id="ax-bubble" class="ax-say flip" style="position:absolute;left:calc(50% + 52px);right:6px;top:8px">
        Hi, I'm Axel! I'll walk you through it.</div>
    </div>
    <h1 class="q-title" style="text-align:center">Find the 2027 plan that really costs you the least</h1>
    <p class="q-sub" style="text-align:center;max-width:620px;margin:0 auto">The cheapest premium isn't always the cheapest plan. We add what your care would likely cost on each plan, then rank every plan sold in your county.</p>
    <ul class="pill-row" style="list-style:none;margin:0;padding:0;justify-content:center">
      <li class="assure">${icoSun} Free</li><li class="assure">${lock} Nothing you type is saved</li><li class="assure">${icoLeaf} No ads from insurers</li>
    </ul>
    <div class="stack" style="gap:12px;max-width:480px;width:100%;margin:0 auto">
      <button class="btn big" id="start-quick">Start quick estimate ${arrow}</button>
      <button class="btn ghost" id="start-detailed">Detailed estimate · adds conditions, visits and your prescriptions</button>
    </div>
    <p class="disclaimer">Estimates only, not a quote or advice. Plan data comes from the federal 2027 marketplace files. Enroll and get your official tax credit at <a href="https://www.healthcare.gov" rel="noopener">HealthCare.gov</a>. Not affiliated with HealthCare.gov or any insurer.</p>
  </div>`;
  $("#start-quick").onclick = () => { state.mode = "quick"; go("zip"); };
  $("#start-detailed").onclick = () => { state.mode = "detailed"; go("zip"); };
  nav("");
  if (G && !RM) {
    G.from("#ax-hero", { y: 60, opacity: 0, scale: 0.85, duration: 0.8, ease: "back.out(1.5)", clearProps: "transform,opacity" });
    G.from("#ax-bubble", { opacity: 0, scale: 0.6, duration: 0.45, ease: "back.out(2)",
      delay: 0.6, transformOrigin: "0% 90%", clearProps: "transform,opacity" });
  }
};

screens.zip = () => {
  const c = data.zipCounty[state.zip];
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    ${guide("ax-tilt")}
    <span class="assure">${lock} Only used to find your county</span>
    <h1 class="q-title">Where do you live? ${icoPin}</h1>
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
    const g = $("#ax-here .ax"); if (g) g.classList.toggle("ax-happy", !!cc);
  };
  nav(`${backBtn}<button class="btn big" id="btn-next" ${c ? "" : "disabled"}>Continue ${arrow}</button>`);
};
const lock = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.8"/></svg>`;
const zipOk = (c) => `<span class="assure reveal" role="status" style="font-size:16px;padding:8px 14px">
  ${check} ${c[2]}, Florida${c[3] ? " · crosses county lines, we use the main county" : ""}</span>`;

screens.household = () => {
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    ${guide("ax-wave", "left")}
    <span class="assure" style="align-self:flex-end">Takes about 20 seconds</span>
    <h1 class="q-title">Who needs coverage in 2027? ${icoShell}</h1>
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

/* Plain-language explanation of the premium help, in dollars for this household.
   Bands: under 100% of the poverty line = coverage gap, 100-250% = most help,
   250-400% = some help, over 400% = full price. */
const usd = (n) => "$" + Math.round(n).toLocaleString();
function helpCard(e, hh, income, fpl, aptc) {
  const line = (income * 100) / fpl;              // the poverty line, in dollars, for this household size
  const at = (pct) => (line * pct) / 100;
  const n = hh.members.length;
  const size = n === 1 ? "a household of one" : `a household of ${n}`;
  const kids = hh.members.some((m) => m.age < 19);
  const band = fpl < 100 ? "gap" : fpl <= 250 ? "most" : fpl <= 400 ? "some" : "full";

  // Help meter: four zones drawn at fixed widths so the labels always fit.
  const zones = [["gap", "Gap", 0, 100, 20], ["most", "Most help", 100, 250, 30],
                 ["some", "Some help", 250, 400, 30], ["full", "Full price", 400, 520, 20]];
  let x = 0, pos = 0;
  for (const [, , lo, hi, w] of zones) {
    if (fpl >= lo && (fpl < hi || hi === 520)) pos = x + w * Math.min(1, (fpl - lo) / (hi - lo));
    x += w;
  }
  const meter = `
    <div class="help-meter" aria-hidden="true">
      <div class="hm-bar">${zones.map(([k, , , , w]) => `<span class="hm-z hm-${k}${k === band ? " on" : ""}" style="width:${w}%"></span>`).join("")}
        <span class="hm-you" style="left:${Math.min(95, Math.max(5, pos))}%"><b>You</b></span></div>
      <div class="hm-labels">${zones.map(([k, lab, lo, , w]) => `<span style="width:${w}%" class="${k === band ? "on" : ""}">${lab}<small>${lo === 0 ? `under ${usd(at(100))}` : k === "full" ? `over ${usd(at(400))}` : `${usd(at(lo))}+`}</small></span>`).join("")}</div>
    </div>`;

  let head, body;
  if (band === "gap") {
    head = "You're in Florida's coverage gap";
    body = `
      <p>The marketplace discount starts at <b>${usd(at(100))} a year</b> for ${size}. The law assumed anyone earning less would get Medicaid instead. Florida never expanded Medicaid, so most adults below that amount get neither. That's a gap in the law, and nothing you did caused it.</p>
      <p class="hm-sub">Where to get help instead</p>
      <ul class="hm-list">
        ${kids ? `<li>Your kids can likely get free or low-cost coverage through <a href="https://www.floridakidcare.org" rel="noopener">Florida KidCare</a>.</li>` : ""}
        <li>Parents with very low incomes may qualify for Medicaid. Check at <a href="https://myaccess.myflfamilies.com" rel="noopener">ACCESS Florida</a>.</li>
        <li>Community health centers charge based on income, often $20 or less a visit. <a href="https://findahealthcenter.hrsa.gov" rel="noopener">Find one near you</a>.</li>
        <li>Nonprofit hospitals have to offer financial help with bills. Ask for their financial assistance form.</li>
        <li>Call 211 for local programs in your county.</li>
      </ul>
      <p>We'll still rank the plans below at full price in case you want to buy one.</p>`;
  } else if (band === "full") {
    head = "You'd pay full price";
    body = `
      <p>The discount stops at <b>${usd(at(400))} a year</b> for ${size}. Above that, there's no help in 2027, so you pay each plan's sticker price.</p>
      <p>It's a hard cutoff. If you're close, money you put into a pre-tax 401(k) or HSA lowers the income that counts and could bring you back under it.</p>
      <p>Plans still differ by thousands in what you'd really pay for the year. That's what we rank next.</p>`;
  } else {
    const ap = e.applicablePct(fpl);
    const bench = e.slcsp(state.county[0], hh.members);
    const share = (income * ap) / 100 / 12;
    head = band === "most" ? "You get the most help" : "You get help with your premium";
    body = `
      <p class="hm-eq"><span>A standard silver plan here costs about <b>${usd(bench)}</b> a month.</span>
        <span>At your income, you're expected to pay <b>${usd(share)}</b> of it.</span>
        <span>The government pays the other <b>${usd(aptc)}</b> straight to your insurer.</span></p>
      <p>That monthly discount is the tax credit. You don't need to owe any taxes to get it. It works on any plan, so cheaper plans can cost you very little or nothing.</p>
      ${band === "most"
        ? `<p>Because your income is under ${usd(at(250))}, silver plans also come with <b>lower deductibles and copays</b> for you. We call that extra silver savings.</p>`
        : `<p>Lower deductibles on silver plans stop at ${usd(at(250))}, so that extra piece doesn't apply to you.</p>`}`;
  }

  return `
    <div class="card reveal help-card" role="status">
      <span class="hm-kicker">Your help paying for a plan</span>
      <h2 class="hm-head">${head}</h2>
      <div class="hm-amt${aptc > 0 ? "" : " zero"}">${usd(aptc)}<span> a month off your premium${aptc > 0 ? `, about ${usd(aptc * 12)} for the year` : ""}</span></div>
      ${meter}
      <div class="hm-body">${body}</div>
    </div>`;
}

screens.income = () => {
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    ${guide("ax-tilt", "peek")}
    <span class="assure">${lock} Never saved or shared</span>
    <h1 class="q-title" style="padding-right:96px">What do you expect your household to earn in 2027? ${icoCoin}</h1>
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
    $("#credit").innerHTML = helpCard(e, hh, v, fpl, aptc);
    const g = $("#ax-here .ax"); if (g) { g.classList.toggle("ax-happy", aptc > 0); g.classList.toggle("ax-joy", aptc >= 150); }
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
     `About ${Math.round(tOngoing.primary_care_visits + tOngoing.specialist_visits + tOngoing.preventive_visits + tOngoing.mental_health_visits)} visits and ${Math.round(tOngoing.generic_rx_30day + tOngoing.brand_rx_30day + tOngoing.specialty_rx_30day)} prescription fills`],
  ];
  app.innerHTML = `
  <div class="narrow stack ${enter()}">
    ${guide("ax-tilt")}
    <span class="assure">${icoHeart} No right or wrong answer</span>
    <h1 class="q-title">How healthy ${i === 0 ? "are you" : `is ${label(i)}`} in a typical year?</h1>
    <div class="pill-row" role="group" aria-label="Choose a person">
      ${state.members.map((mm, k) => `<button class="pill ${k === i ? "on" : ""}" data-person="${k}" style="${k === i ? "background:var(--ink);color:#fff;border-color:var(--ink)" : ""}">${label(k)} · ${mm.age}</button>`).join("")}</div>
    <div class="stack" role="radiogroup" aria-label="Health" style="gap:10px">
      ${opts.map(([v, title, sub, stat]) => `
        <button class="choice ${m.profile === v ? "on" : ""}" data-prof="${v}" role="radio" aria-checked="${m.profile === v}">
          <span><span class="t">${title}</span><span class="s">${sub}</span>
            <span class="s" style="margin-top:6px;border-top:1px solid var(--line-soft);padding-top:6px;color:#2E3A38">${stat}</span></span>
          ${m.profile === v ? `<span class="check-pop">${check}</span>` : ""}</button>`).join("")}
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
    ${guide("ax-wave", "peek")}
    <h1 class="q-title" style="padding-right:96px">What care ${i === 0 ? "do you" : `does ${label(i)}`} expect in 2027?</h1>
    <p class="q-sub">We've filled in what's typical. Change anything you know will be different.</p>
    <div class="pill-row">${state.members.map((mm, k) => `<button class="pill ${k === i ? "on" : ""}" data-person="${k}" style="${k === i ? "background:var(--ink);color:#fff;border-color:var(--ink)" : ""}">${label(k)} · ${mm.age}</button>`).join("")}</div>
    <section class="card stack" style="gap:12px">
      <h2 style="margin:0;font-size:18px">Ongoing conditions</h2>
      <div class="pill-row">${CONDS.map(([k, name]) => `
        <label class="pill ${m.conditions.includes(k) ? "on" : ""}"><input type="checkbox" data-cond="${k}" ${m.conditions.includes(k) ? "checked" : ""}>${name}</label>`).join("")}</div>
      <p class="disclaimer" style="margin:0">Picking any condition switches this person's starting numbers to the ongoing-condition profile. List their prescriptions below for exact prescription costs.</p>
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
      <p class="disclaimer" style="margin:0">Prices come from the government's weekly pharmacy cost file, with a typical markup. Listing prescriptions replaces the typical fill counts for this person.</p>
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
    ${guide("ax-happy")}
    <span class="assure">${icoLeaf} You can change anything later</span>
    <h1 class="q-title">Ready to compare plans ${icoSparkle}</h1>
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
  app.innerHTML = `<div class="narrow stack" style="align-items:center;padding:40px 0">
    <div id="swim-strip" style="position:relative;width:100%;height:110px;overflow:hidden">
      ${bubbles(5)}
      <span id="swim-ax" style="position:absolute;left:0;top:10px;display:block">${axolotl("ax-puff", 96)}</span>
    </div>
    <div class="gl-track" style="width:min(420px,80%)"><div class="gl-clip" style="clip-path:inset(-14px 20% -14px -14px round 999px)">
      <span class="gl-glow"></span><div class="gl-fill"><span class="gl-shim"></span></div></div></div>
    <p style="color:var(--muted)" role="status">Axel is pricing every plan in ${state.county[2]} against ${state.members.length === 1 ? "your care" : "your household's care"}…</p></div>`;
  navEl.innerHTML = "";
  const strip = $("#swim-strip"), fish = $("#swim-ax");
  if (G && !RM && strip) {
    G.fromTo(fish, { x: -120 }, { x: strip.offsetWidth + 120, duration: 2.8, ease: "none", repeat: -1 });
    G.to(fish, { y: 14, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
  }
  const started = performance.now();
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
  state.pondShown = false;
  // Pricing takes well under a second. Hold the thinking moment long enough to see Axel at work.
  if (G && !RM) await new Promise((r) => setTimeout(r, Math.max(0, 1400 - (performance.now() - started))));
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
  if (p.ded_person === 0) return `No deductible: copays apply right away.`;
  return `A middle ground: copays for routine care, the deductible for bigger events.`;
}

function pondScene(planCount) {
  return `
  <section class="pond">
    <h2>You made it home!</h2>
    <p class="pond-note">Axel priced ${planCount} plans for your household. The ones below cost the least for your year.</p>
    <svg class="pond-scene" viewBox="0 0 600 200" fill="none" role="img" aria-label="Axel the axolotl relaxing in his pond">
      <circle cx="524" cy="34" r="20" fill="#FFD166" opacity="0.9"/>
      <g class="reed"><path d="M60 150 C58 110 62 86 56 62" stroke="#2E8B57" stroke-width="5" stroke-linecap="round"/><ellipse cx="55" cy="54" rx="7" ry="16" fill="#8A5A2B"/></g>
      <g class="reed b"><path d="M86 154 C86 122 90 104 86 84" stroke="#2E8B57" stroke-width="4.5" stroke-linecap="round"/><ellipse cx="86" cy="76" rx="6" ry="14" fill="#A2691F"/></g>
      <g class="reed"><path d="M545 158 C545 128 540 112 544 94" stroke="#2E8B57" stroke-width="4.5" stroke-linecap="round"/><ellipse cx="544" cy="86" rx="6" ry="14" fill="#8A5A2B"/></g>
      <path d="M0 128 Q75 116 150 126 T300 124 T450 126 T600 122 V200 H0 Z" fill="#7ED7EA"/>
      <g class="lily"><ellipse cx="140" cy="150" rx="30" ry="10" fill="#43A96C"/><path d="M140 150 L168 144 L166 154 Z" fill="#7ED7EA"/><circle cx="128" cy="140" r="6" fill="#FF9DB0"/><circle cx="128" cy="136" r="3.4" fill="#FFD1DB"/></g>
      <g class="lily b"><ellipse cx="470" cy="162" rx="36" ry="11" fill="#3B9A61"/><path d="M470 162 L500 156 L498 166 Z" fill="#5BC9E2"/></g>
      <ellipse class="pond-ring" cx="300" cy="150" rx="70" ry="12" stroke="#fff" stroke-width="3" fill="none" opacity="0"/>
      <g class="pond-ax"><svg class="ax ax-happy ax-joy${state.pondShown || RM || !G ? " ax-tada" : ""}" x="225" y="8" width="150" viewBox="0 0 220 190">${axBody()}</svg></g>
      <path d="M0 162 Q60 154 120 162 T240 160 T360 162 T480 159 T600 162 V200 H0 Z" fill="#5BC9E2"/>
      <path class="wave-line" d="M-80 176 Q-40 170 0 176 T80 176 T160 176 T240 176 T320 176 T400 176 T480 176 T560 176 T640 176 T720 176" stroke="rgba(255,255,255,0.55)" stroke-width="3" stroke-linecap="round"/>
    </svg>
  </section>`;
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
    ${pondScene(res.plans.length)}
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
  pondArrive();
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
        <div class="plan-meta">${p.metal} · ${p.type} · $${Math.round(p.ded_person ?? 0).toLocaleString()} deductible · $${Math.round(p.moop_person ?? 0).toLocaleString()} out-of-pocket limit</div></div>
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
function render() { renderChrome(); screens[state.screen](); animateIn(); }
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) go(g.dataset.go, -1);
});
loadCore().then(render).catch((err) => {
  app.innerHTML = `<div class="narrow card"><b>Couldn't load the plan data.</b>
    <p>Refresh to try again. (${err.message})</p></div>`;
});
