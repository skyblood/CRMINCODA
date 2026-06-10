import { Lead, Project } from "../types";

/**
 * AI Reports — calls server-side Anthropic endpoints.
 * API key is never exposed to the browser.
 */

export const generateProjectRiskReport = async (project: Project): Promise<string> => {
    const res = await fetch('/api/ai/risk-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(project),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const { report } = await res.json();
    return report;
};

export const generateSalesForecast = async (leads: Lead[]): Promise<string> => {
    const res = await fetch('/api/ai/sales-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leads }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const { forecast } = await res.json();
    return forecast;
};
