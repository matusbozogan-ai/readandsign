import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'

interface CreateOptionRequest {
  type: 'category' | 'issuer'
  value: string
}

export default async function documentOptionsRoutes(app: FastifyInstance) {
  // GET /api/document-options?type=category|issuer — list for the user's org
  app.get<{ Querystring: { type?: string } }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const currentUser = await queryOne<any>(
        `SELECT organisation_id FROM users WHERE id = $1`,
        [req.user.userId],
      )
      if (!currentUser) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const typeFilter = req.query.type
      const values: any[] = [currentUser.organisation_id]
      let whereType = ''
      if (typeFilter === 'category' || typeFilter === 'issuer') {
        whereType = ` AND type = $2`
        values.push(typeFilter)
      }

      const options = await queryMany<any>(
        `SELECT id, type, value, created_at
         FROM document_options
         WHERE organisation_id = $1${whereType}
         ORDER BY type ASC, value ASC`,
        values,
      )

      return reply.send(
        options.map((o) => ({
          id: o.id,
          type: o.type,
          value: o.value,
          createdAt: o.created_at,
        })),
      )
    },
  )

  // POST /api/document-options — add a new option (any admin)
  app.post<{ Body: CreateOptionRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { type, value } = req.body

      if (!type || !['category', 'issuer'].includes(type)) {
        return reply.status(400).send({ error: 'type must be "category" or "issuer"' })
      }
      if (!value || !value.trim()) {
        return reply.status(400).send({ error: 'value is required' })
      }

      const currentUser = await queryOne<any>(
        `SELECT organisation_id FROM users WHERE id = $1`,
        [req.user.userId],
      )
      if (!currentUser) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const id = uuidv4()
      try {
        await query(
          `INSERT INTO document_options (id, organisation_id, type, value)
           VALUES ($1, $2, $3, $4)`,
          [id, currentUser.organisation_id, type, value.trim()],
        )
      } catch (err: any) {
        if (err.code === '23505') {
          // Already exists — return it
          const existing = await queryOne<any>(
            `SELECT id, type, value, created_at FROM document_options
             WHERE organisation_id = $1 AND type = $2 AND value = $3`,
            [currentUser.organisation_id, type, value.trim()],
          )
          return reply.status(200).send({
            id: existing!.id,
            type: existing!.type,
            value: existing!.value,
            createdAt: existing!.created_at,
          })
        }
        throw err
      }

      return reply.status(201).send({ id, type, value: value.trim() })
    },
  )

  // DELETE /api/document-options/:id — remove an option (any admin)
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

      const currentUser = await queryOne<any>(
        `SELECT organisation_id FROM users WHERE id = $1`,
        [req.user.userId],
      )
      if (!currentUser) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const { id } = req.params

      const option = await queryOne<any>(
        `SELECT id FROM document_options WHERE id = $1 AND organisation_id = $2`,
        [id, currentUser.organisation_id],
      )
      if (!option) {
        return reply.status(404).send({ error: 'Option not found' })
      }

      await query(`DELETE FROM document_options WHERE id = $1`, [id])

      return reply.status(200).send({ message: 'Option deleted' })
    },
  )
}
