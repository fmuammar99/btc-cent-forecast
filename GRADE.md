# btc-cent-forecast-01 — entry grade summary

Entry: `~/workspace/makefun/btc/main.ts` (+ `LICENSE`). Node 22, stdlib only,
deterministic, no network. **Not submitted yet** — repo creation + submit are
left to the parent. Deadline 2026-11-15T08:00:00Z (15:00 WIB).

## Approach

Damped mean reversion in log space (conditional-median forecast, since MAE
is a proper scoring rule for the median):

```
pred = last * exp( clamp( -0.12 * r240 - 0.25 * r60, -0.01, +0.01 ) )
r240 = log(last / price 240 min ago),  r60 = log(last / price 60 min ago)
```

No drift/intercept term (the practice window's −0.15% mean 4h drift is a
one-week property, not a prior for the final window). Price rounded to
5 decimals, clamped to (0, 10,000,000).

Why: 4h log returns are negatively autocorrelated on the practice data
(lag-1 corr ≈ −0.37 over non-overlapping 240-min returns; corr(r60,
next-240-min return) ≈ −0.52) — large recent moves partly revert over the
next 4h, consistent with this being a single Orca pool's quote where a
large trade moves the price transiently. Ridge fit on walk-forward points
gives ≈ (−0.16, −0.36); we use shrunken (−0.12, −0.25) with a ±1% cap
(the cap never binds on practice data; it only guards against a
pathological final case).

## Numbers (MAE in cents; lower is better)

Practice endpoints p00–p04 (answers recovered from the next case's last
price; p05's answer is not in the kit):

| case | my entry | starter (persistence) |
|------|----------|-----------------------|
| p00  | 32,992.89 | 31,711.14 |
| p01  | 84,755.86 | 76,696.79 |
| p02  | 71,881.04 | 47,033.39 |
| p03  | 59,424.22 | 56,684.98 |
| p04  | 14,448.56 | 23,147.01 |
| **mean** | **52,700.51** | **47,054.66** |

Walk-forward inside the 72h histories (checkpoints every 240 min, 66
points, 6 cases — the broader evidence base):

| | MAE (cents) |
|---|---|
| my entry | **37,912** |
| persistence | 40,950 |
| improvement | −7.4%, beats persistence in 5 of 6 cases |

## Honest caveat

The two evidence bases disagree. The 5 practice endpoints sit inside one
falling leg (10–11 Nov) where moves continued instead of reverting, so the
entry loses to persistence there (+12%). The 66 walk-forward points favour
the rule (−7.4%, 5/6 cases), but the paired saving is not statistically
significant (t ≈ 1.1; wins driven by the largest-move buckets: |r240| > 1%
went 11/11 in favour). The edge is real-but-modest and regime-dependent;
the final window (15–17 Nov) is a new regime. Shipping the mild reversion
is a positive-expected-value bet on the broader evidence, not a certain win.

## Validation

- Format: strict shape check in `dev/grade.mjs` — exactly
  `{"forecasts":[{"case":"<id>","price":<number>}]}`; one row per case;
  price finite, in (0, 10,000,000), on the 5-decimal grid. All 6 practice
  cases (incl. ungradeable p05) produce valid output.
- Determinism: two full runs over all 6 cases byte-identical.
- Runtime: ~176 ms/case (cap is 8 s/case).

## Commands run

```
# grade (per-case runs, one .in per run, like the grader)
node dev/grade.mjs main.ts
node dev/grade.mjs <kit>/starter/main.ts
# determinism (two full runs, diff)
MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=/tmp/btc-det1 node main.ts
MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=/tmp/btc-det2 node main.ts
diff -r /tmp/btc-det1 /tmp/btc-det2
```
(all with Node 22: `~/workspace/makefun/node22/node-v22.23.5-linux-x64/bin/node`)

## Files

- `main.ts`, `LICENSE` — the entry (repo-ready: main.ts + LICENSE only).
- `dev/grade.mjs` — grader (per-case runs, strict validation, timing).
- `dev/experiment.py`, `dev/analysis.py`, `dev/grid.py`, `dev/diag.py`,
  `dev/percase.py` — offline research scripts (not for submission).
