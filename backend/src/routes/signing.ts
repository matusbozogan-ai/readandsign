import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'
import { authenticate } from '../middleware'
import { query, queryOne } from '../db'
import { verifyPassword } from '../auth'
import bcryptjs from 'bcryptjs'
import { generateSigningCertificate } from '../certificate'
import { createNotification } from './notifications'

interface SignDocumentRequest {
  assignmentId: string
  credential: string
  method: string
}

const SIGNING_SECRET = process.env.SIGNING_SECRET || 'change_me_signing_secret'

export default async function signingRoutes(app: FastifyInstance) {
  // POST /api/signing/sign - Sign a document
  app.post<{ Body: SignDocumentRequest }>(
    '/sign',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId, credential, method = 'password' } = req.body

      if (!assignmentId || !credential) {
        return reply.status(400).send({ error: 'assignmentId and credential are required' })
      }

      if (method !== 'password' && method !== 'pin') {
        return reply.status(400).send({ error: 'method must be "password" or "pin"' })
      }

      try {
        // Verify assignment belongs to user
        const assignment = await queryOne<any>(
          `SELECT a.id, a.user_id FROM assignments a WHERE a.id = $1`,
          [assignmentId],
        )

        if (!assignment) {
          return reply.status(404).send({ error: 'Assignment not found' })
        }

        if (assignment.user_id !== req.user.userId) {
          return reply.status(403).send({ error: 'Not authorized' })
        }

        // Check if already signed
        const existingSigning = await queryOne<any>(
          `SELECT id FROM signing_records WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (existingSigning) {
          return reply.status(409).send({ error: 'Document already signed' })
        }

        // Get read event to verify reading requirements
        const readEvent = await queryOne<any>(
          `SELECT scroll_depth, time_spent_seconds FROM read_events WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (!readEvent) {
          return reply.status(400).send({ error: 'Document has not been read' })
        }

        // Only requirement: document must have been open for at least 10 seconds
        if (readEvent.time_spent_seconds < 10) {
          return reply.status(400).send({ error: 'Document must be viewed for at least 10 seconds before signing' })
        }

        // Verify user password or PIN based on method
        const user = await queryOne<any>(
          `SELECT password_hash, pin_hash FROM users WHERE id = $1`,
          [req.user.userId],
        )

        if (!user) {
          return reply.status(401).send({ error: 'User not found' })
        }

        let credentialValid = false

        if (method === 'password') {
          credentialValid = await verifyPassword(credential, user.password_hash)
          if (!credentialValid) {
            return reply.status(401).send({ error: 'Invalid password' })
          }
        } else if (method === 'pin') {
          if (!user.pin_hash) {
            return reply.status(400).send({ error: 'No PIN configured. Please set a PIN in your profile first.' })
          }
          credentialValid = await bcryptjs.compare(credential, user.pin_hash)
          if (!credentialValid) {
            return reply.status(401).send({ error: 'Invalid PIN' })
          }
        }

        // Create signing hash
        const timestamp = new Date().toISOString()
        const signingData = `${assignmentId}:${req.user.userId}:${timestamp}:${method}:${SIGNING_SECRET}`
        const signingHash = createHash('sha256').update(signingData).digest('hex')

        // Create signing record
        const signingId = uuidv4()
        await query(
          `INSERT INTO signing_records (id, assignment_id, user_id, method, signing_hash, ip_address, signed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [signingId, assignmentId, req.user.userId, method || 'password', signingHash, req.ip, timestamp],
        )

        // Update assignment status
        await query(`UPDATE assignments SET status = 'signed' WHERE id = $1`, [assignmentId])

        // Log signing
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'SIGN_DOCUMENT',
            'assignment',
            assignmentId,
            JSON.stringify({ method, timestamp }),
            req.ip,
          ],
        )

        // In-app notification — confirm signing to the user
        const signedDocInfo = await queryOne<any>(
          `SELECT d.title, d.doc_number FROM documents d
           JOIN document_versions dv ON d.id = dv.document_id
           JOIN assignments a ON dv.id = a.document_version_id
           WHERE a.id = $1`,
          [assignmentId],
        )
        createNotification({
          userId: req.user.userId,
          type: 'document_signed',
          title: 'Document signed',
          message: signedDocInfo
            ? (signedDocInfo.doc_number
                ? `You have successfully signed "${signedDocInfo.title}" (#${signedDocInfo.doc_number}).`
                : `You have successfully signed "${signedDocInfo.title}".`)
            : 'You have successfully signed a document.',
          entityType: 'assignment',
          entityId: assignmentId,
        }).catch((err) => console.error('Failed to create signing notification:', err))

        return reply.status(200).send({
          id: signingId,
          assignmentId,
          signedAt: timestamp,
          signingHash,
          method: method || 'password',
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/signing/:id - Get signing record
  app.get<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const record = await queryOne<any>(
        `SELECT sr.*, a.user_id FROM signing_records sr
         JOIN assignments a ON sr.assignment_id = a.id
         WHERE sr.id = $1`,
        [id],
      )

      if (!record) {
        return reply.status(404).send({ error: 'Signing record not found' })
      }

      // Check permission
      if (req.user.role === 'user' && record.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      return reply.status(200).send({
        id: record.id,
        assignmentId: record.assignment_id,
        userId: record.user_id,
        method: record.method,
        signingHash: record.signing_hash,
        ipAddress: record.ip_address,
        signedAt: record.signed_at,
        createdAt: record.created_at,
      })
    },
  )

  // POST /api/signing/verify - Verify a signing hash
  app.post<{ Body: { signingHash: string; assignmentId: string } }>(
    '/verify',
    async (req, reply) => {
      const { signingHash, assignmentId } = req.body

      if (!signingHash || !assignmentId) {
        return reply.status(400).send({ error: 'signingHash and assignmentId are required' })
      }

      try {
        const record = await queryOne<any>(
          `SELECT signing_hash FROM signing_records WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (!record) {
          return reply.status(404).send({ error: 'No signing record found' })
        }

        const isValid = record.signing_hash === signingHash

        return reply.status(200).send({
          valid: isValid,
          message: isValid ? 'Signature verified' : 'Signature invalid',
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/signing/:assignmentId/certificate - Download signing certificate PDF
  app.get<{ Params: { assignmentId: string } }>(
    '/:assignmentId/certificate',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId } = req.params

      try {
        // Load signing_record JOIN assignments JOIN document_versions JOIN documents JOIN users JOIN sections JOIN organisations
        const signingRecord = await queryOne<any>(
          `SELECT sr.*, a.user_id, a.document_version_id,
                  dv.version_number, dv.revision, dv.effective_date,
                  d.title, d.doc_number,
                  u.name, u.email, u.employee_number, u.section_id,
                  s.name as section_name,
                  o.name as organisation_name
           FROM signing_records sr
           JOIN assignments a ON sr.assignment_id = a.id
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d ON dv.document_id = d.id
           JOIN users u ON sr.user_id = u.id
           LEFT JOIN sections s ON u.section_id = s.id
           LEFT JOIN organisations o ON u.organisation_id = o.id
           WHERE sr.assignment_id = $1`,
          [assignmentId],
        )

        if (!signingRecord) {
          return reply.status(404).send({ error: 'Signing record not found' })
        }

        // Check permission
        if (req.user.role === 'user' && signingRecord.user_id !== req.user.userId) {
          return reply.status(403).send({ error: 'Not authorized' })
        }

        // Generate PDF
        const pdfBuffer = await generateSigningCertificate({
          organisationName: signingRecord.organisation_name || 'Organisation',
          documentTitle: signingRecord.title,
          documentNumber: signingRecord.doc_number || 'N/A',
          documentVersion: signingRecord.version_number,
          revision: signingRecord.revision || '1',
          effectiveDate: signingRecord.effective_date || new Date().toISOString().split('T')[0],
          userName: signingRecord.name,
          userEmail: signingRecord.email,
          employeeNumber: signingRecord.employee_number || undefined,
          sectionName: signingRecord.section_name || undefined,
          signedAt: signingRecord.signed_at,
          signingMethod: signingRecord.method === 'password' ? 'Password Authentication' : 'PIN Authentication',
          signingHash: signingRecord.signing_hash,
          ipAddress: signingRecord.ip_address || 'Unknown',
          assignmentId,
        })

        // Log to audit log
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'DOWNLOAD_CERTIFICATE', 'assignment', assignmentId, req.ip],
        )

        // Send PDF response
        reply.type('application/pdf')
        reply.header('Content-Disposition', `attachment; filename="certificate-${assignmentId.substring(0, 8)}.pdf"`)
        return reply.send(pdfBuffer)
      } catch (err) {
        throw err
      }
    },
  )
}
