# 1099/W-9 Compliance — Design Spec

**Date:** 2026-08-23
**Status:** Approved for planning

## Problem

CRMINCODA already aggregates contractor payments and flags who crosses the
IRS $600 threshold for 1099-NEC (`GET /api/ledger-reports/1099`,
`TenNinetyNineTab.tsx`), built on top of the existing double-entry ledger
(`JournalEntry.js`, `entityId` field explicitly earmarked for "1099 & AR
aggregation") and the `Contract Labor` account (code `6100`) in
`chartOfAccounts.js`.

What's missing is the data needed to actually file: no TIN/SSN/EIN, no legal
name, no address is stored anywhere for consultants. Without it:

1. Whoever prepares the 1099 filing (CPA / Track1099 / IRS FIRE) has to
   manually chase a W-9 from each contractor every year.
2. The IRS requires 24% backup withholding on payments to a contractor with
   no W-9/TIN on file — nothing in the system detects or warns about this.
3. The `1099` report shows raw `entityId`, not a resolved consultant name.
4. There is no export in a format a filing service can ingest.

## Goals

- Collect and store TIN/EIN, legal name, and address for consultants,
  encrypted at rest.
- Warn admins when a Contract Labor payment posts to a consultant with no
  TIN on file (backup withholding risk).
- Resolve consultant names in the 1099 report and add a "has TIN" indicator.
- Export a CSV in a format compatible with Track1099's bulk-import template.

## Non-goals

- Actually e-filing the 1099 with the IRS (stays a manual step via a CPA or
  a service like Track1099 / IRS FIRE, as the existing UI copy already
  states).
- Building a generic "Vendor" entity distinct from `User`. Every
  1099-relevant `entityId` in `JournalEntry` already maps to a consultant
  `User` (per the existing `postCommissionPaid` flow) — there is no evidence
  of contractors who aren't system users, so a separate Vendor model would
  be speculative scope.
- Sales tax collection/nexus tracking. INCODA is a B2B services consultancy;
  this is a secondary concern not raised by the current tax-reporting need.

## Architecture

### 1. Encryption module — `server/utils/encryption.js`

Ported from Midday's `packages/encryption/src/index.ts` pattern (Node's
built-in `crypto`, no new dependency):

