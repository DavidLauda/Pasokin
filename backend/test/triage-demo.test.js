const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const triageService = require('../src/services/triageService');
const geminiTriageService = require('../src/services/geminiTriageService');

const requirement = { materialName: 'Baja Ringan', unit: 'batang' };
const allocation = { qty: 100, price: 62000, lead_time_days: 3 };

for (const demoMode of ['true', 'false']) {
    test(`supplier replies use Gemma when DEMO_MODE=${demoMode}`, async t => {
        const previousMode = process.env.DEMO_MODE;
        process.env.DEMO_MODE = demoMode;
        t.after(() => { if (previousMode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previousMode; });
        const calls = [];
        t.mock.method(axios, 'post', async (...args) => {
            calls.push(args);
            return { data: {
                classification: 'confirmed',
                ai_summary: 'Hasil Gemma',
                ai_extracted: { qty: 100, price: 62000, lead_time_days: 3 }
            } };
        });

        const result = await triageService.classifySupplierReply(requirement, allocation, 'Kami setuju');

        assert.equal(result.ai_summary, 'Hasil Gemma');
        assert.equal(calls.length, 1);
        assert.match(calls[0][0], /\/triage$/);
        assert.match(calls[0][1].text_input, /Balasan Supplier: Kami setuju/);
    });
}

test('Gemma outage needs manual review instead of simulated AI confirmation', async t => {
    t.mock.method(axios, 'post', async () => { throw new Error('Gemma unavailable'); });

    const result = await triageService.classifySupplierReply(requirement, allocation, 'Kami bisa kirim');

    assert.equal(result.classification, 'needs_manual_review');
    assert.match(result.ai_summary, /Gemma tidak dapat menganalisis/);
    assert.equal(result.ai_extracted, null);
});

test('Gemini selection processes supplier replies without calling Gemma', async t => {
    t.mock.method(axios, 'post', async () => { throw new Error('Gemma must not run'); });
    t.mock.method(geminiTriageService, 'classifySupplierReply', async () => ({
        classification: 'confirmed', ai_summary: 'Hasil Gemini',
        ai_extracted: { qty: 100, price: 62000, lead_time_days: 3 }
    }));

    const result = await triageService.classifySupplierReply(requirement, allocation,
        '100 batang, kirim 3 hari', new Date().toISOString(), 'gemini');

    assert.equal(result.classification, 'confirmed');
    assert.equal(result.ai_summary, 'Hasil Gemini');
});

test('Gemini outage needs manual review instead of silently switching models', async t => {
    t.mock.method(geminiTriageService, 'classifySupplierReply', async () => {
        throw new Error('Gemini unavailable');
    });
    const result = await triageService.classifySupplierReply(requirement, allocation,
        'Kami setuju', null, 'gemini');
    assert.equal(result.classification, 'needs_manual_review');
    assert.match(result.ai_summary, /Gemini tidak dapat menganalisis/);
});
