/**
 * Migration: Fix Transaction schema fields
 *
 * Run: node server/migrations/003-fix-transaction-fields.js
 *
 * Idempotent: only updates documents missing dateObj or amountUSD.
 *
 * Changes:
 * 1. Populate dateObj (Date) from date (string "YYYY-MM-DD")
 * 2. Set currency='USD', amountUSD=amount, exchangeRateToUSD=1 for existing records
 * 3. Normalize unknown categories to 'other'
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Transaction from '../models/Transaction.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_incoda';

const VALID_CATEGORIES = [
  'credit_card', 'office', 'software', 'marketing',
  'salary', 'consultant_payment', 'other',
];

async function migrate() {
  await mongoose.connect(MONGO_URI);

  const transactions = await Transaction.find({}).lean();
  console.log(`Found ${transactions.length} transactions.\n`);

  let updatedDate = 0;
  let updatedCurrency = 0;
  let updatedCategory = 0;
  let errors = 0;

  for (const t of transactions) {
    const updates = {};

    // 1. Fix dateObj
    if (!t.dateObj && t.date) {
      const parsed = new Date(t.date);
      if (!isNaN(parsed.getTime())) {
        updates.dateObj = parsed;
        updatedDate++;
      }
    }

    // 2. Fix currency fields
    if (t.amountUSD === undefined || t.amountUSD === null) {
      updates.currency = t.currency || 'USD';
      updates.amountUSD = t.amount;
      updates.exchangeRateToUSD = 1;
      updatedCurrency++;
    }

    // 3. Normalize category
    if (t.category && !VALID_CATEGORIES.includes(t.category)) {
      console.log(`  [CATEGORY] "${t.category}" → "other" (tx: ${t.id || t._id})`);
      updates.category = 'other';
      updatedCategory++;
    }
    if (!t.category) {
      updates.category = 'other';
      updatedCategory++;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await Transaction.updateOne({ _id: t._id }, { $set: updates });
      } catch (err) {
        errors++;
        console.error(`  [ERR] ${t.id || t._id}: ${err.message}`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total transactions: ${transactions.length}`);
  console.log(`dateObj populated: ${updatedDate}`);
  console.log(`currency/amountUSD set: ${updatedCurrency}`);
  console.log(`category normalized: ${updatedCategory}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
