import Notification from './models/Notification.js';
import User from './models/User.js';
import Lead from './models/Lead.js';
import Project from './models/Project.js';

export async function createNotification({ userId, type, title, message, severity = 'info', relatedModel, relatedId, route, expiresAt, combine = false }) {
  if (combine) {
    // Combine mode: merge into any unread notification of the same
    // {userId, type} regardless of relatedId — used for high-volume periodic
    // notifications (e.g. "3 leads expiring soon") where a separate row per
    // relatedId would flood the notification center. Shows the most recent
    // occurrence's title/message with a running count instead.
    const existing = await Notification.findOneAndUpdate(
      { userId, type, read: false },
      { $set: { title, message, severity, relatedModel, relatedId, route, expiresAt }, $inc: { count: 1 } },
      { new: true },
    );
    if (existing) return existing;
    return Notification.create({ userId, type, title, message, severity, relatedModel, relatedId, route, expiresAt });
  }

  // Dedup: don't create if unread identical exists
  const existing = await Notification.findOne({ userId, type, relatedId, read: false });
  if (existing) return existing;
  return Notification.create({ userId, type, title, message, severity, relatedModel, relatedId, route, expiresAt });
}

export async function notifyUsers(userIds, data) {
  return Promise.all(userIds.map(userId => createNotification({ ...data, userId }).catch(() => null)));
}

export async function notifyAdmins(data) {
  const admins = await User.find({ 'permissions.admin': true }).lean();
  return notifyUsers(admins.map(u => u.id || u._id.toString()), data);
}

export async function generatePeriodicNotifications() {
  const now = new Date();
  // 1. Leads expiring in 7 days
  const soonLeads = await Lead.find({
    stage: { $nin: ['closed-won', 'closed-lost', 'project-delivered'] },
    expectedCloseDate: {
      $gte: now.toISOString().split('T')[0],
      $lte: new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
    },
    deleted: { $ne: true }
  }).lean();
  const crmUsers = await User.find({ 'permissions.crm': true }).lean();
  const crmIds = crmUsers.map(u => u.id || u._id.toString());
  for (const lead of soonLeads) {
    await notifyUsers(crmIds, {
      type: 'lead_expiring',
      title: `Lead próximo a vencer: ${lead.companyName}`,
      message: `Fecha de cierre: ${lead.expectedCloseDate}`,
      severity: 'warning',
      relatedModel: 'lead',
      relatedId: String(lead._id),
      route: '/crm',
      expiresAt: new Date(lead.expectedCloseDate),
      combine: true
    });
  }
  // 2. Projects with hours > 90%
  const projects = await Project.find({ status: 'active' }).lean();
  const adminUsers = await User.find({ 'permissions.admin': true }).lean();
  const adminIds = adminUsers.map(u => u.id || u._id.toString());
  for (const p of projects) {
    const logged = (p.timeLogs || []).reduce((s, l) => s + (l.hours || 0), 0);
    if (p.totalBudgetHours > 0 && logged / p.totalBudgetHours > 0.9) {
      await notifyUsers(adminIds, {
        type: 'project_budget_warning',
        title: `Presupuesto al límite: ${p.name}`,
        message: `${logged}h / ${p.totalBudgetHours}h utilizadas`,
        severity: 'warning',
        relatedModel: 'project',
        relatedId: String(p._id),
        route: '/projects',
        combine: true
      });
    }
  }
}
