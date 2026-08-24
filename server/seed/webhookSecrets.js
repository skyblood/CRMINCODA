// One-time, idempotent backfill that encrypts any Webhook.secret still
// stored in plaintext from before encryption was added. A value is treated
// as already-encrypted if it decrypts successfully; GCM's auth-tag check
// makes a false "already encrypted" positive on real plaintext astronomically
// unlikely, so no separate "migrated" flag is needed.
//
// Run on every server startup (see server/index.js) — safe to call
// repeatedly, since an already-encrypted secret is left untouched.
import Webhook from '../models/Webhook.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export async function ensureWebhookSecretsEncrypted() {
    const webhooks = await Webhook.find({ secret: { $exists: true, $ne: '' } });
    for (const webhook of webhooks) {
        try {
            decrypt(webhook.secret);
        } catch {
            webhook.secret = encrypt(webhook.secret);
            await webhook.save();
        }
    }
}
