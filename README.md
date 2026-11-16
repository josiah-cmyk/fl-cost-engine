# Florida marketplace cost engine

Ranks every 2027 ACA marketplace plan in a Florida county by what a household would really pay in a year: premium after the tax credit, plus their share of care costs simulated from real utilization data.

Built for a consumer plan-comparison site. The Python here is the reference implementation; the site runs a JavaScript port of `engine/engine.py` in the browser, so nothing a user types leaves their device.

## How it works

1. **Plans.** The 2027 CMS Exchange public use files give every Florida individual-market plan: premiums by age and county, deductibles, out-of-pocket maximums, and the cost-sharing text for each service ("$40 copay", "30% coinsurance after deductible"). `scripts/01_build_plans.py` cleans them; `scripts/02_parse_benefits.py` turns the text into rules.
2. **Prices.** Each service gets a 2027 allowed amount: the Medicare rate for the Tampa area times a multiplier built from about 60 weighted sources (employer markup x marketplace discount x Florida factor). `scripts/03_build_prices.py`; the research is in the project spec.
3. **Subsidy.** Premium tax credit from the 2026 poverty guidelines and the Rev. Proc. 2026-26 applicable percentage table; cost-sharing reduction variants picked by income.
4. **Simulation.** Each household member is matched to real person-years from MEPS 2022-2024 (the sibling `meps-utilization` repo) by age, sex and health profile. Each plan is run against 200+ resampled years; the median is the typical year, the 90th percentile the bad year, and premiums plus the family out-of-pocket maximum the worst case.

## Run it

```
pip install -r requirements.txt
python scripts/00_download.py      # CMS PUFs, RVU/OPPS/ASC/IPPS/CLFS files, Census ZIP-county, NADAC
python scripts/01_build_plans.py
python scripts/02_parse_benefits.py
python scripts/03_build_prices.py
python - <<'PY'
import sys; sys.path.insert(0, 'engine')
from engine import Engine, Household, Member
e = Engine()
hh = Household(zip_code='34655', income=78000,
               members=[Member(42,'M','typical'), Member(40,'F','healthy'), Member(9,'F','healthy')])
print(e.rank(hh)['plans'].head(10))
PY
```

Needs `../meps-utilization/data/processed/persons.parquet` (build it from that repo).

## Checks that pass

Premium arithmetic against the rate file; the three-oldest-children billing rule; CSR variant and credit at 124% FPL ($0 deductible silver, larger credit); no credit above 400% or below 100% FPL (Florida has not expanded Medicaid); copay math exact; out-of-pocket maximums never exceeded; results for a Pasco family of three land in sensible ranges (bronze ~$3,300 typical year, ~$9,400 bad year, ~$20,600 worst case).

## Known simplifications

- One price per service for the whole state side of the multiplier; Medicare's geography handles local wage differences.
- In-network tier 1 cost sharing only; no out-of-network.
- Drug prices are category averages until the NADAC name lookup is wired in.
- The Florida hospital factor (1.21) comes from employer-plan studies; spot-check against insurer price files before launch.

## Data sources

All public: CMS Exchange PUFs (PY2027), CMS PFS/OPPS/ASC/IPPS/CLFS 2027 payment files, FY2027 wage index, HHS 2026 poverty guidelines, IRS Rev. Proc. 2026-26, Census ZCTA-county relationships, Medicaid NADAC, AHRQ MEPS.
