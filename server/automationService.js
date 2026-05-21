/**
 * Automation Engine
 * Evaluates enabled AutomationRule documents matching a trigger and executes their actions.
 * Called fire-and-forget from leads.js hook points and the hourly cron.
 */
import AutomationRule from './models/AutomationRule.js';
import Lead from './models/Lead.js';
import { dispatchWebhooks } from './webhookService.js';
import { notifyAdmins } from './notificationService.js';
import { sendTemplatedEmail } from './emailService.js';

// ─── Action Executors ────────────────────────────────────────────────────────

async function execCreateTask(rule, context) {
    const { lead } = context;
    if (!lead?.id) return;
    const task = {
        id: `task_auto_${Date.now()}`,
        title: rule.actionConfig.taskTitle || `[Auto] Follow-up`,
        assignee: lead.assignedToName || '',
        status: 'todo',
        estimatedHours: rule.actionConfig.estimatedHours || 1,
        loggedHours: 0,
        dueDate: rule.actionConfig.dueDays
            ? new Date(Date.now() + rule.actionConfig.dueDays * 86400000).toISOString().split('T')[0]
            : '',
        subtasks: [],
        priority: rule.actionConfig.priority || 'medium',
    };
    await Lead.findOneAndUpdate({ id: lead.id }, { $push: { tasks: task } });
}

async function execSendEmail(rule, context) {
    const { lead } = context;
    if (!lead) return;
    try {
        await sendTemplatedEmail({
            templateId: rule.actionConfig.templateId,
            to: rule.actionConfig.to || lead.email,
            variables: { companyName: lead.companyName, contactName: lead.contactName, stage: lead.stage },
        });
    } catch (err) {
        console.error('[Automation] send_email failed:', err.message);
    }
}

async function execSendWebhook(rule, context) {
    try {
        await dispatchWebhooks(`automation.${rule.trigger}`, { rule: rule.name, ...context });
    } catch (err) {
        console.error('[Automation] send_webhook failed:', err.message);
    }
}

const ALLOWED_LEAD_FIELDS = new Set([
    'stage', 'probability', 'priority', 'nextStep', 'nextStepDueDate',
    'assignedTo', 'assignedToName', 'wonReason', 'lostReason', 'lostNote',
    'competitor', 'projectName', 'aiNextAction',
]);

async function execChangeField(rule, context) {
    const { lead } = context;
    if (!lead?.id || !rule.actionConfig?.field) return;
    const field = rule.actionConfig.field;
    if (!ALLOWED_LEAD_FIELDS.has(field)) {
        console.error(`[Automation] execChangeField blocked: field "${field}" not in whitelist`);
        return;
    }
    await Lead.findOneAndUpdate(
        { id: lead.id },
        { $set: { [field]: rule.actionConfig.value ?? '' } }
    );
}

async function execNotify(rule, context) {
    const { lead } = context;
    await notifyAdmins({
        type: 'automation_triggered',
        title: rule.actionConfig.title || `Automation: ${rule.name}`,
        severity: rule.actionConfig.severity || 'info',
        relatedModel: 'lead',
        relatedId: lead?.id,
        route: '/crm',
    }).catch(() => {});
}

const ACTION_HANDLERS = {
    create_task:   execCreateTask,
    send_email:    execSendEmail,
    send_webhook:  execSendWebhook,
    notify:        execNotify,
    change_field:  execChangeField,
};

// ─── Days-Inactive Scanner (called by hourly cron) ───────────────────────────

async function scanDaysInactive() {
    const rules = await AutomationRule.find({ enabled: true, trigger: 'days_inactive' }).lean();
    if (!rules.length) return;

    for (const rule of rules) {
        const days = rule.triggerConfig?.days ?? 7;
        const cutoff = new Date(Date.now() - days * 86400000);
        const staleLeads = await Lead.find({
            deleted: { $ne: true },
            stage: { $nin: ['closed-won', 'closed-lost'] },
            updatedAt: { $lt: cutoff },
        }).lean();

        for (const lead of staleLeads) {
            const handler = ACTION_HANDLERS[rule.action];
            if (handler) {
                await handler(rule, { lead }).catch(err =>
                    console.error(`[Automation] days_inactive action failed for ${lead.id}:`, err.message)
                );
            }
        }
    }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * evaluateRules(trigger, context)
 * trigger: 'stage_changed' | 'days_inactive' | 'deal_won' | 'lead_assigned' | 'field_updated'
 * context: { lead, previousStage, newStage, userId, ... }
 */
export async function evaluateRules(trigger, context) {
    if (trigger === 'days_inactive') {
        return scanDaysInactive();
    }

    const rules = await AutomationRule.find({ enabled: true, trigger }).lean();
    if (!rules.length) return;

    for (const rule of rules) {
        // Optional stage filter for stage_changed trigger
        if (trigger === 'stage_changed' && rule.triggerConfig?.stage) {
            if (rule.triggerConfig.stage !== context.newStage) continue;
        }
        // Optional field filter for field_updated trigger
        if (trigger === 'field_updated' && rule.triggerConfig?.field) {
            if (!context.changedFields?.includes(rule.triggerConfig.field)) continue;
        }

        const handler = ACTION_HANDLERS[rule.action];
        if (handler) {
            await handler(rule, context).catch(err =>
                console.error(`[Automation] rule "${rule.name}" failed:`, err.message)
            );
        }
    }
}
