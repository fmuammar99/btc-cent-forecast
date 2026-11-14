// btc-cent-forecast-01 entry (Node 22, standard library only).
//
// Forecast: the conditional median of BTC's price 240 minutes after the
// checkpoint, from the 4,320 one-minute closes in the case.
//
// Approach — damped mean reversion of recent moves, in log space:
//   pred = last * exp( clamp( a * r240 + b * r60, -0.01, +0.01 ) )
// where r240 = log(last / price 240 min ago) and r60 = log(last / price
// 60 min ago). Coefficients a = -0.12, b = -0.25.
//
// Why: on the practice data, 4-hour log returns are negatively
// autocorrelated (lag-1 corr ≈ -0.37 over non-overlapping 240-min
// returns; corr(r60, next-240-min return) ≈ -0.52), i.e. large recent
// moves partly revert over the next 4 hours — consistent with this
// price being a single Orca pool's quote, where a large trade moves the
// pool price for a moment. A ridge fit on 66 walk-forward checkpoints
// inside the practice histories (checkpoints every 240 min, forecast
// +240 min, leave-one-case-out) gives coefficients ≈ (-0.16, -0.36);
// we use shrunken values (-0.12, -0.25) and cap the total adjustment
// at ±1.0% so no single case can move far from the last price (the cap
// never binds on the practice data, where the largest adjustment is
// ≈0.6%; it only guards against a pathological final case such as a
// flash crash).
// Walk-forward validation (66 points, 6 cases): MAE 37,912 cents vs
// 40,950 for persistence (-7.4%), beating persistence in 5 of 6 cases.
// Caveat, stated honestly: on the 5 gradeable practice endpoints the
// rule scores worse than persistence (52,701 vs 47,055 cents), because
// those 5 checkpoints sit inside one falling leg (10-11 Nov) where
// moves continued instead of reverting. The walk-forward evidence is
// much broader (66 points, 5/6 cases), so we take the mild reversion,
// but the edge is real-but-modest and regime-dependent.
//
// Absolute error is a proper scoring rule for the median, so the
// forecast is a conditional median estimate (no mean/median confusion:
// log returns here are near-symmetric, and the linear predictor targets
// the centre). No intercept/drift term: the practice window's -0.15%
// mean 4-hour drift is a property of that one week, not a prior for
// the final window.
//
// Output contract (as the starter): read every *.in in
// $MAKEFUN_INPUT_DIR (else /input), write /output/<id>.out (or
// $MAKEFUN_OUTPUT_DIR) as {"forecasts":[{"case":"<id>","price":<n>}]}.
// Deterministic: pure function of the input prices, no randomness,
// no clock, no network.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Mean-reversion weight on the last 240-minute log change. */
const A_R240 = -0.12;
/** Mean-reversion weight on the last 60-minute log change. */
const B_R60 = -0.25;
/** Cap on the total log adjustment, either way (±1.0%). */
const MAX_ADJ = 0.01;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** Forecast for one market: last close, adjusted by damped mean reversion. */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const p = m.prices;
  const last = p[p.length - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) {
    throw new Error(`market ${m.id}'s last price is not a finite positive number`);
  }
  let adj = 0;
  // Need at least 241 closes for a 240-minute change; otherwise persist.
  if (p.length > 240) {
    const p240 = p[p.length - 241] as number;
    const p60 = p[p.length - 61] as number;
    if (
      typeof p240 === 'number' && Number.isFinite(p240) && p240 > 0 &&
      typeof p60 === 'number' && Number.isFinite(p60) && p60 > 0
    ) {
      const r240 = Math.log(last / p240);
      const r60 = Math.log(last / p60);
      adj = A_R240 * r240 + B_R60 * r60;
      if (adj > MAX_ADJ) adj = MAX_ADJ;
      else if (adj < -MAX_ADJ) adj = -MAX_ADJ;
    }
  }
  return price5(last * Math.exp(adj));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
