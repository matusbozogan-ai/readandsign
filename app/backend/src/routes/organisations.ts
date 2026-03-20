import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware'
import { query, queryOne } from '../db'

interface UpdateOrgRequest {
  name?: string
  subtitle?: string
}

export default async function organisationsRoutes(app: FastifyInstance) {
  // GET /api/organisations/current — return the authenticated user's organisation name + subtitle
  app.get(
    '/current',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const org = await queryOne<any>(
        `SELECT o.id, o.name, o.subtitle
         FROM organisations o
         JOIN users u ON u.organisation_id = o.id
         WHERE u.id = $1`,
        [req.user.userId],
      )

      if (!org) {
        return reply.status(404).send({ error: 'Organisation not found' })
      }

      return reply.send({
        id: org.id,
        name: org.name,
        subtitle: org.subtitle ?? null,
      })
    },
  )

  // PUT /api/organisations/current — update name and/or subtitle (super_admin only)
  app.put<{ Body: UpdateOrgRequest }>(
    '/current',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Only super admins can update organisation details' })
      }

      const { name, subtitle } = req.body

      if (!name && subtitle === undefined) {
        return reply.status(400).send({ error: 'Nothing to update' })
      }

      // Get current user's org
      const currentUser = await queryOne<any>(
        `SELECT organisation_id FROM users WHERE id = $1`,
        [req.user.userId],
      )
      if (!currentUser) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const setParts: string[] = []
      const values: any[] = []

      if (name !== undefined && name.trim()) {
        setParts.push(`name = $${values.length + 1}`)
        values.push(name.trim())
      }
      if (subtitle !== undefined) {
        setParts.push(`subtitle = $${values.length + 1}`)
        values.push(subtitle === '' ? null : subtitle.trim())
      }

      values.push(currentUser.organisation_id)
      await query(
        `UPDATE organisations SET ${setParts.join(', ')} WHERE id = $${values.length}`,
        values,
      )

      // Log the change
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.userId,
          'UPDATE_ORGANISATION',
          'organisation',
          currentUser.organisation_id,
          req.ip,
          JSON.stringify({ name, subtitle }),
        ],
      )

      const updated = await queryOne<any>(
        `SELECT id, name, subtitle FROM organisations WHERE id = $1`,
        [currentUser.organisation_id],
      )

      return reply.send({
        id: updated!.id,
        name: updated!.name,
        subtitle: updated!.subtitle ?? null,
      })
    },
  )
}
