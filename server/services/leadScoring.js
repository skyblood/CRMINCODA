/**
 * AI Lead Scoring — Anthropic Claude (server-side).
 * Scores a lead 0-100 and returns a short reason.
 * API key stays server-side; frontend never sees it.
 */
import Anthropic from '@anthropic-ai/sdk';

let client = null;

const getClient = () => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
};

const STAGE_WEIGHTS = {
    'prospect': 10, 'qualification': 25, 'presentation': 40,
    'proposal': 60, 'negotiation': 80, 'closed-won': 100, 'closed-lost': 0,
};

/**
 * Returns { score: number (0-100), reason: string }
 * Falls back to a heuristic score if Anthropic key is not configured.
 */
export const scoreLead = async (lead) => {
    const ai = getClient();

    if (ai) {
        try {
            const lastInteractionDate = lead.interactions?.length
                ? lead.interactions[lead.interactions.length - 1].date
                : null;
            const daysSinceLast = lastInteractionDate
                ? Math.floor((Date.now() - new Date(lastInteractionDate).getTime()) / 86_400_000)
                : null;

            const prompt = `You are a CRM sales analyst. Score this B2B sales lead from 0 to 100 based on its likelihood to close successfully.

Lead data:
- Company: ${lead.companyName}
- Stage: ${lead.stage}
- Estimated value: $${lead.value || 0}
- Close probability set by sales rep: ${lead.probability || 0}%
- Number of interactions logged: ${(lead.interactions || []).length}
- Days since last interaction: ${daysSinceLast ?? 'unknown'}
- Expected close date: ${lead.expectedCloseDate || 'not set'}
- Next step defined: ${lead.nextStep ? 'yes' : 'no'}
- Manufacturer/vendor: ${lead.manufacturer || 'none'}
- Partner: ${lead.partnerName || 'none'}

Scoring guidance:
- 0-33: Low priority — early stage, low engagement, or stale
- 34-66: Medium — progressing but needs attention
- 67-100: High priority — strong signals, close to conversion

Also provide a concise nextAction — the single most impactful next step the sales rep should take TODAY to advance this deal (max 100 characters).

Respond ONLY with valid JSON, no markdown, no explanation outside JSON:
{"score": <integer 0-100>, "reason": "<one concise sentence, max 120 characters>", "nextAction": "<imperative sentence, max 100 characters>"}`;

            const message = await ai.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 192,
                messages: [{ role: 'user', content: prompt }],
            });

            const text = message.content[0].text.trim().replace(/^```json\s*|^```\s*|```$/gm, '').trim();
            const parsed = JSON.parse(text);
            return {
                score:      Math.max(0, Math.min(100, parseInt(parsed.score))),
                reason:     String(parsed.reason).slice(0, 200),
                nextAction: String(parsed.nextAction || '').slice(0, 150),
            };
        } catch (err) {
            console.error('[LeadScoring] Claude error, using heuristic fallback:', err.message);
        }
    }

    // Heuristic fallback — no API key or Claude unavailable
    let score = STAGE_WEIGHTS[lead.stage] ?? 20;
    score += Math.min(20, (lead.probability || 0) / 5);
    score += Math.min(10, (lead.interactions?.length || 0) * 2);
    if (lead.nextStep) score += 5;
    if (lead.expectedCloseDate) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const heuristicNextAction = !lead.nextStep
        ? 'Define a next step and follow-up date to keep this deal moving'
        : !lead.expectedCloseDate
        ? 'Set an expected close date to commit to a timeline'
        : (lead.interactions?.length || 0) === 0
        ? 'Log first interaction and schedule a discovery call'
        : `Follow up on: ${lead.nextStep}`;

    return {
        score,
        reason: `Heuristic: stage "${lead.stage}", ${lead.probability || 0}% probability, ${lead.interactions?.length || 0} interactions.`,
        nextAction: heuristicNextAction,
    };
};
