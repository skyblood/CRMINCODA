// server/utils/reconciliationScore.js
//
// Compound confidence score for suggesting a fuzzy match between a bank
// statement row (from the Mercury CSV import) and an un-reconciled ledger
// Cash-account line, when neither the exact date+amount match nor a total
// absence of correspondence applies. Used by mercuryReconciliation.js to
// populate a "suggested" review queue instead of dropping close-but-not-exact
// pairs straight into "missing"/"unmatched".

const AMOUNT_TIGHT_PCT = 0.01;   // within 1% → strong signal
const AMOUNT_LOOSE_PCT = 0.05;   // within 5% → weak signal
const DATE_TIGHT_DAYS = 3;
const DATE_LOOSE_DAYS = 7;
const MIN_TOKEN_LENGTH = 3;      // ignore short/common words like "the", "a", "for"

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'and', 'de', 'la', 'el', 'un', 'una']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/i)
    .filter(t => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

function daysBetween(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

/**
 * @param {{Date: string, Amount: string, Description?: string}} bankRow
 * @param {{date: Date, amount: number, memo?: string}} ledgerLine
 * @returns {{score: number, reasons: string[]}}
 */
export function computeMatchScore(bankRow, ledgerLine) {
  const reasons = [];
  let score = 0;

  // Amount
  const bankAmount = Number(bankRow.Amount);
  const ledgerAmount = ledgerLine.amount;
  const denom = Math.max(Math.abs(ledgerAmount), 0.01);
  const amountDiffPct = Math.abs(bankAmount - ledgerAmount) / denom;
  if (amountDiffPct <= AMOUNT_TIGHT_PCT) {
    score += 0.5;
    reasons.push('Monto casi exacto (≤1% de diferencia)');
  } else if (amountDiffPct <= AMOUNT_LOOSE_PCT) {
    score += 0.25;
    reasons.push('Monto similar (≤5% de diferencia)');
  }

  // Date
  const bankDate = new Date(bankRow.Date);
  const diffDays = daysBetween(bankDate, ledgerLine.date);
  if (diffDays <= DATE_TIGHT_DAYS) {
    score += 0.3;
    reasons.push('Fecha dentro de 3 días');
  } else if (diffDays <= DATE_LOOSE_DAYS) {
    score += 0.15;
    reasons.push('Fecha dentro de 7 días');
  }

  // Description / memo token overlap
  const bankTokens = new Set(tokenize(bankRow.Description));
  const ledgerTokens = tokenize(ledgerLine.memo);
  const hasOverlap = ledgerTokens.some(t => bankTokens.has(t));
  if (hasOverlap) {
    score += 0.2;
    reasons.push('Descripción con palabras en común');
  }

  return { score, reasons };
}
