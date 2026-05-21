/**
 * Email Service — CRM Incoda
 * Sends transactional emails via SMTP (nodemailer).
 * Configure via environment variables (see .env.example).
 */
import nodemailer from 'nodemailer';

const {
    SMTP_HOST = 'smtp.gmail.com',
    SMTP_PORT = '587',
    SMTP_USER = '',
    SMTP_PASSWORD = '',
    SMTP_FROM = '',
    NOTIFY_EMAIL = '',
} = process.env;

let transporter = null;

const getTransporter = () => {
    if (!SMTP_USER || !SMTP_PASSWORD) {
        console.warn('[Email] SMTP_USER / SMTP_PASSWORD not set — email notifications disabled.');
        return null;
    }
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
    }
    return transporter;
};

/**
 * Send a "Lead Closed Won" email to every admin user.
 * @param {object} lead  - The full lead document
 * @param {object[]} adminUsers - Array of users with permissions.admin === true
 */
export const sendLeadWonNotification = async (lead, adminUsers) => {
    const t = getTransporter();
    if (!t) return;

    const crmEmails = adminUsers.map(u => u.email).filter(Boolean);
    const fixed = NOTIFY_EMAIL ? NOTIFY_EMAIL.split(',').map(e => e.trim()).filter(Boolean) : [];
    const recipients = [...new Set([...crmEmails, ...fixed])];
    if (recipients.length === 0) {
        console.warn('[Email] No recipients found — skipping notification.');
        return;
    }

    const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
    const amount = lead.closedValue || lead.value;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(9,8,18,0.12);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#090812 0%,#25024C 60%,#410074 100%);padding:0;">
            <!-- Top accent bar -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:4px;background:linear-gradient(90deg,#410074,#B9B7C9,#410074);"></td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 40px 28px;">
                  <!-- Logo row -->
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:12px;vertical-align:middle;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#410074;border:2px solid #B9B7C9;display:flex;align-items:center;justify-content:center;">
                          <span style="color:#ffffff;font-size:18px;font-weight:900;line-height:40px;display:block;text-align:center;">B</span>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <span style="color:#B9B7C9;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">CRM INCODA</span>
                      </td>
                    </tr>
                  </table>
                  <!-- Title -->
                  <h1 style="margin:20px 0 6px;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
                    LEAD GANADO
                  </h1>
                  <p style="margin:0;color:#B9B7C9;font-size:13px;">Automatic notification · ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── AMOUNT HERO ── -->
        <tr>
          <td style="padding:36px 40px 28px;background:#ffffff;text-align:center;border-bottom:1px solid #E5E4F0;">
            <p style="margin:0 0 8px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Closed Amount</p>
            <p style="margin:0;font-size:48px;font-weight:900;color:#410074;letter-spacing:-1px;line-height:1;">${fmt(amount)}</p>
            <div style="width:48px;height:3px;background:linear-gradient(90deg,#410074,#B9B7C9);border-radius:2px;margin:16px auto 0;"></div>
          </td>
        </tr>

        <!-- ── LEAD DETAILS ── -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Lead Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #E5E4F0;">

              <!-- Row helper: label col dark, value col light -->
              <tr>
                <td style="padding:12px 18px;background:#090812;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;width:38%;white-space:nowrap;">Company</td>
                <td style="padding:12px 18px;background:#ffffff;font-size:14px;color:#090812;font-weight:700;">${lead.companyName || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#0F0326;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Contact</td>
                <td style="padding:12px 18px;background:#F5F5F5;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${lead.contactName || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#090812;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Email</td>
                <td style="padding:12px 18px;background:#ffffff;font-size:14px;color:#410074;border-top:1px solid #E5E4F0;">${lead.email || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#0F0326;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Phone</td>
                <td style="padding:12px 18px;background:#F5F5F5;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${lead.phone || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#090812;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Country / City</td>
                <td style="padding:12px 18px;background:#ffffff;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${[lead.country, lead.city].filter(Boolean).join(', ') || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#0F0326;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Manufacturer</td>
                <td style="padding:12px 18px;background:#F5F5F5;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${lead.manufacturer || '—'}</td>
              </tr>
              <tr>
                <td style="padding:12px 18px;background:#090812;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Partner</td>
                <td style="padding:12px 18px;background:#ffffff;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${lead.partnerName || '—'}</td>
              </tr>
              ${lead.description ? `
              <tr>
                <td style="padding:12px 18px;background:#0F0326;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #25024C;">Description</td>
                <td style="padding:12px 18px;background:#F5F5F5;font-size:14px;color:#090812;border-top:1px solid #E5E4F0;">${lead.description}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;background:#090812;padding:20px 24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:1px;text-transform:uppercase;">CRM-INCODA</p>
                  <p style="margin:0;font-size:12px;color:#E5E4F0;opacity:0.6;">This email was generated automatically. Please do not reply directly.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom accent bar -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#410074,#B9B7C9,#410074);"></td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = `LEAD WON — CRM Incoda

Company:      ${lead.companyName || '—'}
Contact:      ${lead.contactName || '—'}
Email:        ${lead.email || '—'}
Phone:        ${lead.phone || '—'}
Country/City: ${[lead.country, lead.city].filter(Boolean).join(', ') || '—'}
Manufacturer: ${lead.manufacturer || '—'}
Partner:      ${lead.partnerName || '—'}
Amount:       ${fmt(amount)}
${lead.description ? `\nDescription: ${lead.description}` : ''}

Date: ${new Date().toLocaleString('en-US')}`;

    try {
        await t.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to: recipients.join(', '),
            subject: `🏆 LEAD WON: ${lead.companyName} — ${fmt(amount)}`,
            text: textBody,
            html: htmlBody,
        });
        console.log(`[Email] Lead-won notification sent to: ${recipients.join(', ')}`);
    } catch (err) {
        console.error('[Email] Failed to send lead-won notification:', err.message);
    }
};

/**
 * Send the monthly pending-payment summary to every admin user.
 * Lists all approved (not yet paid) hours per consultant across all projects.
 * @param {object[]} adminUsers  - Users with permissions.admin === true
 * @param {object[]} projects    - All project documents from MongoDB
 */
export const sendMonthlyPendingPaymentReport = async (adminUsers, projects) => {
    const t = getTransporter();
    if (!t) return;

    const recipients = adminUsers.map(u => u.email).filter(Boolean);
    if (recipients.length === 0) {
        console.warn('[Email] Monthly report: no admin recipients found — skipping.');
        return;
    }

    const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const fmtH = (n) => `${Number(n || 0).toFixed(1)}h`;
    const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Collect all approved (not yet paid) logs from every project
    const consultantMap = {}; // { name: { totalHours, totalCost, projects: [{name, hours, cost}] } }

    for (const project of projects) {
        const allLogs = [
            ...(project.timeLogs || []),
            ...((project.tickets || []).flatMap(tk => tk.timeLogs || []))
        ];
        const approvedLogs = allLogs.filter(l => l.status === 'approved');

        for (const log of approvedLogs) {
            const name = log.consultantName;
            if (!consultantMap[name]) {
                consultantMap[name] = { totalHours: 0, totalCost: 0, projects: {} };
            }
            const cost = log.approvedCost || (log.hours * (log.approvedRate || 0));
            consultantMap[name].totalHours += log.hours;
            consultantMap[name].totalCost += cost;

            if (!consultantMap[name].projects[project.name]) {
                consultantMap[name].projects[project.name] = { hours: 0, cost: 0 };
            }
            consultantMap[name].projects[project.name].hours += log.hours;
            consultantMap[name].projects[project.name].cost += cost;
        }
    }

    const consultants = Object.entries(consultantMap).sort((a, b) => b[1].totalCost - a[1].totalCost);

    if (consultants.length === 0) {
        console.log('[Email] Monthly report: no approved-unpaid hours found — email not sent.');
        return;
    }

    const grandTotalHours = consultants.reduce((s, [, c]) => s + c.totalHours, 0);
    const grandTotalCost = consultants.reduce((s, [, c]) => s + c.totalCost, 0);

    // Build consultant rows HTML
    const rowBg = ['#ffffff', '#F5F5F5'];
    const consultantRows = consultants.map(([name, data], ci) => {
        const projectRows = Object.entries(data.projects).map(([pName, p], pi) => `
            <tr>
              <td style="padding:8px 18px 8px 36px;background:${pi % 2 === 0 ? '#fafafa' : '#f3f3f3'};font-size:12px;color:#555;border-top:1px solid #eee;">↳ ${pName}</td>
              <td style="padding:8px 18px;background:${pi % 2 === 0 ? '#fafafa' : '#f3f3f3'};font-size:12px;color:#555;text-align:right;border-top:1px solid #eee;">${fmtH(p.hours)}</td>
              <td style="padding:8px 18px;background:${pi % 2 === 0 ? '#fafafa' : '#f3f3f3'};font-size:12px;color:#555;text-align:right;border-top:1px solid #eee;">${fmt(p.cost)}</td>
            </tr>`).join('');

        return `
          <tr>
            <td style="padding:14px 18px;background:${ci % 2 === 0 ? '#090812' : '#0F0326'};font-size:13px;font-weight:700;color:#ffffff;border-top:1px solid #25024C;">${name}</td>
            <td style="padding:14px 18px;background:${rowBg[ci % 2]};font-size:13px;font-weight:700;color:#410074;text-align:right;border-top:1px solid #E5E4F0;">${fmtH(data.totalHours)}</td>
            <td style="padding:14px 18px;background:${rowBg[ci % 2]};font-size:13px;font-weight:700;color:#410074;text-align:right;border-top:1px solid #E5E4F0;">${fmt(data.totalCost)}</td>
          </tr>
          ${projectRows}`;
    }).join('');

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(9,8,18,0.12);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#090812 0%,#25024C 60%,#410074 100%);padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:4px;background:linear-gradient(90deg,#410074,#B9B7C9,#410074);"></td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 40px 28px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:12px;vertical-align:middle;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#410074;border:2px solid #B9B7C9;text-align:center;line-height:40px;">
                          <span style="color:#ffffff;font-size:18px;font-weight:900;">B</span>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <span style="color:#B9B7C9;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">CRM INCODA</span>
                      </td>
                    </tr>
                  </table>
                  <h1 style="margin:20px 0 6px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
                    Monthly Pending Payment Report
                  </h1>
                  <p style="margin:0;color:#B9B7C9;font-size:13px;">Approved hours pending payment · ${reportDate}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- SUMMARY HERO -->
        <tr>
          <td style="padding:30px 40px;background:#ffffff;border-bottom:1px solid #E5E4F0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;width:50%;border-right:1px solid #E5E4F0;">
                  <p style="margin:0 0 6px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Total Hours to Pay</p>
                  <p style="margin:0;font-size:40px;font-weight:900;color:#410074;letter-spacing:-1px;line-height:1;">${fmtH(grandTotalHours)}</p>
                </td>
                <td style="text-align:center;width:50%;">
                  <p style="margin:0 0 6px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Total Cost to Pay</p>
                  <p style="margin:0;font-size:40px;font-weight:900;color:#410074;letter-spacing:-1px;line-height:1;">${fmt(grandTotalCost)}</p>
                </td>
              </tr>
            </table>
            <div style="width:48px;height:3px;background:linear-gradient(90deg,#410074,#B9B7C9);border-radius:2px;margin:20px auto 0;"></div>
          </td>
        </tr>

        <!-- CONSULTANT BREAKDOWN -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Breakdown by Consultant</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #E5E4F0;">
              <tr>
                <th style="padding:10px 18px;background:#25024C;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;text-align:left;">Consultant</th>
                <th style="padding:10px 18px;background:#25024C;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;text-align:right;">Hours</th>
                <th style="padding:10px 18px;background:#25024C;font-size:11px;font-weight:700;color:#B9B7C9;text-transform:uppercase;letter-spacing:1px;text-align:right;">Cost</th>
              </tr>
              ${consultantRows}
              <!-- Grand total row -->
              <tr>
                <td style="padding:14px 18px;background:#410074;font-size:13px;font-weight:900;color:#ffffff;border-top:2px solid #B9B7C9;text-transform:uppercase;letter-spacing:1px;">TOTAL</td>
                <td style="padding:14px 18px;background:#410074;font-size:13px;font-weight:900;color:#ffffff;text-align:right;border-top:2px solid #B9B7C9;">${fmtH(grandTotalHours)}</td>
                <td style="padding:14px 18px;background:#410074;font-size:13px;font-weight:900;color:#ffffff;text-align:right;border-top:2px solid #B9B7C9;">${fmt(grandTotalCost)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;background:#090812;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;color:#B9B7C9;font-weight:700;letter-spacing:1px;text-transform:uppercase;">CRM-INCODA</p>
                  <p style="margin:0;font-size:12px;color:#E5E4F0;opacity:0.6;">Automated monthly report · Go to the Time Approval Center to mark hours as paid.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,#410074,#B9B7C9,#410074);"></td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textLines = [
        `MONTHLY PENDING PAYMENT REPORT — CRM Incoda`,
        `Period: ${reportDate}`,
        ``,
        `SUMMARY`,
        `  Total hours to pay : ${fmtH(grandTotalHours)}`,
        `  Total cost to pay  : ${fmt(grandTotalCost)}`,
        ``,
        `BREAKDOWN BY CONSULTANT`,
        ...consultants.flatMap(([name, data]) => [
            ``,
            `  ${name}`,
            `    Total: ${fmtH(data.totalHours)} — ${fmt(data.totalCost)}`,
            ...Object.entries(data.projects).map(([pName, p]) => `    ↳ ${pName}: ${fmtH(p.hours)} — ${fmt(p.cost)}`)
        ]),
        ``,
        `--- Generated automatically by CRM-INCODA ---`
    ];

    try {
        await t.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to: recipients.join(', '),
            subject: `📋 Monthly Pending Payments — ${reportDate} | ${fmtH(grandTotalHours)} · ${fmt(grandTotalCost)}`,
            text: textLines.join('\n'),
            html: htmlBody,
        });
        console.log(`[Email] Monthly pending-payment report sent to: ${recipients.join(', ')}`);
    } catch (err) {
        console.error('[Email] Failed to send monthly report:', err.message);
    }
};

/**
 * Send an email from an EmailTemplate stored in the DB.
 * Used by the Automation Engine for `send_email` actions.
 *
 * @param {{ templateId: string, to: string, variables: Record<string,string> }} opts
 */
export const sendTemplatedEmail = async ({ templateId, to, variables = {}, leadId = null, sentBy = 'system' }) => {
    const t = getTransporter();
    if (!t || !to) return;

    const { default: EmailTemplate } = await import('./models/EmailTemplate.js');
    const { default: EmailLog }      = await import('./models/EmailLog.js');
    const template = await EmailTemplate.findOne({ id: templateId }).lean();
    if (!template) {
        console.warn(`[Email] Template ${templateId} not found — skipping automation email.`);
        return;
    }

    const interpolate = (str) =>
        str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');

    const subject = interpolate(template.subject || template.name || 'CRM Notification');
    const html    = interpolate(template.body || '');
    const text    = html.replace(/<[^>]+>/g, '');

    let status = 'sent', error = null;
    try {
        await t.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, html, text });
        console.log(`[Email] Templated email sent to: ${to} (template: ${templateId})`);
    } catch (err) {
        console.error('[Email] Failed to send templated email:', err.message);
        status = 'failed';
        error = err.message;
    }

    if (leadId) {
        await EmailLog.create({
            leadId, templateId, to,
            from: SMTP_FROM || SMTP_USER || '',
            subject, status, error, sentBy,
        }).catch(e => console.error('[EmailLog]', e.message));
    }
};
