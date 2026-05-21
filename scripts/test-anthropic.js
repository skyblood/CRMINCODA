import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const key = process.env.ANTHROPIC_API_KEY;

if (!key || key.trim() === '') {
    console.error('❌  ANTHROPIC_API_KEY no está configurada en .env');
    process.exit(1);
}

console.log(`🔑  Key encontrada: ${key.slice(0, 10)}...${key.slice(-4)}`);
console.log('📡  Conectando a Anthropic...\n');

const client = new Anthropic({ apiKey: key });

try {
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Respond with exactly: {"status":"ok"}' }],
    });

    const text = msg.content[0].text.trim().replace(/^```json\s*|^```\s*|```$/gm, '').trim();
    const parsed = JSON.parse(text);

    if (parsed.status === 'ok') {
        console.log('✅  Conexión exitosa con Anthropic Claude');
        console.log(`   Modelo : ${msg.model}`);
        console.log(`   Tokens : ${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out`);
        console.log(`   Stop   : ${msg.stop_reason}`);
    }
} catch (err) {
    if (err.status === 401) {
        console.error('❌  API key inválida o revocada (401 Unauthorized)');
    } else if (err.status === 429) {
        console.error('⚠️   Rate limit alcanzado (429) — la key funciona pero hay demasiadas requests');
    } else {
        console.error(`❌  Error: ${err.message}`);
    }
    process.exit(1);
}
