import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, requireRole } from '../middleware'
import { query, queryOne, queryMany } from '../db'

interface CreateSectionRequest {
  name: string
}

interface UpdateSectionRequest {
  name: string
}

export default async function sectionsRoutes(app: FastifyInstance) {
  // GET /api/sections - List sections in user's organisation (all admins)
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
        // Get user's organisation
        const currentUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [
          req.user.userId,
        ])
        if (!currentUser) {
          return reply.status(401).send({ error: 'User not found' })
        }

        const sections = await queryMany<any>(
          `SELECT id, name, created_at FROM sections WHERE organisation_id = $1 ORDER BY name ASC`,
          [currentUser.organisation_id],
        )

        return reply.status(200).send(
          sections.map((s) => ({
            id: s.id,
            name: s.name,
            createdAt: s.created_at,
          })),
        )
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/sections - Create section (super_admin only)
  app.post<{ Body: CreateSectionRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { name } = req.body

      if (!name) {
        return reply.status(400).send({ error: 'Name is required' })
      }

      try {
        // Get user's organisation
        const currentUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [
          req.user.userId,
        ])
        if (!currentUser) {
          return reply.status(401).send({ error: 'User not found' })
        }

        const sectionId = uuidv4()
        await query(
          `INSERT INTO sections (id, organisation_id, name)
           VALUES ($1, $2, $3)`,
          [sectionId, currentUser.organisation_id, name],
        )

        // Log creation
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'CREATE_SECTION', 'section', sectionId, req.ip],
        )

        return reply.status(201).send({ id: sectionId, name })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'Section name already exists' })
        }
        throw err
      }
    },
  )

  // PUT /api/sections/:id - Rename section (super_admin only)
  app.put<{ Params: { id: string }; Body: UpdateSectionRequest }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params
      const { name } = req.body

      if (!name) {
        return reply.status(400).send({ error: 'Name is required' })
      }

      try {
        // Verify section exists
        const section = await queryOne<any>(`SELECT id FROM sections WHERE id = $1`, [id])
        if (!section) {
          return reply.status(404).send({ error: 'Section not found' })
        }

        await query(`UPDATE sections SET name = $1 WHERE id = $2`, [name, id])

        // Log update
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'UPDATE_SECTION', 'section', id, req.ip],
        )

        return reply.status(200).send({ id, name })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'Section name already exists' })
        }
        throw err
      }
    },
  )

  // DELETE /api/sections/:id - Delete section (super_admin only, refuse if users exist)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params

      try {
        // Verify section exists
        const section = await queryOne<any>(`SELECT id FROM sections WHERE id = $1`, [id])
        if (!section) {
          return reply.status(404).send({ error: 'Section not found' })
        }

        // Check if any users are in this section
        const userCount = await queryOne<any>(
          `SELECT COUNT(*) as count FROM users WHERE section_id = $1`,
          [id],
        )

        if (userCount && parseInt(userCount.count) > 0) {
          return reply
            .status(409)
            .send({ error: 'Cannot delete section with active users. Please reassign or deactivate users first.' })
        }

        await query(`DELETE FROM sections WHERE id = $1`, [id])

        // Log deletion
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'DELETE_SECTION', 'section', id, req.ip],
        )

        return reply.status(200).send({ message: 'Section deleted' })
      } catch (err) {
        throw err
      }
    },
  )
}
