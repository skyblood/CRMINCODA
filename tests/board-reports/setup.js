// Setup for the /api/v1/* board-reporting endpoints (Junta Directiva de IA).
// Mirrors tests/ledger/setup.js — separate DB lifecycle so this suite's
// fixtures don't collide with other suites.
import mongoose from 'mongoose';
import crypto from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ApiKey from '../../server/models/ApiKey.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import Payment from '../../server/models/Payment.js';
import Invoice from '../../server/models/Invoice.js';
import Goal from '../../server/models/Goal.js';
import Commission from '../../server/models/Commission.js';
import Lead from '../../server/models/Lead.js';

let mongoServer;

export async function setupTestDB() {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
}

export async function teardownTestDB() {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}

export async function clearBoardCollections() {
    await Promise.all([
        ApiKey.deleteMany({}),
        LedgerAccount.deleteMany({}),
        JournalEntry.deleteMany({}),
        Payment.deleteMany({}),
        Invoice.deleteMany({}),
        Goal.deleteMany({}),
        Commission.deleteMany({}),
        Lead.deleteMany({}),
    ]);
}

/** Creates an active ApiKey with the given scopes; returns the raw (unhashed) key. */
export async function seedApiKey(scopes) {
    const rawKey = `crm_bm_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    await ApiKey.create({
        id: crypto.randomBytes(8).toString('hex'),
        name: 'test-key',
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        scopes,
        active: true,
    });
    return rawKey;
}
