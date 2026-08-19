/**
 * Migration: Add the leads:write scope to keys that already have leads
 *
 * Run: node server/migrations/005-add-leads-write-scope.js
 *
 * Idempotent: uses $addToSet, safe to run multiple times.
 *
 * POST /api/v1/leads now requires both `leads` and `leads:write` scopes
 * (previously `leads` alone gated both read and write — no separation
 * between the two). This backfills `leads:write` onto every active key
 * that already has `leads`, so existing integrations (e.g. the
 * crear_oportunidad MCP tool) keep working without a manual key edit.
 * Keys created after this migration default to `leads` (read-only for
 * leads) and must be granted `leads:write` explicitly if they need to
 * create opportunities.
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

async function migrate() {
    await mongoose.connect(MONGO_URI);

    const result = await ApiKey.updateMany(
        { active: true, scopes: 'leads' },
        { $addToSet: { scopes: 'leads:write' } }
    );

    console.log(`Matched ${result.matchedCount} active API key(s) with 'leads' scope, modified ${result.modifiedCount}.`);

    await mongoose.disconnect();
    console.log('Done.');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
