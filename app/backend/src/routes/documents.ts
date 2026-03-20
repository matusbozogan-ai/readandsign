import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'

type SigningCondition = 'none' | 'time' | 'download' | 'time_and_download'

interface CreateDocumentRequest {
  title: string
  docNumber?: string
  category?: string
  issuer?: string
  sectionId?: string
  validityDays?: number
  signingCondition?: SigningCondition
  signingConditionSeconds?: number
  customerId?: string
}

interface UpdateDocumentRequest {
  title?: string
  docNumber?: string
  category?: string
  issuer?: string
  validityDays?: number
  signingCondition?: SigningCondition
  signingConditionSeconds?: number
  customerId?: string | null
}

interface PublishRequest {
  versionNumber: number
  propagateAssignments?: boolean
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads'

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const ALLOWED_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.xlsx']

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const EXT_FILETYPE: Record<string, string> = {
  '.pdf': 'pdf',
  '.pptx': 'pptx',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
}

function detectExtension(originalFilename: string | undefined | null): string {
  if (!originalFilename) return '.pdf'
  const ext = path.extname(originalFilename).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : '.pdf'
}

export default async function documentRoutes(app: FastifyInstance) {
  // GET /api/documents - List all documents with version stats
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const documents = await queryMany(
        `SELECT d.id, d.title, d.doc_number, d.category, d.issuer, d.created_at, d.validity_days,
                d.signing_condition, d.signing_condition_seconds,
                d.customer_id, c.name as customer_name,
                u.name as created_by_name,
                MAX(dv.version_number) as latest_version,
                (SELECT status FROM document_versions WHERE document_id = d.id ORDER BY version_number DESC LIMIT 1) as latest_status,
                (SELECT id FROM document_versions WHERE document_id = d.id AND status = 'published' ORDER BY version_number DESC LIMIT 1) as latest_version_id,
                COUNT(DISTINCT CASE WHEN dv.status = 'published' THEN a.id END) as total_assignments,
                COUNT(DISTINCT CASE WHEN dv.status = 'published' THEN sr.id END) as total_signed
         FROM documents d
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN customers c ON d.customer_id = c.id
         LEFT JOIN document_versions dv ON d.id = dv.document_id
         LEFT JOIN assignments a ON dv.id = a.document_version_id AND dv.status = 'published'
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id AND dv.status = 'published'
         GROUP BY d.id, u.name, c.name
         ORDER BY d.created_at DESC`,
      )

      return reply.status(200).send(
        documents.map((d: any) => {
          const totalAssignments = parseInt(d.total_assignments) || 0
          const totalSigned = parseInt(d.total_signed) || 0
          const signedPercent = totalAssignments > 0 ? Math.round((totalSigned / totalAssignments) * 100) : 0

          return {
            id: d.id,
            title: d.title,
            docNumber: d.doc_number,
            category: d.category,
            issuer: d.issuer,
            validityDays: d.validity_days,
            signingCondition: d.signing_condition || 'time',
            signingConditionSeconds: d.signing_condition_seconds ?? 10,
            customerId: d.customer_id || null,
            customerName: d.customer_name || null,
            latestVersion: d.latest_version,
            latestVersionId: d.latest_version_id || null,
            latestStatus: d.latest_status || 'draft',
            totalAssignments,
            totalSigned,
            signedPercent,
            createdBy: d.created_by_name,
            createdAt: d.created_at,
          }
        }),
      )
    },
  )

  // POST /api/documents - Create document (admin only)
  app.post<{ Body: CreateDocumentRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { title, docNumber, category, issuer, sectionId, validityDays, signingCondition, signingConditionSeconds, customerId } = req.body

      if (!title) {
        return reply.status(400).send({ error: 'Title is required' })
      }

      const validConditions: SigningCondition[] = ['none', 'time', 'download', 'time_and_download']
      const condition: SigningCondition = signingCondition && validConditions.includes(signingCondition)
        ? signingCondition
        : 'time'

      // Get user's organisation
      const user = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [
        req.user.userId,
      ])
      if (!user) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const documentId = uuidv4()

      try {
        await query(
          `INSERT INTO documents (id, organisation_id, section_id, title, doc_number, category, issuer, created_by, validity_days, signing_condition, signing_condition_seconds, customer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [documentId, user.organisation_id, sectionId || null, title, docNumber || null, category || null, issuer || null, req.user.userId, validityDays || null, condition, signingConditionSeconds ?? 10, customerId || null],
        )

        // Log creation
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'CREATE_DOCUMENT', 'document', documentId, req.ip],
        )

        return reply.status(201).send({ id: documentId, title })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/documents/:id - Get document with versions
  app.get<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const document = await queryOne<any>(
        `SELECT d.*, u.name as created_by_name, c.name as customer_name
         FROM documents d
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN customers c ON d.customer_id = c.id
         WHERE d.id = $1`,
        [id],
      )

      if (!document) {
        return reply.status(404).send({ error: 'Document not found' })
      }

      const versions = await queryMany(
        `SELECT id, version_number, revision, effective_date, status, published_at
         FROM document_versions
         WHERE document_id = $1
         ORDER BY version_number DESC`,
        [id],
      )

      return reply.status(200).send({
        id: document.id,
        title: document.title,
        docNumber: document.doc_number,
        category: document.category,
        issuer: document.issuer,
        validityDays: document.validity_days,
        signingCondition: document.signing_condition || 'time',
        signingConditionSeconds: document.signing_condition_seconds ?? 10,
        customerId: document.customer_id || null,
        customerName: document.customer_name || null,
        createdBy: document.created_by_name,
        createdAt: document.created_at,
        versions: versions.map((v: any) => ({
          id: v.id,
          versionNumber: v.version_number,
          revision: v.revision,
          effectiveDate: v.effective_date,
          status: v.status,
          publishedAt: v.published_at,
        })),
      })
    },
  )

  // PUT /api/documents/:id - Update document metadata
  app.put<{ Params: { id: string }; Body: UpdateDocumentRequest }>(
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
      const { title, docNumber, category, issuer, validityDays, signingCondition, signingConditionSeconds, customerId } = req.body

      const document = await queryOne<any>(`SELECT id FROM documents WHERE id = $1`, [id])
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' })
      }

      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (title !== undefined) {
        updates.push(`title = $${paramIndex++}`)
        params.push(title)
      }
      if (docNumber !== undefined) {
        updates.push(`doc_number = $${paramIndex++}`)
        params.push(docNumber)
      }
      if (category !== undefined) {
        updates.push(`category = $${paramIndex++}`)
        params.push(category)
      }
      if (issuer !== undefined) {
        updates.push(`issuer = $${paramIndex++}`)
        params.push(issuer)
      }
      if (validityDays !== undefined) {
        updates.push(`validity_days = $${paramIndex++}`)
        params.push(validityDays)
      }
      if (signingCondition !== undefined) {
        const validConditions: SigningCondition[] = ['none', 'time', 'download', 'time_and_download']
        if (!validConditions.includes(signingCondition)) {
          return reply.status(400).send({ error: 'Invalid signing condition' })
        }
        updates.push(`signing_condition = $${paramIndex++}`)
        params.push(signingCondition)
      }
      if (signingConditionSeconds !== undefined) {
        updates.push(`signing_condition_seconds = $${paramIndex++}`)
        params.push(signingConditionSeconds)
      }
      if (customerId !== undefined) {
        updates.push(`customer_id = $${paramIndex++}`)
        params.push(customerId || null)
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'No updates provided' })
      }

      params.push(id)
      const query_text = `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramIndex}`

      try {
        await query(query_text, params)

        // Log update
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'UPDATE_DOCUMENT', 'document', id, req.ip],
        )

        return reply.status(200).send({ id, message: 'Document updated' })
      } catch (err) {
        throw err
      }
    },
  )

  // DELETE /api/documents/:id - Delete entire document (super_admin only)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Only super admins can delete documents' })
      }

      const { id } = req.params

      const document = await queryOne<any>(`SELECT id, title FROM documents WHERE id = $1`, [id])
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' })
      }

      // Collect file paths before deleting DB records
      const versions = await queryMany<any>(
        `SELECT file_path FROM document_versions WHERE document_id = $1`,
        [id],
      )

      try {
        // Delete document (cascades to versions, assignments, signing_records, read_events)
        await query(`DELETE FROM documents WHERE id = $1`, [id])

        // Clean up files from disk (best-effort — don't fail if file is already gone)
        for (const v of versions) {
          try {
            if (v.file_path && fs.existsSync(v.file_path)) {
              fs.unlinkSync(v.file_path)
            }
          } catch {
            // ignore individual file errors
          }
        }

        // Log deletion
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'DELETE_DOCUMENT',
            'document',
            id,
            JSON.stringify({ title: document.title, versionsRemoved: versions.length }),
            req.ip,
          ],
        )

        return reply.status(200).send({ message: 'Document deleted', id })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/documents/:id/upload - Upload new version of document
  app.post<{ Params: { id: string } }>(
    '/:id/upload',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params

      const document = await queryOne<any>(`SELECT id FROM documents WHERE id = $1`, [id])
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' })
      }

      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' })
      }

      try {
        const buffer = await data.toBuffer()
        const fileHash = createHash('sha256').update(buffer).digest('hex')

        // Detect file type from original filename
        const ext = detectExtension(data.filename)
        const fileType = EXT_FILETYPE[ext] || 'pdf'

        // Get next version number
        const lastVersion = await queryOne<any>(
          `SELECT MAX(version_number) as max_version FROM document_versions WHERE document_id = $1`,
          [id],
        )
        const nextVersion = (lastVersion?.max_version || 0) + 1

        // Save file with correct extension
        const filename = `${id}_v${nextVersion}_${Date.now()}${ext}`
        const filepath = path.join(UPLOAD_DIR, filename)
        fs.writeFileSync(filepath, buffer)

        const versionId = uuidv4()
        const today = new Date().toISOString().split('T')[0]

        // Create version record with file_type
        await query(
          `INSERT INTO document_versions (id, document_id, version_number, file_path, file_hash, status, effective_date, file_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [versionId, id, nextVersion, filepath, fileHash, 'draft', today, fileType],
        )

        // Log upload
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'UPLOAD_DOCUMENT_VERSION',
            'document_version',
            versionId,
            JSON.stringify({ versionNumber: nextVersion, fileHash }),
            req.ip,
          ],
        )

        return reply.status(201).send({
          id: versionId,
          versionNumber: nextVersion,
          status: 'draft',
          filePath: filepath,
          fileHash,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/documents/:id/file - Get document file
  app.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/:id/file',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params
      const { version } = req.query

      let versionData: any
      if (version) {
        versionData = await queryOne(
          `SELECT file_path, file_type FROM document_versions WHERE document_id = $1 AND version_number = $2`,
          [id, parseInt(version)],
        )
      } else {
        versionData = await queryOne(
          `SELECT file_path, file_type FROM document_versions WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
          [id],
        )
      }

      if (!versionData) {
        return reply.status(404).send({ error: 'Document version not found' })
      }

      const filePath = (versionData as any).file_path
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File not found' })
      }

      // Detect MIME type from stored file_type or fall back to extension
      const storedType = (versionData as any).file_type || 'pdf'
      const ext = `.${storedType}` as string
      const mimeType = MIME_TYPES[ext] || MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      const downloadFilename = `document${ext}`

      // PDF can be viewed inline; Office formats must be forced as attachments
      // so browsers don't try (and fail) to render them in-page
      const disposition = storedType === 'pdf' ? 'inline' : 'attachment'

      const buffer = fs.readFileSync(filePath)
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', `${disposition}; filename="${downloadFilename}"`)
        .send(buffer)
    },
  )

  // POST /api/documents/:id/publish - Publish a version with optional assignment propagation
  app.post<{ Params: { id: string }; Body: PublishRequest }>(
    '/:id/publish',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params
      const { versionNumber, propagateAssignments = false } = req.body

      const versionData = await queryOne<any>(
        `SELECT id FROM document_versions WHERE document_id = $1 AND version_number = $2`,
        [id, versionNumber],
      )

      if (!versionData) {
        return reply.status(404).send({ error: 'Version not found' })
      }

      try {
        // Publish the version
        await query(
          `UPDATE document_versions SET status = $1, published_at = NOW()
           WHERE document_id = $2 AND version_number = $3`,
          ['published', id, versionNumber],
        )

        let newAssignmentCount = 0

        // Propagate assignments if requested
        if (propagateAssignments) {
          // Find the previous published version
          const previousVersion = await queryOne<any>(
            `SELECT id, version_number FROM document_versions
             WHERE document_id = $1 AND status = 'published' AND version_number < $2
             ORDER BY version_number DESC LIMIT 1`,
            [id, versionNumber],
          )

          if (previousVersion) {
            // Find all assignments for the previous version
            const previousAssignments = await queryMany<any>(
              `SELECT DISTINCT user_id FROM assignments
               WHERE document_version_id = $1`,
              [previousVersion.id],
            )

            // Create new assignments for each user (skip duplicates)
            for (const assignment of previousAssignments) {
              const assignmentId = uuidv4()
              try {
                await query(
                  `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, status)
                   VALUES ($1, $2, $3, $4, 'pending')`,
                  [assignmentId, versionData.id, assignment.user_id, req.user.userId],
                )
                newAssignmentCount++

                // Log creation
                await query(
                  `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [req.user.userId, 'CREATE_ASSIGNMENT', 'assignment', assignmentId, req.ip],
                )
              } catch (err: any) {
                // Skip duplicates
                if (err.code !== '23505') {
                  throw err
                }
              }
            }

            // Log propagation
            await query(
              `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                req.user.userId,
                'PROPAGATE_ASSIGNMENTS',
                'document_version',
                versionData.id,
                JSON.stringify({
                  fromVersion: previousVersion.version_number,
                  toVersion: versionNumber,
                  assignmentCount: newAssignmentCount,
                }),
                req.ip,
              ],
            )
          }
        }

        // Log publication
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'PUBLISH_DOCUMENT_VERSION', 'document_version', versionData.id, req.ip],
        )

        return reply.status(200).send({
          message: 'Version published',
          newAssignments: newAssignmentCount,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/documents/:id/versions - Get version history with assignment counts
  app.get<{ Params: { id: string } }>(
    '/:id/versions',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const versions = await queryMany<any>(
        `SELECT
          dv.id, dv.version_number, dv.revision, dv.effective_date, dv.status, dv.published_at, dv.file_hash, dv.file_type,
          COUNT(DISTINCT a.id) as assignment_count,
          COUNT(DISTINCT sr.id) as signed_count
        FROM document_versions dv
        LEFT JOIN assignments a ON dv.id = a.document_version_id
        LEFT JOIN signing_records sr ON a.id = sr.assignment_id
        WHERE dv.document_id = $1
        GROUP BY dv.id
        ORDER BY dv.version_number DESC`,
        [id],
      )

      return reply.status(200).send(
        versions.map((v: any) => ({
          id: v.id,
          versionNumber: v.version_number,
          revision: v.revision,
          effectiveDate: v.effective_date,
          status: v.status,
          publishedAt: v.published_at,
          fileHash: v.file_hash,
          fileType: v.file_type || 'pdf',
          assignmentCount: parseInt(v.assignment_count) || 0,
          signedCount: parseInt(v.signed_count) || 0,
          pendingCount: (parseInt(v.assignment_count) || 0) - (parseInt(v.signed_count) || 0),
        })),
      )
    },
  )

  // GET /api/documents/:documentVersionId/assignments - Get all assignments for a document version
  app.get<{ Params: { documentVersionId: string } }>(
    '/:documentVersionId/assignments',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { documentVersionId } = req.params

      // Check authorization - section admins only see their section's users
      let whereClause = ''
      const params: any[] = [documentVersionId]

      if (req.user.role === 'section_admin') {
        const adminUser = await queryOne<any>(
          `SELECT section_id FROM users WHERE id = $1`,
          [req.user.userId],
        )
        if (adminUser?.section_id) {
          whereClause = 'AND u.section_id = $2'
          params.push(adminUser.section_id)
        }
      }

      const assignments = await queryMany<any>(
        `SELECT
          a.id, a.user_id, a.status, a.deadline, a.created_at,
          u.name as user_name, u.email as user_email, u.employee_number,
          sr.signed_at, sr.method as signing_method,
          re.scroll_depth, re.time_spent_seconds
        FROM assignments a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN signing_records sr ON a.id = sr.assignment_id
        LEFT JOIN read_events re ON a.id = re.assignment_id
        WHERE a.document_version_id = $1 ${whereClause}
        ORDER BY u.name ASC`,
        params,
      )

      return reply.status(200).send(
        assignments.map((a: any) => ({
          id: a.id,
          userId: a.user_id,
          userName: a.user_name,
          userEmail: a.user_email,
          employeeNumber: a.employee_number,
          status: a.status,
          deadline: a.deadline,
          createdAt: a.created_at,
          signedAt: a.signed_at,
          signingMethod: a.signing_method,
          scrollDepth: a.scroll_depth,
          timeSpentSeconds: a.time_spent_seconds,
        })),
      )
    },
  )

  // POST /api/documents/:id/upload-and-publish - Upload new version and publish in one step
  app.post<{ Params: { id: string } }>(
    '/:id/upload-and-publish',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params

      const document = await queryOne<any>(`SELECT id FROM documents WHERE id = $1`, [id])
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' })
      }

      try {
        // Parse all multipart parts in a single pass (file + fields)
        const fields: any = {}
        let buffer: Buffer | null = null
        let originalFilename: string | undefined

        for await (const part of req.parts()) {
          if (part.type === 'file') {
            buffer = await part.toBuffer()
            originalFilename = part.filename
          } else if (part.type === 'field') {
            fields[part.fieldname] = part.value
          }
        }

        if (!buffer) {
          return reply.status(400).send({ error: 'No file provided' })
        }
        const fileHash = createHash('sha256').update(buffer).digest('hex')

        // Detect file type from original filename
        const ext = detectExtension(originalFilename)
        const fileType = EXT_FILETYPE[ext] || 'pdf'

        // Get next version number
        const lastVersion = await queryOne<any>(
          `SELECT MAX(version_number) as max_version FROM document_versions WHERE document_id = $1`,
          [id],
        )
        const nextVersion = (lastVersion?.max_version || 0) + 1

        // Save file with correct extension
        const filename = `${id}_v${nextVersion}_${Date.now()}${ext}`
        const filepath = path.join(UPLOAD_DIR, filename)
        fs.writeFileSync(filepath, buffer)

        const versionId = uuidv4()
        const effectiveDate = fields.effectiveDate || new Date().toISOString().split('T')[0]

        // Create and publish version record with file_type
        await query(
          `INSERT INTO document_versions (id, document_id, version_number, revision, file_path, file_hash, status, effective_date, published_at, file_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
          [versionId, id, nextVersion, fields.revision || null, filepath, fileHash, 'published', effectiveDate, fileType],
        )

        let newAssignmentCount = 0

        // Propagate assignments if requested
        if (fields.propagateAssignments === 'true') {
          // Find the previous published version
          const previousVersion = await queryOne<any>(
            `SELECT id, version_number FROM document_versions
             WHERE document_id = $1 AND status = 'published' AND version_number < $2
             ORDER BY version_number DESC LIMIT 1`,
            [id, nextVersion],
          )

          if (previousVersion) {
            // Find all assignments for the previous version
            const previousAssignments = await queryMany<any>(
              `SELECT DISTINCT user_id FROM assignments
               WHERE document_version_id = $1`,
              [previousVersion.id],
            )

            // Create new assignments for each user
            for (const assignment of previousAssignments) {
              const assignmentId = uuidv4()
              try {
                await query(
                  `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, status)
                   VALUES ($1, $2, $3, $4, 'pending')`,
                  [assignmentId, versionId, assignment.user_id, req.user.userId],
                )
                newAssignmentCount++

                // Log creation
                await query(
                  `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [req.user.userId, 'CREATE_ASSIGNMENT', 'assignment', assignmentId, req.ip],
                )
              } catch (err: any) {
                if (err.code !== '23505') {
                  throw err
                }
              }
            }

            // Log propagation
            await query(
              `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                req.user.userId,
                'PROPAGATE_ASSIGNMENTS',
                'document_version',
                versionId,
                JSON.stringify({
                  fromVersion: previousVersion.version_number,
                  toVersion: nextVersion,
                  assignmentCount: newAssignmentCount,
                }),
                req.ip,
              ],
            )
          }
        }

        // Log upload
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'UPLOAD_DOCUMENT_VERSION',
            'document_version',
            versionId,
            JSON.stringify({ versionNumber: nextVersion, fileHash }),
            req.ip,
          ],
        )

        // Log publication
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'PUBLISH_DOCUMENT_VERSION', 'document_version', versionId, req.ip],
        )

        return reply.status(201).send({
          id: versionId,
          versionNumber: nextVersion,
          status: 'published',
          filePath: filepath,
          fileHash,
          newAssignments: newAssignmentCount,
        })
      } catch (err) {
        throw err
      }
    },
  )
}