```js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required for encryption.js');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (base64)');
  return key;
}

export function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(payload) {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

`getKey()` is called on every `encrypt`/`decrypt`, not cached at module load,
so a missing/invalid `ENCRYPTION_KEY` throws the first time the module is
actually used rather than crashing unrelated server startups. Tampering with
the ciphertext (payload) causes `decipher.final()` to throw
(`Unsupported state or unable to authenticate data`) — this is GCM's built-in
authentication, no extra code needed.

### 2. `User.js` schema addition

```js
taxInfo: {
  legalName:     { type: String, default: '' },
  tinEncrypted:  { type: String, default: '' },   // output of encrypt()
  tinLast4:      { type: String, default: '' },   // plaintext, display only
  tinType:       { type: String, enum: ['SSN', 'EIN', ''], default: '' },
  address: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city:  { type: String, default: '' },
    state: { type: String, default: '' },
    zip:   { type: String, default: '' },
    country: { type: String, default: 'US' },
  },
  w9SubmittedAt: { type: Date, default: null },
}
```

### 3. Self-service routes — `server/routes/taxProfile.js`

- `GET /api/users/me/tax-profile` — requires `req.session.user`. Returns
  `{ legalName, tinLast4, tinType, address, w9SubmittedAt }`. Never includes
  `tinEncrypted` or a decrypted TIN.
- `PUT /api/users/me/tax-profile` — requires `req.session.user`. Body:
  `{ legalName, tin, tinType, address }`. Validates `tin` server-side:
  strip non-digits, require exactly 9 digits, else `400` with
  `{ error: 'TIN must be 9 digits' }`. On success: `tinEncrypted =
  encrypt(tin)`, `tinLast4 = tin.slice(-4)`, `w9SubmittedAt = new Date()`,
  save, respond `200` with the same masked shape as the GET.

### 4. Admin/finance routes

- `GET /api/admin/tax-profiles/:userId` — gated by
  `req.session.user?.permissions?.finance || req.session.user?.permissions?.admin`,
  else `403`. Returns the full decrypted profile (`tin` in the clear) for a
  single consultant — used when a CPA needs to look up one contractor.
- `GET /api/ledger-reports/1099/export?year=` — same permission gate. Reuses
  the existing aggregation query from `/1099`, then for each row looks up
  the `User`, decrypts `tinEncrypted`, and streams a CSV with this header
  row (Track1099 bulk-import column names):

  ```
  Recipient Name,TIN,TIN Type,Address,City,State,Zip,Box1_NonemployeeComp
  ```

  A row with no `taxInfo.tinEncrypted` on file still appears, with `TIN`
  left blank and `Box1_NonemployeeComp` populated — so the export doubles as
  the "who's missing a W-9" worklist, not just the ready-to-file rows.

### 5. Backup withholding warning — `server/services/ledgerPostingService.js`

Inside `postCommissionPaid` (and any future function that debits the
Contract Labor account `6100`), after resolving the `entityId`:

```js
const consultant = await mongoose.model('User').findOne({ id: entityId }).lean();
if (!consultant?.taxInfo?.tinEncrypted) {
  const { notifyAdmins } = await import('../notificationService.js');
  notifyAdmins({
    type: 'backup_withholding_risk',
    title: `⚠ Pago sin W-9: ${consultant?.name || entityId}`,
    message: `Se pagó Contract Labor sin TIN en archivo. El IRS exige retención de respaldo del 24% sobre pagos a contratistas sin W-9.`,
    severity: 'error',
    relatedModel: 'user',
    relatedId: entityId,
    route: '/settings/users',
  }).catch(() => {});
}
```

This warns; it does not block the payment (the money still needs to go out
— the fix is administrative: get the W-9, or actually withhold 24% on the
next payment, which is a human decision the system flags but doesn't
automate).

### 6. Frontend

- **`ConsultantPortal.tsx`** — new "Datos fiscales" section (a card, next to
  the existing sections, following the component's existing pattern of
  inline forms + modals rather than introducing a tab system that doesn't
  exist yet). Fields: legal name, TIN (a write-only password-style input —
  if `tinLast4` already exists, show `"Termina en ••••1234 — reemplazar"`
  as a placeholder/label instead of pre-filling anything), TIN type
  (SSN/EIN radio), address fields. Submits to
  `PUT /api/users/me/tax-profile`.
- **`TenNinetyNineTab.tsx`** — resolve `entityId` to consultant name (new
  field `name` added server-side to each row in the `/1099` response, via a
  batch `User.find({ id: { $in: entityIds } })` lookup), add a "Sin W-9"
  badge when `hasTIN` is `false` (new field on the same response), add an
  "Exportar CSV" button that links to `/api/ledger-reports/1099/export?year=`.

## Data flow

1. Consultant opens ConsultantPortal → "Datos fiscales" → fills form → `PUT
   tax-profile` → server validates TIN format → encrypts → stores
   `tinEncrypted` + `tinLast4` + `w9SubmittedAt` on their `User` doc.
2. A commission is paid → `postCommissionPaid` debits Contract Labor,
   credits Cash, with `entityId` = the consultant's `id` → checks
   `taxInfo.tinEncrypted` → if missing, notifies admins.
3. Admin/finance opens `TenNinetyNineTab` in January → sees resolved names,
   who crosses $600, who's missing a W-9 → clicks "Exportar CSV" → server
   decrypts TINs server-side, streams the file → admin uploads it to
   Track1099 or hands it to a CPA.

## Error handling

- `ENCRYPTION_KEY` missing/wrong length → `encrypt()`/`decrypt()` throw
  immediately with a clear message; the routes that call them return `500`
  with that message logged server-side (never leak the key itself).
- Invalid TIN format on `PUT tax-profile` → `400`, no write.
- `/1099/export` with zero qualifying rows for the year → `200` with a CSV
  containing only the header row, not an error.
- Decryption failure on export (corrupted ciphertext, wrong key rotated
  without re-encrypting old data) → catch per-row, log the `userId`, emit
  `TIN_DECRYPT_ERROR` in that row's TIN column instead of crashing the whole
  export — one bad row shouldn't block filing for everyone else.

## Testing

- `encryption.js`: round-trip test (`decrypt(encrypt(x)) === x`), tamper
  test (flip a byte in the base64 payload, assert `decrypt` throws), missing
  key test (unset `ENCRYPTION_KEY`, assert `encrypt` throws with the
  expected message).
- `taxProfile.js`: `PUT` with a valid 9-digit TIN succeeds and the
  subsequent `GET` never contains the full TIN, only `tinLast4`; `PUT` with
  an 8-digit or non-numeric TIN returns `400`.
- `ledgerPostingService.js`: `postCommissionPaid` for an `entityId` with no
  `taxInfo` calls `notifyAdmins` with `type: 'backup_withholding_risk'`;
  for an `entityId` with `taxInfo.tinEncrypted` set, it does not.
- `/1099/export`: response `Content-Type` is `text/csv`, header row matches
  the documented columns, a row with no TIN on file has a blank `TIN`
  column but is still present.
