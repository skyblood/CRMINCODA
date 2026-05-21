import mongoose from 'mongoose';

const AutomationRuleSchema = new mongoose.Schema({
    id:            { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    enabled:       { type: Boolean, default: true },
    trigger:       { type: String, required: true }, // stage_changed | days_inactive | deal_won | lead_assigned | field_updated
    triggerConfig: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { stage: 'proposal', days: 7 }
    action:        { type: String, required: true }, // create_task | send_email | send_webhook | notify
    actionConfig:  { type: mongoose.Schema.Types.Mixed, default: {} }, // action-specific payload
}, { timestamps: true, strict: false });

export default mongoose.model('AutomationRule', AutomationRuleSchema);
