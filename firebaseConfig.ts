
// FIREBASE CONNECTION REMOVED - Migrated to local MongoDB
// This file is kept for compatibility with existing imports.

export const isFirebaseConfigured = false;
export const db = null;
export const auth = null;

// The new architecture uses:
// - server/index.js (Express + Mongoose backend)
// - server/models/ (MongoDB models)
// - server/routes/ (REST API)
// - services/firebaseService.ts (Client with auto-backend detection)

export default null;
