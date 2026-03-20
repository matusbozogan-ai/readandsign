import nodemailer from 'nodemailer'

interface EmailParams {
  toEmail: string
  subject: string
  plainText: string
  html: string
}

// Initialize transporter
let transporter: nodemailer.Transporter | null = null

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@readandsign.app'
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'

if (SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? {
      user: SMTP_USER,
      pass: SMTP_PASS,
    } : undefined,
  })
}

async function sendEmail(params: EmailParams): Promise<void> {
  const { toEmail, subject, plainText, html } = params

  if (!transporter) {
    // Fallback: log to console
    console.log('\n========== EMAIL (NOT SENT - SMTP not configured) ==========')
    console.log(`To: ${toEmail}`)
    console.log(`Subject: ${subject}`)
    console.log('\n--- Plain Text ---')
    console.log(plainText)
    console.log('\n--- HTML ---')
    console.log(html)
    console.log('===========================================================\n')
    return
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: plainText,
      html,
    })
  } catch (err) {
    console.error('Failed to send email:', err)
    throw err
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Not set'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getActionUrl(appUrl: string, path: string): string {
  const baseUrl = appUrl.replace(/\/$/, '')
  return `${baseUrl}${path}`
}

export async function sendAssignmentNotification(params: {
  toEmail: string
  toName: string
  documentTitle: string
  documentNumber?: string
  issuer?: string
  deadline?: string
  assignedByName: string
  appUrl: string
}): Promise<void> {
  const {
    toEmail,
    toName,
    documentTitle,
    documentNumber,
    issuer,
    deadline,
    assignedByName,
    appUrl,
  } = params

  const docDisplay = documentNumber ? `${documentTitle} (${documentNumber})` : documentTitle
  const deadlineDisplay = deadline ? formatDate(deadline) : 'Not set'
  const actionUrl = getActionUrl(appUrl, '/assignments')

  const plainText = `
Hello ${toName},

You have been assigned a document to read and sign.

Document: ${docDisplay}
${issuer ? `Issuer: ${issuer}\n` : ''}Deadline: ${deadlineDisplay}
Assigned by: ${assignedByName}

Please visit your dashboard to review and sign the document.

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Document Compliance Platform</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${escapeHtml(toName)}</strong>,</p>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">You have been assigned a document to read and sign.</p>

      <div style="background: #f0f4f8; border-left: 4px solid #1B3A5C; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 12px; font-weight: bold; color: #2d3748; font-size: 15px;">Document Details</p>
        <p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>Title:</strong> ${escapeHtml(docDisplay)}</p>
        ${issuer ? `<p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>Issuer:</strong> ${escapeHtml(issuer)}</p>` : ''}
        <p style="margin: 0; color: #4a5568; font-size: 14px;"><strong>Deadline:</strong> ${deadlineDisplay}</p>
      </div>

      <p style="margin: 0 0 20px; font-size: 14px; color: #4a5568;">Assigned by: <strong>${escapeHtml(assignedByName)}</strong></p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #1B3A5C; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Open Your Assignments</a>
      </div>

      <p style="margin: 20px 0 0; font-size: 13px; color: #718096;">If you have any questions about this document, please contact your administrator.</p>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    toEmail,
    subject: `Document Assignment: ${documentTitle}`,
    plainText,
    html,
  })
}

export async function sendReminderEmail(params: {
  toEmail: string
  toName: string
  documentTitle: string
  documentNumber?: string
  deadline?: string
  daysUntilDeadline?: number
  appUrl: string
}): Promise<void> {
  const {
    toEmail,
    toName,
    documentTitle,
    documentNumber,
    deadline,
    daysUntilDeadline,
    appUrl,
  } = params

  const docDisplay = documentNumber ? `${documentTitle} (${documentNumber})` : documentTitle
  const deadlineDisplay = deadline ? formatDate(deadline) : 'Not set'
  const actionUrl = getActionUrl(appUrl, '/assignments')

  let urgencyMessage = ''
  let urgencyHtml = ''

  if (daysUntilDeadline !== undefined) {
    if (daysUntilDeadline < 0) {
      const daysOverdue = Math.abs(daysUntilDeadline)
      urgencyMessage = `WARNING: This document is OVERDUE by ${daysOverdue} day(s). Please sign immediately.`
      urgencyHtml = `<div style="background: #FEE; border-left: 4px solid #D32F2F; padding: 16px; margin: 24px 0; border-radius: 4px;"><p style="margin: 0; color: #C62828; font-weight: bold; font-size: 15px;">⚠️ OVERDUE: This document is ${daysOverdue} day(s) overdue. Please sign immediately.</p></div>`
    } else if (daysUntilDeadline <= 3) {
      urgencyMessage = `URGENT: Deadline in ${daysUntilDeadline} day(s).`
      urgencyHtml = `<div style="background: #FFF3E0; border-left: 4px solid #F57C00; padding: 16px; margin: 24px 0; border-radius: 4px;"><p style="margin: 0; color: #E65100; font-weight: bold; font-size: 15px;">⚠️ Deadline in ${daysUntilDeadline} day(s)</p></div>`
    } else {
      urgencyMessage = `Deadline: ${deadlineDisplay}`
      urgencyHtml = `<p style="margin: 0 0 20px; font-size: 14px; color: #4a5568;"><strong>Deadline:</strong> ${deadlineDisplay}</p>`
    }
  }

  const plainText = `
Hello ${toName},

This is a reminder that you have a pending document to read and sign.

Document: ${docDisplay}
${urgencyMessage}

Please visit your dashboard to review and sign the document as soon as possible.

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Document Compliance Platform</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${escapeHtml(toName)}</strong>,</p>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">This is a reminder that you have a pending document to read and sign.</p>

      ${urgencyHtml}

      <div style="background: #f0f4f8; border-left: 4px solid #1B3A5C; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: bold; color: #2d3748; font-size: 15px;">Document: ${escapeHtml(docDisplay)}</p>
        <p style="margin: 0; color: #4a5568; font-size: 14px;">${deadlineDisplay}</p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #1B3A5C; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Sign Document Now</a>
      </div>

      <p style="margin: 20px 0 0; font-size: 13px; color: #718096;">Please complete this action as soon as possible.</p>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    toEmail,
    subject: `Reminder: Pending Document - ${documentTitle}`,
    plainText,
    html,
  })
}

