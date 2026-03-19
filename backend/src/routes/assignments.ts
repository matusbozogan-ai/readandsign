import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'
import { sendAssignmentNotification, sendReminderEmail, sendOverdueAlertToAdmin } from '../email'
import { createNotification } from './notifications'

interface CreateAssignmentRequest {
  documentVersionId: string
  userIds?: string[]
  groupIds?: string[]
  deadline?: string
}

interface UpdateAssignmentRequest {
  deadline?: string
  status?: string
}

export default async function assignmentRoutes(app: FastifyInstance) {
  // GET /api/assignments - List assignments
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      let assignments: any[]

      if (req.user.role === 'user') {
        // Regular users see only their assignments
        assignments = await queryMany(
          `SELECT a.id, a.document_version_id, a.deadline, a.status, a.created_at,
                  d.title, d.doc_number, dv.version_number,
                  re.scroll_depth, re.completed_at, re.time_spent_seconds,
                  CASE WHEN sr.id IS NOT NULL THEN true ELSE false END as signed
           FROM assignments a
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d ON dv.document_id = d.id
           LEFT JOIN read_events re ON a.id = re.assignment_id
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE a.user_id = $1
           ORDER BY a.created_at DESC`,
          [req.user.userId],
        )
      } else {
        // Admins see all assignments in their organization only
        const currentUser = await queryOne<any>(
          `SELECT organisation_id FROM users WHERE id = $1`,
          [req.user.userId],
        )
        const orgId = currentUser?.organisation_id || req.user.organisationId

        assignments = await queryMany(
          `SELECT a.id, a.document_version_id, a.deadline, a.status, a.created_at,
                  d.title, d.doc_number, dv.version_number, u.name as assigned_to,
                  re.scroll_depth, re.completed_at, re.time_spent_seconds,
                  CASE WHEN sr.id IS NOT NULL THEN true ELSE false END as signed
           FROM assignments a
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d ON dv.document_id = d.id
           JOIN users u ON a.user_id = u.id
           LEFT JOIN read_events re ON a.id = re.assignment_id
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE d.organisation_id = $1
           ORDER BY a.created_at DESC`,
          [orgId],
        )
      }

      return reply.status(200).send(
        assignments.map((a) => ({
          id: a.id,
          documentVersionId: a.document_version_id,
          documentTitle: a.title,
          documentNumber: a.doc_number,
          versionNumber: a.version_number,
          assignedTo: a.assigned_to,
          deadline: a.deadline,
          status: a.status,
          scrollDepth: a.scroll_depth,
          timeSpentSeconds: a.time_spent_seconds,
          completedAt: a.completed_at,
          signed: a.signed,
          createdAt: a.created_at,
        })),
      )
    },
  )

  // POST /api/assignments - Create assignment (admin only)
  app.post<{ Body: CreateAssignmentRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { documentVersionId, userIds = [], groupIds = [], deadline } = req.body

      if (!documentVersionId) {
        return reply.status(400).send({ error: 'documentVersionId is required' })
      }

      if (userIds.length === 0 && groupIds.length === 0) {
        return reply.status(400).send({ error: 'At least one user or group is required' })
      }

      // Verify document version exists
      const docVersion = await queryOne<any>(
        `SELECT id FROM document_versions WHERE id = $1`,
        [documentVersionId],
      )
      if (!docVersion) {
        return reply.status(404).send({ error: 'Document version not found' })
      }

      try {
        const createdIds: string[] = []

        // Get document info for email
        const documentInfo = await queryOne<any>(
          `SELECT d.id, d.title, d.doc_number, d.issuer FROM documents d
           JOIN document_versions dv ON d.id = dv.document_id
           WHERE dv.id = $1`,
          [documentVersionId],
        )

        // Get admin name for email
        const adminInfo = await queryOne<any>(
          `SELECT name FROM users WHERE id = $1`,
          [req.user.userId],
        )

        const adminName = adminInfo?.name || 'Administrator'
        const appUrl = process.env.APP_URL || 'http://localhost'

        // Collect all user IDs
        const allUserIds = new Set(userIds)
        for (const groupId of groupIds) {
          const groupUsers = await queryMany<any>(
            `SELECT user_id FROM group_members WHERE group_id = $1`,
            [groupId],
          )
          groupUsers.forEach((gu) => allUserIds.add(gu.user_id))
        }

        // Create assignments
        for (const userId of allUserIds) {
          const assignmentId = uuidv4()
          try {
            await query(
              `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, deadline, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')`,
              [assignmentId, documentVersionId, userId, req.user.userId, deadline || null],
            )
            createdIds.push(assignmentId)

            // Log creation
            await query(
              `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
               VALUES ($1, $2, $3, $4, $5)`,
              [req.user.userId, 'CREATE_ASSIGNMENT', 'assignment', assignmentId, req.ip],
            )

            // Send notification email (non-blocking)
            if (documentInfo) {
              const userRow = await queryOne<any>(
                `SELECT email, name FROM users WHERE id = $1`,
                [userId],
              )
              if (userRow) {
                sendAssignmentNotification({
                  toEmail: userRow.email,
                  toName: userRow.name,
                  documentTitle: documentInfo.title,
                  documentNumber: documentInfo.doc_number,
                  issuer: documentInfo.issuer,
                  deadline: deadline || undefined,
                  assignedByName: adminName,
                  appUrl,
                }).catch((err) => console.error('Failed to send assignment email:', err))

                // In-app notification
                createNotification({
                  userId,
                  type: 'assignment_created',
                  title: 'New document assigned',
                  message: documentInfo.doc_number
                    ? `"${documentInfo.title}" (#${documentInfo.doc_number}) has been assigned to you by ${adminName}.${deadline ? ` Due ${new Date(deadline).toLocaleDateString()}.` : ''}`
                    : `"${documentInfo.title}" has been assigned to you by ${adminName}.${deadline ? ` Due ${new Date(deadline).toLocaleDateString()}.` : ''}`,
                  entityType: 'assignment',
                  entityId: assignmentId,
                }).catch((err) => console.error('Failed to create notification:', err))
              }
            }
          } catch (err: any) {
            // Skip duplicates
            if (err.code !== '23505') {
              throw err
            }
          }
        }

        return reply.status(201).send({
          created: createdIds.length,
          assignmentIds: createdIds,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/assignments/:id - Get single assignment
  app.get<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const assignment = await queryOne<any>(
        `SELECT a.*, d.id as document_id, d.title, d.doc_number,
                d.signing_condition, d.signing_condition_seconds,
                dv.version_number, dv.file_type, u.name as user_name
         FROM assignments a
         JOIN document_versions dv ON a.document_version_id = dv.id
         JOIN documents d ON dv.document_id = d.id
         JOIN users u ON a.user_id = u.id
         WHERE a.id = $1`,
        [id],
      )

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      // Check permission
      if (req.user.role === 'user' && assignment.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const readEvent = await queryOne<any>(
        `SELECT * FROM read_events WHERE assignment_id = $1`,
        [id],
      )

      const signingRecord = await queryOne<any>(
        `SELECT * FROM signing_records WHERE assignment_id = $1`,
        [id],
      )

      return reply.status(200).send({
        id: assignment.id,
        documentId: assignment.document_id,
        documentVersionId: assignment.document_version_id,
        documentTitle: assignment.title,
        documentNumber: assignment.doc_number,
        versionNumber: assignment.version_number,
        fileType: assignment.file_type || 'pdf',
        signingCondition: assignment.signing_condition || 'time',
        signingConditionSeconds: assignment.signing_condition_seconds ?? 10,
        userName: assignment.user_name,
        deadline: assignment.deadline,
        status: assignment.status,
        readEvent: readEvent
          ? {
              id: readEvent.id,
              startedAt: readEvent.started_at,
              completedAt: readEvent.completed_at,
              scrollDepth: readEvent.scroll_depth,
              pagesVisited: readEvent.pages_visited,
              timeSpentSeconds: readEvent.time_spent_seconds,
            }
          : null,
        signingRecord: signingRecord
          ? {
              id: signingRecord.id,
              method: signingRecord.method,
              signedAt: signingRecord.signed_at,
            }
          : null,
      })
    },
  )

  // PUT /api/assignments/:id - Update assignment
  app.put<{ Params: { id: string }; Body: UpdateAssignmentRequest }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params
      const { deadline, status } = req.body

      const assignment = await queryOne<any>(
        `SELECT id FROM assignments WHERE id = $1`,
        [id],
      )
      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (deadline !== undefined) {
        updates.push(`deadline = $${paramIndex++}`)
        params.push(deadline)
      }
      if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`)
        params.push(status)
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'No updates provided' })
      }

      params.push(id)
      const query_text = `UPDATE assignments SET ${updates.join(', ')} WHERE id = $${paramIndex}`

      try {
        await query(query_text, params)

        // Log update
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'UPDATE_ASSIGNMENT', 'assignment', id, req.ip],
        )

        return reply.status(200).send({ id, message: 'Assignment updated' })
      } catch (err) {
        throw err
      }
    },
  )

  // DELETE /api/assignments/:id - Delete assignment
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params

      const assignment = await queryOne<any>(
        `SELECT id FROM assignments WHERE id = $1`,
        [id],
      )
      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      try {
        await query(`DELETE FROM assignments WHERE id = $1`, [id])

        // Log deletion
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'DELETE_ASSIGNMENT', 'assignment', id, req.ip],
        )

        return reply.status(200).send({ message: 'Assignment deleted' })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/assignments/check-overdue - Update overdue assignments
  app.post(
    '/check-overdue',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Find overdue assignments
        const result = await query(
          `UPDATE assignments
           SET status = 'overdue'
           WHERE deadline < NOW() AND status NOT IN ('signed')
           RETURNING id, user_id, document_version_id`,
        )

        const count = result.rowCount || 0
        const appUrl = process.env.APP_URL || 'http://localhost'

        if (count > 0) {
          // Log the action
          await query(
            `INSERT INTO audit_log (user_id, action, entity_type, metadata, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.userId, 'CHECK_OVERDUE', 'assignment', JSON.stringify({ updatedCount: count }), req.ip],
          )

          // Send alerts to section admins for each document (non-blocking)
          const docAlerts: { [docId: string]: string[] } = {}

          for (const row of result.rows) {
            const docVersion = await queryOne<any>(
              `SELECT dv.document_id, d.title FROM document_versions dv
               JOIN documents d ON dv.document_id = d.id
               WHERE dv.id = $1`,
              [row.document_version_id],
            )

            if (docVersion) {
              if (!docAlerts[docVersion.document_id]) {
                docAlerts[docVersion.document_id] = []
              }
              docAlerts[docVersion.document_id].push(row.user_id)
            }
          }

          // Send alerts to admins
          for (const [docId, userIds] of Object.entries(docAlerts)) {
            const adminUsers = await queryMany<any>(
              `SELECT DISTINCT u.id, u.email, u.name FROM users u
               WHERE u.role IN ('super_admin', 'section_admin')`,
            )

            const docInfo = await queryOne<any>(
              `SELECT title FROM documents WHERE id = $1`,
              [docId],
            )

            for (const admin of adminUsers) {
              sendOverdueAlertToAdmin({
                toEmail: admin.email,
                toName: admin.name,
                documentTitle: docInfo?.title || 'Unknown Document',
                overdueCount: userIds.length,
                appUrl,
              }).catch((err) => console.error('Failed to send overdue alert:', err))
            }

            // In-app notification for each overdue user
            for (const userId of userIds) {
              createNotification({
                userId,
                type: 'overdue',
                title: 'Assignment overdue',
                message: `Your assignment for "${docInfo?.title || 'a document'}" is now overdue. Please complete it as soon as possible.`,
                entityType: 'document',
                entityId: docId,
              }).catch((err) => console.error('Failed to create overdue notification:', err))
            }
          }
        }

        return reply.status(200).send({ message: `Updated ${count} assignments to overdue`, count })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/assignments/:id/remind - Send reminder email to user
  app.post<{ Params: { id: string } }>(
    '/:id/remind',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params

      try {
        const assignment = await queryOne<any>(
          `SELECT a.id, a.user_id, a.deadline, a.document_version_id
           FROM assignments a
           WHERE a.id = $1`,
          [id],
        )

        if (!assignment) {
          return reply.status(404).send({ error: 'Assignment not found' })
        }

        const user = await queryOne<any>(
          `SELECT email, name FROM users WHERE id = $1`,
          [assignment.user_id],
        )

        if (!user) {
          return reply.status(404).send({ error: 'User not found' })
        }

        const docVersion = await queryOne<any>(
          `SELECT d.title, d.doc_number FROM documents d
           JOIN document_versions dv ON d.id = dv.document_id
           WHERE dv.id = $1`,
          [assignment.document_version_id],
        )

        // Calculate days until deadline
        let daysUntilDeadline: number | undefined
        if (assignment.deadline) {
          const now = new Date()
          const deadline = new Date(assignment.deadline)
          daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        }

        const appUrl = process.env.APP_URL || 'http://localhost'

        await sendReminderEmail({
          toEmail: user.email,
          toName: user.name,
          documentTitle: docVersion?.title || 'Unknown Document',
          documentNumber: docVersion?.doc_number,
          deadline: assignment.deadline,
          daysUntilDeadline,
          appUrl,
        })

        // Log action
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'SEND_REMINDER', 'assignment', id, req.ip],
        )

        return reply.status(200).send({ sent: true, toEmail: user.email })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/assignments/remind-pending - Send reminders to all unsigned users for a document
  app.post<{ Body: { documentVersionId: string } }>(
    '/remind-pending',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { documentVersionId } = req.body

      if (!documentVersionId) {
        return reply.status(400).send({ error: 'documentVersionId is required' })
      }

      try {
        // Find all unsigned assignments for this document version
        const assignments = await queryMany<any>(
          `SELECT a.id, a.user_id, a.deadline, u.email, u.name
           FROM assignments a
           JOIN users u ON a.user_id = u.id
           WHERE a.document_version_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM signing_records sr WHERE sr.assignment_id = a.id
           )`,
          [documentVersionId],
        )

        const docVersion = await queryOne<any>(
          `SELECT d.title, d.doc_number FROM documents d
           JOIN document_versions dv ON d.id = dv.document_id
           WHERE dv.id = $1`,
          [documentVersionId],
        )

        const appUrl = process.env.APP_URL || 'http://localhost'
        let sent = 0

        for (const assignment of assignments) {
          // Calculate days until deadline
          let daysUntilDeadline: number | undefined
          if (assignment.deadline) {
            const now = new Date()
            const deadline = new Date(assignment.deadline)
            daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          }

          await sendReminderEmail({
            toEmail: assignment.email,
            toName: assignment.name,
            documentTitle: docVersion?.title || 'Unknown Document',
            documentNumber: docVersion?.doc_number,
            deadline: assignment.deadline,
            daysUntilDeadline,
            appUrl,
          }).catch((err) => console.error('Failed to send reminder:', err))

          sent++
        }

        // Log action
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'SEND_REMINDER_BATCH', 'document_version', JSON.stringify({ documentVersionId, sent }), req.ip],
        )

        return reply.status(200).send({ sent })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/assignments/matrix - Compliance matrix for all users × all published docs
  app.get(
    '/matrix',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Resolve organisationId from the DB to be safe (JWT may be stale)
        const currentUser = await queryOne<any>(
          `SELECT organisation_id FROM users WHERE id = $1`,
          [req.user.userId],
        )
        const orgId = currentUser?.organisation_id || req.user.organisationId

        if (!orgId) {
          return reply.status(400).send({ error: 'Cannot determine organisation for this user' })
        }

        // Get all active users in the organisation
        const users = await queryMany<any>(
          `SELECT id, name, email, employee_number, section_id
           FROM users
           WHERE organisation_id = $1 AND active = true
           ORDER BY name`,
          [orgId],
        )

        // Get all published document versions (latest per document only)
        const documents = await queryMany<any>(
          `SELECT DISTINCT ON (d.id) d.id, d.title, d.doc_number, dv.id as version_id, dv.version_number
           FROM documents d
           JOIN document_versions dv ON d.id = dv.document_id
           WHERE dv.status = 'published' AND d.organisation_id = $1
           ORDER BY d.id, dv.version_number DESC`,
          [orgId],
        )

        // Build matrix cells
        const cells: Record<string, any> = {}

        for (const user of users) {
          for (const doc of documents) {
            const key = `${user.id}:${doc.version_id}`

            // Check assignment and signing status
            const assignment = await queryOne<any>(
              `SELECT a.id, a.deadline, a.status, sr.signed_at
               FROM assignments a
               LEFT JOIN signing_records sr ON a.id = sr.assignment_id
               WHERE a.user_id = $1 AND a.document_version_id = $2`,
              [user.id, doc.version_id],
            )

            if (!assignment) {
              cells[key] = { status: 'not_assigned' }
            } else if (assignment.signed_at) {
              cells[key] = {
                status: 'signed',
                signedAt: assignment.signed_at,
              }
            } else if (assignment.deadline && new Date(assignment.deadline) < new Date()) {
              cells[key] = {
                status: 'overdue',
                deadline: assignment.deadline,
              }
            } else {
              cells[key] = {
                status: 'pending',
                deadline: assignment.deadline,
              }
            }
          }
        }

        // Get section names
        const sections: Record<string, string> = {}
        const sectionRows = await queryMany<any>(
          `SELECT id, name FROM sections WHERE organisation_id = $1`,
          [orgId],
        )
        for (const s of sectionRows) {
          sections[s.id] = s.name
        }

        const usersWithSections = users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          employeeNumber: u.employee_number,
          sectionName: u.section_id ? sections[u.section_id] : null,
        }))

        return reply.status(200).send({
          users: usersWithSections,
          documents: documents.map((d) => ({
            id: d.id,
            title: d.title,
            docNumber: d.doc_number,
            versionId: d.version_id,
            versionNumber: d.version_number,
          })),
          cells,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/assignments/escalate/:assignmentId - Manually escalate an assignment
  app.post<{ Params: { assignmentId: string } }>(
    '/escalate/:assignmentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { assignmentId } = req.params

      try {
        // Get assignment details
        const assignment = await queryOne<any>(
          `SELECT a.*, u.email as user_email, u.name as user_name, u.section_id,
                  d.title as doc_title, dv.version_number
           FROM assignments a
           JOIN users u ON a.user_id = u.id
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d ON dv.document_id = d.id
           WHERE a.id = $1`,
          [assignmentId],
        )

        if (!assignment) {
          return reply.status(404).send({ error: 'Assignment not found' })
        }

        // Get section admin
        const sectionAdmin = await queryOne<any>(
          `SELECT email, name FROM users
           WHERE section_id = $1 AND role = 'section_admin'
           LIMIT 1`,
          [assignment.section_id],
        )

        if (sectionAdmin) {
          // Send email (non-blocking)
          const { sendEmail } = await import('../email')

          // Note: using a simple email approach for escalation
          const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1B3A5C; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">READ & SIGN</h1>
      <p style="color: #90B8D8; margin: 4px 0 0; font-size: 13px;">Escalation Notice</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 16px; color: #2d3748;">Hello <strong>${sectionAdmin.name}</strong>,</p>
      <div style="background: #FEE; border-left: 4px solid #D32F2F; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #C62828; font-weight: bold; font-size: 15px;">⚠️ Assignment Escalation</p>
      </div>
      <p style="margin: 0 0 20px; font-size: 15px; color: #4a5568;">An assignment has been manually escalated and requires your attention.</p>
      <div style="background: #f0f4f8; border-left: 4px solid #1B3A5C; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: bold; color: #2d3748; font-size: 15px;">Assignment Details</p>
        <p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>User:</strong> ${assignment.user_name}</p>
        <p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>Document:</strong> ${assignment.doc_title} (v${assignment.version_number})</p>
        <p style="margin: 0 0 8px; color: #4a5568; font-size: 14px;"><strong>Deadline:</strong> ${assignment.deadline ? new Date(assignment.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</p>
        <p style="margin: 0; color: #4a5568; font-size: 14px;"><strong>Status:</strong> ${assignment.status}</p>
      </div>
      <p style="margin: 0 0 20px; font-size: 14px; color: #4a5568;">Please take appropriate action to ensure compliance.</p>
    </div>
    <div style="padding: 16px 32px; background: #f5f7fa; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center;">
      Read and Sign Platform &nbsp;|&nbsp; This is an automated notification.
    </div>
  </div>
</body>
</html>`

          const plainText = `
An assignment has been escalated for your attention.

User: ${assignment.user_name}
Document: ${assignment.doc_title} (v${assignment.version_number})
Status: ${assignment.status}
Deadline: ${assignment.deadline ? new Date(assignment.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}

Please visit your dashboard to take action.

---
Read and Sign Platform | This is an automated notification. Do not reply to this email.
`.trim()

          // We'll send this email non-blocking
          const sendEmailFunc = (await import('../email')).sendEmail
          sendEmailFunc({
            toEmail: sectionAdmin.email,
            subject: `[ESCALATION] Assignment Overdue - ${assignment.doc_title}`,
            plainText,
            html,
          }).catch((err) => console.error('Failed to send escalation email:', err))
        }

        // Log escalation
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'ESCALATE_ASSIGNMENT',
            'assignment',
            assignmentId,
            JSON.stringify({ escalatedTo: sectionAdmin?.id || 'none' }),
            req.ip,
          ],
        )

        return reply.status(200).send({ escalated: true, notifiedAdmin: !!sectionAdmin })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/assignments/check-validity - Check and reassign expired documents
  app.post(
    '/check-validity',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Find all expired signing records
        const expiredSignings = await queryMany<any>(
          `SELECT sr.assignment_id, sr.user_id, dv.document_id, dv.id as version_id, dv.version_number, d.validity_days
           FROM signing_records sr
           JOIN assignments a ON sr.assignment_id = a.id
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d ON dv.document_id = d.id
           WHERE d.validity_days IS NOT NULL
           AND sr.signed_at + (d.validity_days || ' days')::INTERVAL < NOW()`,
        )

        let newAssignments = 0

        for (const record of expiredSignings) {
          // Check if user already has an assignment for the latest version
          const latestVersion = await queryOne<any>(
            `SELECT dv.id FROM document_versions dv
             WHERE dv.document_id = $1 AND dv.status = 'published'
             ORDER BY version_number DESC LIMIT 1`,
            [record.document_id],
          )

          if (latestVersion && latestVersion.id !== record.version_id) {
            // Check if assignment already exists
            const existing = await queryOne<any>(
              `SELECT id FROM assignments
               WHERE user_id = $1 AND document_version_id = $2`,
              [record.user_id, latestVersion.id],
            )

            if (!existing) {
              // Create new assignment
              const newAssignmentId = uuidv4()
              await query(
                `INSERT INTO assignments (id, document_version_id, user_id, status)
                 VALUES ($1, $2, $3, 'pending')`,
                [newAssignmentId, latestVersion.id, record.user_id],
              )
              newAssignments++

              // Log this reassignment
              await query(
                `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  req.user.userId,
                  'VALIDITY_REASSIGNMENT',
                  'assignment',
                  newAssignmentId,
                  JSON.stringify({ fromAssignmentId: record.assignment_id }),
                  req.ip,
                ],
              )
            }
          }
        }

        return reply.status(200).send({ newAssignments })
      } catch (err) {
        throw err
      }
    },
  )
}
