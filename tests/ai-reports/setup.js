import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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

export async function clearLeads() {
    await Lead.deleteMany({});
}
