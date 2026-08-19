import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLeads } from './setup.js';
import Lead from '../../server/models/Lead.js';
import { computePipelineForecast } from '../../server/routes/aiReports.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLeads);

function fakeAiClient(jsonPayload) {
    return {
        messages: {
            create: async () => ({
                content: [{ text: JSON.stringify(jsonPayload) }],
            }),
        },
    };
}

describe('computePipelineForecast', () => {
    it('returns the parsed forecast shape and rolls up pipeline metrics into meta', async () => {
        await Lead.create([
            { id: 'l1', companyName: 'Acme', contactName: 'Ana', stage: 'proposal', value: 50000, probability: 60, deleted: false },
            { id: 'l2', companyName: 'Beta', contactName: 'Bob', stage: 'closed-won', value: 20000, closedValue: 20000, deleted: false },
            { id: 'l3', companyName: 'Cargo', contactName: 'Cid', stage: 'closed-lost', value: 10000, deleted: false },
        ]);

        const ai = fakeAiClient({
            health: 'Healthy',
            d30: 10000,
            d60: 20000,
            d90: 30000,
            narrative: 'Strong quarter ahead.',
            topRisk: 'One large deal is stale.',
            topAction: 'Follow up with Acme this week.',
        });

        const forecast = await computePipelineForecast(ai);

        assert.equal(forecast.health, 'Healthy');
        assert.equal(forecast.d30, 10000);
        assert.equal(forecast.d90, 30000);
        assert.equal(forecast.narrative, 'Strong quarter ahead.');
        assert.equal(forecast.meta.activeDeals, 1);
        assert.equal(forecast.meta.winRate, 50);
        assert.ok(forecast.generatedAt);
    });

    it('clamps negative or non-numeric AI-returned day values to zero', async () => {
        const ai = fakeAiClient({ health: 'At Risk', d30: -5, d60: 'not a number', d90: 100, narrative: '', topRisk: '', topAction: '' });
        const forecast = await computePipelineForecast(ai);
        assert.equal(forecast.d30, 0);
        assert.equal(forecast.d60, 0);
        assert.equal(forecast.d90, 100);
    });
});
