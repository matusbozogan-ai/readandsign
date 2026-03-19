import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../middleware'
import { queryMany, queryOne } from '../db'

export default async function auditRoutes(app: FastifyInstance) {
  // GET /api/audit - Get audit log with filtering and pagination (admin only)
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Parse query parameters
        const userId = (req.query as any).userId as string | undefined
        const action = (req.query as any).action as string | undefined
        const from = (req.query as any).from as string | undefined
        const to = (req.query as any).to as string | undefined
        let limit = parseInt((req.query as any).limit as string) || 50
        let offset = parseInt((req.query as any).offset as string) || 0

        // Validate limits
        if (limit > 200) limit = 200
        if (limit < 1) limit = 50
        if (offset < 0) offset = 0

        // Build dynamic query
        const conditions: string[] = []
        const params: any[] = []
        let paramIndex = 1

        if (userId) {
          conditions.push(`al.user_id = $${paramIndex++}`)
          params.push(userId)
        }

        if (action) {
          conditions.push(`al.action = $${paramIndex++}`)
          params.push(action)
        }

        if (from) {
          conditions.push(`al.created_at >= $${paramIndex++}`)
          params.push(from)
        }

        if (to) {
          conditions.push(`al.created_at <= $${paramIndex++}`)
          params.push(to)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        // Get total count
        const countResult = await queryOne<any>(
          `SELECT COUNT(*) as total FROM audit_log al ${whereClause}`,
          params,
        )
        const total = parseInt(countResult?.total || 0)

        // Fetch paginated results
        params.push(limit)
        params.push(offset)
        const logs = await queryMany<any>(
          `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id,
                  al.metadata, al.ip_address, al.created_at, u.email, u.name, u.employee_number
           FROM audit_log al
           LEFT JOIN users u ON al.user_id = u.id
           ${whereClause}
           ORDER BY al.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          params,
        )

        return reply.status(200).send({
          data: logs.map((log) => ({
            id: log.id,
            userId: log.user_id,
            userEmail: log.email,
            userName: log.name,
            employeeNumber: log.employee_number,
            action: log.action,
            entityType: log.entity_type,
            entityId: log.entity_id,
            metadata: log.metadata,
            ipAddress: log.ip_address,
            createdAt: log.created_at,
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/audit/export - Export audit log as CSV with filtering (admin only)
  app.get(
    '/export',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Parse query parameters
        const userId = (req.query as any).userId as string | undefined
        const action = (req.query as any).action as string | undefined
        const from = (req.query as any).from as string | undefined
        const to = (req.query as any).to as string | undefined

        // Build dynamic query
        const conditions: string[] = []
        const params: any[] = []
        let paramIndex = 1

        if (userId) {
          conditions.push(`al.user_id = $${paramIndex++}`)
          params.push(userId)
        }

        if (action) {
          conditions.push(`al.action = $${paramIndex++}`)
          params.push(action)
        }

        if (from) {
          conditions.push(`al.created_at >= $${paramIndex++}`)
          params.push(from)
        }

        if (to) {
          conditions.push(`al.created_at <= $${paramIndex++}`)
          params.push(to)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const logs = await queryMany<any>(
          `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id,
                  al.metadata, al.ip_address, al.created_at, u.email, u.name, u.employee_number
           FROM audit_log al
           LEFT JOIN users u ON al.user_id = u.id
           ${whereClause}
           ORDER BY al.created_at DESC`,
          params,
        )

        // Build CSV
        const headers = [
          'Timestamp',
          'User Name',
          'User Email',
          'Employee #',
          'Action',
          'Entity Type',
          'Entity ID',
          'IP Address',
          'Document',
          'Details',
        ]
        const rows = logs.map((log) => [
          log.created_at,
          log.name || 'system',
          log.email || '',
          log.employee_number || '',
          log.action,
          log.entity_type || '',
          log.entity_id || '',
          log.ip_address || '',
          '', // Document placeholder
          log.metadata ? JSON.stringify(log.metadata) : '',
        ])

        const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell || '')}"`).join(',')).join('\n')

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="audit-log.csv"')
          .send(csv)
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/audit/stats - Get audit statistics
  app.get(
    '/stats',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        const stats = await queryMany<any>(
          `SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC`,
        )

        const totalLogins = await queryOne<any>(
          `SELECT COUNT(*) as count FROM audit_log WHERE action = 'LOGIN'`,
        )

        const totalLogouts = await queryOne<any>(
          `SELECT COUNT(*) as count FROM audit_log WHERE action = 'LOGOUT'`,
        )

        const totalSignings = await queryOne<any>(
          `SELECT COUNT(*) as count FROM audit_log WHERE action = 'SIGN_DOCUMENT'`,
        )

        const totalReadings = await queryOne<any>(
          `SELECT COUNT(*) as count FROM audit_log WHERE action = 'COMPLETE_READING'`,
        )

        return reply.status(200).send({
          totalEvents: stats.reduce((acc, s) => acc + parseInt(s.count), 0),
          totalLogins: totalLogins?.count || 0,
          totalLogouts: totalLogouts?.count || 0,
          totalSignings: totalSignings?.count || 0,
          totalReadings: totalReadings?.count || 0,
          actionBreakdown: stats.map((s) => ({
            action: s.action,
            count: s.count,
          })),
        })
      } catch (err) {
        throw err
      }
    },
  )
}
