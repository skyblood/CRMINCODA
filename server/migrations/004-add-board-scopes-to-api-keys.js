/**
 * Migration: Grant Junta Directiva de IA read scopes to a specific API key
 *
 * Run: node server/migrations/004-add-board-scopes-to-api-keys.js
 * Provide the raw API key via the API_KEY_TO_GRANT env var, or enter it at
 * the interactive prompt when asked. Never pass the key as a CLI argument —
 * visible via `ps aux` and shell history.
 *
 * Idempotent: uses $addToSet, safe to run multiple times.
 *
 * SCOPED TO ONE KEY, not all active keys — this grants read access to company
 * financials, cash position, revenue goals, and named individuals' commission
 * data. Broadening this to updateMany({active:true}, ...) would silently grant
 * that access to every other active key (partner integrations, webhook keys,
 * etc.). See docs/superpowers/specs/2026-08-18-crm-mcp-board-readonly-tools-design.md.
 *
 * Adds the 'financials', 'cash', 'goals', and 'commissions' scopes to the ONE
 * API key whose raw value is provided via API_KEY_TO_GRANT or the prompt.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import ApiKey from '../models/ApiKey.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_incoda';
const NEW_SCOPES = ['financials', 'cash', 'goals', 'commissions'];

async function readKeyFromStdin() {
    return new Promise((resolve) => {
        process.stdout.write('Enter the API key to grant scopes to: ');
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            input += chunk;
            if (input.includes('\n')) {
                process.stdin.pause();
                resolve(input.split('\n')[0].trim());
            }
        });
    });
}

async function migrate() {
    const rawKey = process.env.API_KEY_TO_GRANT || await readKeyFromStdin();
    if (!rawKey) {
        console.error('No API key provided. Set the API_KEY_TO_GRANT env var, or enter it when prompted.');
        process.exit(1);
    }
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await mongoose.connect(MONGO_URI);

    const key = await ApiKey.findOne({ keyHash, active: true });
    if (!key) {
        console.error('No active API key matches the provided value. Nothing changed.');
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`Found key "${key.name}" (prefix ${key.keyPrefix}). Current scopes: ${key.scopes.join(', ')}`);

    const result = await ApiKey.updateOne(
        { _id: key._id },
        { $addToSet: { scopes: { $each: NEW_SCOPES } } }
    );

    console.log(`Modified ${result.modifiedCount} document. New scopes will include: ${[...new Set([...key.scopes, ...NEW_SCOPES])].join(', ')}`);

    await mongoose.disconnect();
    console.log('Done.');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
