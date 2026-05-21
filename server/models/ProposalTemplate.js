import mongoose from 'mongoose';

/**
 * ProposalTemplate — stores HTML proposal templates with {{placeholder}} syntax.
 *
 * Available placeholders (auto-injected by /api/proposal-templates/:id/apply):
 *
 * CLIENT:
 *   {{company_name}}  {{contact_name}}  {{contact_email}}  {{contact_phone}}
 *   {{contact_role}}  {{country}}       {{date}}           {{ref}}
 *   {{expected_close}} {{deal_value}}
 *
 * VERACODE CONFIG:
 *   {{developer_count}}  {{profile_count}}  {{license_years}}
 *   {{modules_list}}     {{modules_table}}  {{notes}}
 *
 * AI-GENERATED (requires running /api/proposals/generate first):
 *   {{ai_executive_summary}}  {{ai_solution_overview}}
 *   {{ai_methodology}}        {{ai_why_incoda}}  {{ai_next_steps}}
 *
 * PRICING:
 *   {{items_table}}   {{total_value}}
 *
 * ASSETS:
 *   {{logo_url}}   (URL to /incoda-logo.svg)
 */
const ProposalTemplateSchema = new mongoose.Schema({
    id:          { type: String, required: true, unique: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    htmlContent: { type: String, required: true }, // Full HTML with {{placeholders}}
    isDefault:   { type: Boolean, default: false },
    tags:        { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.model('ProposalTemplate', ProposalTemplateSchema);
