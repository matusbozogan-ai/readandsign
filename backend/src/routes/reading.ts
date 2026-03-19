import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne } from '../db'

interface StartReadingRequest {
  assignmentId: string
}

interface UpdateProgressRequest {
  assignmentId: string
  scrollDepth: number
  pagesVisited?: number[]
  timeSpentSeconds: number
}

interface CompleteReadingRequest {
  assignmentId: string
  scrollDepth: number
  timeSpentSeconds: number
}

export default async function readingRoutes(app: FastifyInstance) {
  // POST /api/reading/start - Start reading session
  app.post<{ Body: StartReadingRequest }>(
    '/start',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId } = req.body

      if (!assignmentId) {
        return reply.status(400).send({ error: 'assignmentId is required' })
      }

      // Verify assignment belongs to user
      const assignment = await queryOne<any>(
        `SELECT id, user_id FROM assignments WHERE id = $1`,
        [assignmentId],
      )

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      if (assignment.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Check if reading event already exists
        const existing = await queryOne<any>(
          `SELECT id FROM read_events WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (!existing) {
          const readEventId = uuidv4()
          const now = new Date().toISOString()

          await query(
            `INSERT INTO read_events (id, assignment_id, started_at, pages_visited, time_spent_seconds)
             VALUES ($1, $2, $3, $4, 0)`,
            [readEventId, assignmentId, now, JSON.stringify([])],
          )

          // Update assignment status
          await query(`UPDATE assignments SET status = 'in_progress' WHERE id = $1`, [assignmentId])

          // Log reading start
          await query(
            `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.userId, 'START_READING', 'assignment', assignmentId, req.ip],
          )
        }

        return reply.status(200).send({ message: 'Reading started' })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/reading/progress - Update reading progress
  app.post<{ Body: UpdateProgressRequest }>(
    '/progress',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId, scrollDepth, pagesVisited = [], timeSpentSeconds } = req.body

      if (!assignmentId) {
        return reply.status(400).send({ error: 'assignmentId is required' })
      }

      // Verify assignment belongs to user
      const assignment = await queryOne<any>(
        `SELECT id, user_id FROM assignments WHERE id = $1`,
        [assignmentId],
      )

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      if (assignment.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        // Update or create reading event
        const existing = await queryOne<any>(
          `SELECT id FROM read_events WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (existing) {
          await query(
            `UPDATE read_events
             SET scroll_depth = $1, pages_visited = $2, time_spent_seconds = $3
             WHERE assignment_id = $4`,
            [scrollDepth, JSON.stringify(pagesVisited), timeSpentSeconds, assignmentId],
          )
        } else {
          const readEventId = uuidv4()
          const now = new Date().toISOString()

          await query(
            `INSERT INTO read_events (id, assignment_id, started_at, scroll_depth, pages_visited, time_spent_seconds)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [readEventId, assignmentId, now, scrollDepth, JSON.stringify(pagesVisited), timeSpentSeconds],
          )
        }

        return reply.status(200).send({ message: 'Progress updated' })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/reading/complete - Complete reading session
  app.post<{ Body: CompleteReadingRequest }>(
    '/complete',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId, scrollDepth, timeSpentSeconds } = req.body

      if (!assignmentId) {
        return reply.status(400).send({ error: 'assignmentId is required' })
      }

      // Verify assignment belongs to user
      const assignment = await queryOne<any>(
        `SELECT id, user_id FROM assignments WHERE id = $1`,
        [assignmentId],
      )

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      if (assignment.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      try {
        const now = new Date().toISOString()

        // Update reading event
        const existing = await queryOne<any>(
          `SELECT id FROM read_events WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (existing) {
          await query(
            `UPDATE read_events
             SET completed_at = $1, scroll_depth = $2, time_spent_seconds = $3
             WHERE assignment_id = $4`,
            [now, scrollDepth, timeSpentSeconds, assignmentId],
          )
        } else {
          const readEventId = uuidv4()

          await query(
            `INSERT INTO read_events (id, assignment_id, started_at, completed_at, scroll_depth, time_spent_seconds)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [readEventId, assignmentId, now, now, scrollDepth, timeSpentSeconds],
          )
        }

        // Update assignment status
        await query(
          `UPDATE assignments SET status = 'read' WHERE id = $1 AND status != 'signed'`,
          [assignmentId],
        )

        // Log reading completion
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'COMPLETE_READING',
            'assignment',
            assignmentId,
            JSON.stringify({ scrollDepth, timeSpentSeconds }),
            req.ip,
          ],
        )

        return reply.status(200).send({ message: 'Reading completed' })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/reading/:assignmentId - Get reading progress
  app.get<{ Params: { assignmentId: string } }>(
    '/:assignmentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId } = req.params

      // Verify assignment belongs to user or user is admin
      const assignment = await queryOne<any>(
        `SELECT id, user_id FROM assignments WHERE id = $1`,
        [assignmentId],
      )

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' })
      }

      if (req.user.role === 'user' && assignment.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const readEvent = await queryOne<any>(
        `SELECT * FROM read_events WHERE assignment_id = $1`,
        [assignmentId],
      )

      if (!readEvent) {
        return reply.status(404).send({ error: 'Reading event not found' })
      }

      return reply.status(200).send({
        id: readEvent.id,
        assignmentId: readEvent.assignment_id,
        startedAt: readEvent.started_at,
        completedAt: readEvent.completed_at,
        scrollDepth: readEvent.scroll_depth,
        pagesVisited: readEvent.pages_visited,
        timeSpentSeconds: readEvent.time_spent_seconds,
      })
    },
  )
}
