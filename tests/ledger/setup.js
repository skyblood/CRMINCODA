// Dedicated setup for the ledger feature — mirrors the shape of
// tests/financial-balance/setup.js (setupTestDB/teardownTestDB/clear*),
// but seeds ledger-specific fixtures instead of the CRM sales scenario,
// so the two test suites don't share (and don't fight over) fixture data.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import LedgerAccount from '../../server/models/LedgerAccount.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import LedgerPeriodClose from '../../server/models/LedgerPeriodClose.js';
import Transaction from '../../server/models/Transaction.js';
import Payment from '../../server/models/Payment.js';
import Commission from '../../server/models/Commission.js';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../server/seed/chartOfAccounts.js';

let mongoServer;

export async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // Ensure all registered models' indexes (including LedgerAccount's unique
  // index on `code`) are built before any test runs. Without this, Mongoose's
  // background autoIndex build can still be in flight when two racing
  // .create() calls hit a unique constraint, letting a duplicate slip through.
  await mongoose.connection.syncIndexes();
}

export async function teardownTestDB() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

export async function clearLedgerCollections() {
  await Promise.all([
    LedgerAccount.deleteMany({}),
    JournalEntry.deleteMany({}),
    LedgerPeriodClose.deleteMany({}),
    Transaction.deleteMany({}),
    Payment.deleteMany({}),
    Commission.deleteMany({}),
  ]);
}

/** Seeds the real default chart of accounts (same data server startup seeds). */
export async function seedChartOfAccounts() {
  await LedgerAccount.insertMany(DEFAULT_CHART_OF_ACCOUNTS);
}