export async function sendNewVersionNotification(params: {
  toEmail: string
  toName: string
  documentTitle: string
  documentNumber?: string
  newVersionNumber: number
  previousVersionNumber: number
  appUrl: string
}): Promise<void> {
  const {
    toEmail,
    toName,
    documentTitle,
    documentNumber,
    newVersionNumber,
    previousVersionNumber,
    appUrl,
  } = params

  const docDisplay = documentNumber ? `${documentTitle} (${documentNumber})` : documentTitle
  const actionUrl = getActionUrl(appUrl, '/assignments')

  const plainText = `
Hello ${toName},

A document you previously signed has been updated with a new version.

Document: ${docDisplay}
Previous Version: ${previousVersionNumber}
New Version: ${newVersionNumber}

Please visit your dashboard to review and sign the new version.

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Document Compliance Platform</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${escapeHtml(toName)}</strong>,</p>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">A document you previously signed has been updated with a new version.</p>

      <div style="background: #f0f4f8; border-left: 4px solid #1B3A5C; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 12px; font-weight: bold; color: #2d3748; font-size: 15px;">Document: ${escapeHtml(docDisplay)}</p>
        <p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>Previous Version:</strong> ${previousVersionNumber}</p>
        <p style="margin: 0; color: #4a5568; font-size: 14px;"><strong>New Version:</strong> ${newVersionNumber}</p>
      </div>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">Please review and sign the new version.</p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #1B3A5C; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Review New Version</a>
      </div>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    toEmail,
    subject: `Document Updated: ${documentTitle} - Version ${newVersionNumber} Available`,
    plainText,
    html,
  })
}

export async function sendOverdueAlertToAdmin(params: {
  toEmail: string
  toName: string
  documentTitle: string
  overdueCount: number
  appUrl: string
}): Promise<void> {
  const { toEmail, toName, documentTitle, overdueCount, appUrl } = params

  const actionUrl = getActionUrl(appUrl, '/assignments')

  const plainText = `
Hello ${toName},

There are ${overdueCount} overdue assignment(s) for document: ${documentTitle}

Please review and take action on these overdue documents.

Visit your dashboard: ${actionUrl}

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Document Compliance Platform</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${escapeHtml(toName)}</strong>,</p>

      <div style="background: #FEE; border-left: 4px solid #D32F2F; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #C62828; font-weight: bold; font-size: 16px;">⚠️ Overdue Assignments Alert</p>
      </div>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">There are <strong>${overdueCount} overdue assignment(s)</strong> for document: <strong>${escapeHtml(documentTitle)}</strong></p>

      <p style="margin: 0 0 20px; font-size: 14px; color: #4a5568;">Please review and take action on these overdue documents.</p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #D32F2F; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">View Assignments</a>
      </div>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    toEmail,
    subject: `Alert: ${overdueCount} Overdue Assignment(s) - ${documentTitle}`,
    plainText,
    html,
  })
}

