import ExchangeRateCache from '../models/ExchangeRateCache.js';

const FRANKFURTER_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get exchange rate for a currency pair.
 * Flow: MongoDB cache → frankfurter.app API → stale cache fallback
 *
 * @param {string} from - Source currency (e.g. 'COP')
 * @param {string} to - Target currency (e.g. 'USD')
 * @returns {{ rate: number, stale: boolean, source: string }}
 */
export async function getExchangeRate(from, to) {
  if (from === to) return { rate: 1, stale: false, source: 'identity' };

  const pair = `${from}_${to}`;

  // 1. Check MongoDB cache
  const cached = await ExchangeRateCache.findOne({ pair });
  if (cached && (Date.now() - cached.fetchedAt.getTime()) < CACHE_TTL_MS) {
    return { rate: cached.rate, stale: false, source: 'cache' };
  }

  // 2. Fetch from frankfurter.app
  try {
    const res = await fetch(
      `${FRANKFURTER_BASE}/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error(`frankfurter returned ${res.status}`);

    const data = await res.json();
    const rate = data.rates?.[to];
    if (!rate) throw new Error(`No rate found for ${to} in response`);

    // For "COP to USD", frankfurter returns how many USD per 1 COP.
    // We store exchangeRateToUSD as "how many COP per 1 USD" (the divisor).
    // So if from=COP, to=USD, rate=0.000238, we want 1/rate = 4201.68
    // But the caller decides the semantics. We return the raw rate.

    // Upsert cache
    await ExchangeRateCache.findOneAndUpdate(
      { pair },
      { $set: { rate, fetchedAt: new Date() } },
      { upsert: true }
    );

    return { rate, stale: false, source: 'api' };
  } catch (err) {
    // 3. Fall back to stale cache
    if (cached) {
      return { rate: cached.rate, stale: true, source: 'stale_cache' };
    }

    // No cache at all
    throw new Error(`Cannot get exchange rate ${pair}: ${err.message}`);
  }
}

/**
 * Convert an amount to USD.
 * Returns { amountUSD, exchangeRateToUSD, stale, source }
 *
 * exchangeRateToUSD follows the design doc convention:
 *   totalUSD = amount / exchangeRateToUSD
 *   For USD, rate = 1.
 *   For COP, rate = ~4200 (how many COP per 1 USD).
 */
export async function convertToUSD(amount, currency) {
  if (currency === 'USD') {
    return { amountUSD: amount, exchangeRateToUSD: 1, stale: false, source: 'identity' };
  }

  // Get rate: "1 USD = X <currency>"
  // frankfurter: from=USD, to=COP → rate=4200 means 1 USD = 4200 COP
  const { rate, stale, source } = await getExchangeRate('USD', currency);

  // rate = how many <currency> per 1 USD = exchangeRateToUSD
  const exchangeRateToUSD = rate;
  const amountUSD = amount / exchangeRateToUSD;

  return {
    amountUSD: Math.round(amountUSD * 100) / 100, // 2 decimal places
    exchangeRateToUSD,
    stale,
    source,
  };
}
