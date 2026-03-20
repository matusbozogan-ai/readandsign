import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'

export default async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — list notifications for the current user (newest first, max 50)
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const notifications = await queryMany<any>(
        `SELECT id, type, title, message, entity_type, entity_id, read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.userId],
      )

      const unreadCount = notifications.filter((n) => !n.read).length

      return reply.status(200).send({
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          entityType: n.entity_type,
          entityId: n.entity_id,
          read: n.read,
          createdAt: n.created_at,
        })),
        unreadCount,
      })
    },
  )

  // POST /api/notifications/:id/read — mark a single notification as read
  app.post<{ Params: { id: string } }>(
    '/:id/read',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const notification = await queryOne<any>(
        `SELECT id, user_id FROM notifications WHERE id = $1`,
        [id],
      )

      if (!notification) {
        return reply.status(404).send({ error: 'Notification not found' })
      }

      if (notification.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      await query(`UPDATE notifications SET read = true WHERE id = $1`, [id])

      return reply.status(200).send({ message: 'Marked as read' })
    },
  )

  // POST /api/notifications/read-all — mark all notifications as read for the current user
  app.post(
    '/read-all',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      await query(
        `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
        [req.user.userId],
      )

      return reply.status(200).send({ message: 'All notifications marked as read' })
    },
  )

  // DELETE /api/notifications/:id — delete a single notification
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const notification = await queryOne<any>(
        `SELECT id, user_id FROM notifications WHERE id = $1`,
        [id],
      )

      if (!notification) {
        return reply.status(404).send({ error: 'Notification not found' })
      }

      if (notification.user_id !== req.user.userId) {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      await query(`DELETE FROM notifications WHERE id = $1`, [id])

      return reply.status(200).send({ message: 'Notification deleted' })
    },
  )
}

// ─── Helper exported for use in other routes ───────────────────────────────

export async function createNotification(params: {
  userId: string
  type: string
  title: string
  message: string
  entityType?: string
  entityId?: string
}): Promise<void> {
  const id = uuidv4()
  await query(
    `INSERT INTO notifications (id, user_id, type, title, message, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.userId,
      params.type,
      params.title,
      params.message,
      params.entityType || null,
      params.entityId || null,
    ],
  )
}
