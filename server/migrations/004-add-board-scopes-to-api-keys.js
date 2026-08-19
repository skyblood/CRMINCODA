/**
 * Migration: Grant Junta Directiva de IA read scopes to existing API keys
 *
 * Run: node server/migrations/004-add-board-scopes-to-api-keys.js
 *
 * Idempotent: uses $addToSet, safe to run multiple times.
 *
 * Adds the 'financials', 'cash', 'goals', and 'commissions' scopes to every
 * active API key, so the /api/v1/financials/summary, /api/v1/cash/summary,
 * /api/v1/cash/mercury-status, /api/v1/goals, and /api/v1/commissions/summary
 * endpoints (added for the AI board-of-directors skill) are reachable by keys
 * that were created before those scopes existed.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import ApiKey from '../models/ApiKey.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_incoda';
const NEW_SCOPES = ['financials', 'cash', 'goals', 'commissions'];

async function migrate() {
    await mongoose.connect(MONGO_URI);

    const result = await ApiKey.updateMany(
        { active: true },
        { $addToSet: { scopes: { $each: NEW_SCOPES } } }
    );

    console.log(`Matched ${result.matchedCount} active API key(s), modified ${result.modifiedCount}.`);

    await mongoose.disconnect();
    console.log('Done.');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