export async function sendEscalationEmail(params: {
  toEmail: string
  toName: string
  overdueUsers: Array<{ name: string; documentTitle: string; deadline?: string; daysOverdue: number }>
  appUrl: string
}): Promise<void> {
  const { toEmail, toName, overdueUsers, appUrl } = params

  const actionUrl = getActionUrl(appUrl, '/assignments')

  const userRows = overdueUsers
    .map(
      (u) =>
        `<tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; color: #4a5568; font-size: 14px;">${escapeHtml(u.name)}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; color: #4a5568; font-size: 14px;">${escapeHtml(u.documentTitle)}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; color: #4a5568; font-size: 14px;">${u.deadline ? new Date(u.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</td>
        <td style="padding: 12px; color: #C62828; font-weight: bold; font-size: 14px;">${u.daysOverdue} days</td>
      </tr>`,
    )
    .join('')

  const plainText = `
Hello ${toName},

${overdueUsers.length} user(s) in your section have overdue document acknowledgments that require immediate attention.

${overdueUsers.map((u) => `- ${u.name}: ${u.documentTitle} (${u.daysOverdue} days overdue)`).join('\n')}

Please visit your dashboard to take action.

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Escalation Alert</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${escapeHtml(toName)}</strong>,</p>

      <div style="background: #FEE; border-left: 4px solid #D32F2F; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #C62828; font-weight: bold; font-size: 16px;">⚠️ ${overdueUsers.length} Overdue Assignment(s)</p>
      </div>

      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">Users in your section have overdue document acknowledgments:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f9fafb;">
        <thead>
          <tr style="background: #f0f4f8; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 12px; text-align: left; color: #2d3748; font-weight: bold; border-right: 1px solid #e2e8f0; font-size: 14px;">User</th>
            <th style="padding: 12px; text-align: left; color: #2d3748; font-weight: bold; border-right: 1px solid #e2e8f0; font-size: 14px;">Document</th>
            <th style="padding: 12px; text-align: left; color: #2d3748; font-weight: bold; border-right: 1px solid #e2e8f0; font-size: 14px;">Deadline</th>
            <th style="padding: 12px; text-align: left; color: #2d3748; font-weight: bold; font-size: 14px;">Days Overdue</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #D32F2F; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Review Assignments</a>
      </div>

      <p style="margin: 20px 0 0; font-size: 13px; color: #718096;">Please take immediate action to ensure compliance.</p>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({
    toEmail,
    subject: `Alert: ${overdueUsers.length} Overdue Assignment(s) in Your Section`,
    plainText,
    html,
  })
}

// Helper to escape HTML entities
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}

export { sendEmail }
