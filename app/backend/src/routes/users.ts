import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, requireRole } from '../middleware'
import { query, queryOne, queryMany } from '../db'
import { hashPassword, verifyPassword } from '../auth'

interface CreateUserRequest {
  email: string
  password: string
  name: string
  employeeNumber?: string
  role: string
  sectionId?: string
}

interface UpdateUserRequest {
  name?: string
  email?: string
  employeeNumber?: string
  role?: string
  active?: boolean
}

interface UpdateProfileRequest {
  name?: string
  currentPassword?: string
  newPassword?: string
}

interface SetPinRequest {
  pin: string
  currentPassword: string
}

export default async function userRoutes(app: FastifyInstance) {
  // GET /api/users - List all users (admin only)
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      // Super admin can see all, section admin can see section users
      let users: any[]
      if (req.user.role === 'super_admin') {
        users = await queryMany(
          `SELECT id, email, name, role, section_id, employee_number, active, created_at
           FROM users ORDER BY created_at DESC`,
        )
      } else if (req.user.role === 'section_admin') {
        const admin = await queryOne<any>(`SELECT section_id FROM users WHERE id = $1`, [
          req.user.userId,
        ])
        if (!admin?.section_id) {
          return reply.status(403).send({ error: 'Not authorized' })
        }
        users = await queryMany(
          `SELECT id, email, name, role, section_id, employee_number, active, created_at
           FROM users WHERE section_id = $1 ORDER BY created_at DESC`,
          [admin.section_id],
        )
      } else {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      return reply.status(200).send(
        users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          sectionId: u.section_id,
          employeeNumber: u.employee_number,
          active: u.active,
          createdAt: u.created_at,
        })),
      )
    },
  )

  // POST /api/users - Create user (admin only)
  app.post<{ Body: CreateUserRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { email, password, name, employeeNumber, role, sectionId } = req.body

      if (!email || !password || !name) {
        return reply.status(400).send({ error: 'Email, password, and name are required' })
      }

      // Get user's organisation
      const currentUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [
        req.user.userId,
      ])
      if (!currentUser) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const passwordHash = await hashPassword(password)
      const userId = uuidv4()

      try {
        await query(
          `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, employee_number, role, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [userId, currentUser.organisation_id, sectionId || null, email, passwordHash, name, employeeNumber || null, role],
        )

        // Log creation
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'CREATE_USER', 'user', userId, req.ip],
        )

        return reply.status(201).send({ id: userId, email, name })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'Email already exists' })
        }
        throw err
      }
    },
  )

  // PUT /api/users/:id - Update user (admin only)
  app.put<{ Params: { id: string }; Body: UpdateUserRequest }>(
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
      const { name, email, employeeNumber, role, active } = req.body

      // Fetch user to check authorization
      const targetUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [
        id,
      ])
      if (!targetUser) {
        return reply.status(404).send({ error: 'User not found' })
      }

      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`)
        params.push(name)
      }
      if (email !== undefined) {
        updates.push(`email = $${paramIndex++}`)
        params.push(email)
      }
      if (employeeNumber !== undefined) {
        updates.push(`employee_number = $${paramIndex++}`)
        params.push(employeeNumber)
      }
      if (role !== undefined) {
        updates.push(`role = $${paramIndex++}`)
        params.push(role)
      }
      if (active !== undefined) {
        updates.push(`active = $${paramIndex++}`)
        params.push(active)
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'No updates provided' })
      }

      params.push(id)
      const query_text = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`

      try {
        await query(query_text, params)

        // Log update
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'UPDATE_USER', 'user', id, req.ip],
        )

        return reply.status(200).send({ id, message: 'User updated' })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'Email already exists' })
        }
        throw err
      }
    },
  )

  // DELETE /api/users/:id - Soft-delete user (admin only)
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

      // Prevent self-deletion
      if (id === req.user.userId) {
        return reply.status(409).send({ error: 'Cannot deactivate your own account' })
      }

      // Verify user exists
      const user = await queryOne<any>(`SELECT id FROM users WHERE id = $1`, [id])
      if (!user) {
        return reply.status(404).send({ error: 'User not found' })
      }

      try {
        await query(`UPDATE users SET active = false WHERE id = $1`, [id])

        // Log deletion
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'DEACTIVATE_USER', 'user', id, req.ip],
        )

        return reply.status(200).send({ message: 'User deactivated' })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/users/:id/assignments - Get user assignments
  app.get<{ Params: { id: string } }>(
    '/:id/assignments',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { id } = req.params

      const assignments = await queryMany(
        `SELECT a.id, a.document_version_id, a.deadline, a.status, a.created_at,
                d.id as document_id, d.title, d.doc_number,
                dv.version_number, dv.file_type,
                sr.signed_at
         FROM assignments a
         JOIN document_versions dv ON a.document_version_id = dv.id
         JOIN documents d ON dv.document_id = d.id
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC`,
        [id],
      )

      return reply.status(200).send(
        assignments.map((a: any) => ({
          id: a.id,
          documentVersionId: a.document_version_id,
          documentId: a.document_id,
          documentTitle: a.title,
          documentNumber: a.doc_number,
          versionNumber: a.version_number,
          fileType: a.file_type || 'pdf',
          deadline: a.deadline,
          status: a.status,
          createdAt: a.created_at,
          signedAt: a.signed_at || null,
        })),
      )
    },
  )

  // GET /api/users/profile - Get current user's profile
  app.get(
    '/profile',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      try {
        const user = await queryOne<any>(
          `SELECT id, name, email, role, section_id, employee_number, pin_hash, created_at
           FROM users WHERE id = $1`,
          [req.user.userId],
        )

        if (!user) {
          return reply.status(404).send({ error: 'User not found' })
        }

        return reply.status(200).send({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sectionId: user.section_id,
          employeeNumber: user.employee_number,
          hasPin: !!user.pin_hash,
          createdAt: user.created_at,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // PUT /api/users/profile - Update current user's profile
  app.put<{ Body: UpdateProfileRequest }>(
    '/profile',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { name, currentPassword, newPassword } = req.body

      try {
        // Fetch current user
        const user = await queryOne<any>(
          `SELECT password_hash FROM users WHERE id = $1`,
          [req.user.userId],
        )

        if (!user) {
          return reply.status(404).send({ error: 'User not found' })
        }

        const updates: string[] = []
        const params: any[] = []
        let paramIndex = 1

        // Update name
        if (name !== undefined) {
          updates.push(`name = $${paramIndex++}`)
          params.push(name)
        }

        // Update password (requires current password verification)
        if (newPassword !== undefined) {
          if (!currentPassword) {
            return reply.status(400).send({ error: 'Current password is required to change password' })
          }

          const passwordValid = await verifyPassword(currentPassword, user.password_hash)
          if (!passwordValid) {
            return reply.status(401).send({ error: 'Invalid current password' })
          }

          const newPasswordHash = await hashPassword(newPassword)
          updates.push(`password_hash = $${paramIndex++}`)
          params.push(newPasswordHash)
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No updates provided' })
        }

        params.push(req.user.userId)
        const queryText = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`

        await query(queryText, params)

        // Log update
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'UPDATE_PROFILE', 'user', req.user.userId, req.ip],
        )

        return reply.status(200).send({ message: 'Profile updated' })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/users/profile/pin - Set or change signing PIN
  app.post<{ Body: SetPinRequest }>(
    '/profile/pin',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { pin, currentPassword } = req.body

      if (!pin || !currentPassword) {
        return reply.status(400).send({ error: 'PIN and current password are required' })
      }

      // Validate PIN is exactly 6 digits
      if (!/^\d{6}$/.test(pin)) {
        return reply.status(400).send({ error: 'PIN must be exactly 6 digits' })
      }

      try {
        // Verify current password
        const user = await queryOne<any>(
          `SELECT password_hash FROM users WHERE id = $1`,
          [req.user.userId],
        )

        if (!user) {
          return reply.status(404).send({ error: 'User not found' })
        }

        const passwordValid = await verifyPassword(currentPassword, user.password_hash)
        if (!passwordValid) {
          return reply.status(401).send({ error: 'Invalid password' })
        }

        // Hash PIN with bcryptjs
        const pinHash = await hashPassword(pin)

        // Update user's PIN hash
        await query(`UPDATE users SET pin_hash = $1 WHERE id = $2`, [pinHash, req.user.userId])

        // Log PIN change
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'SET_PIN', 'user', req.user.userId, req.ip],
        )

        return reply.status(200).send({ message: 'PIN set successfully' })
      } catch (err) {
        throw err
      }
    },
  )

  // ── Settings: Preferences ──────────────────────────────────────────────────

  // GET /api/users/preferences - Get current user preferences
  app.get(
    '/preferences',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })

      const user = await queryOne<any>(
        `SELECT preferences FROM users WHERE id = $1`,
        [req.user.userId],
      )

      if (!user) return reply.status(404).send({ error: 'User not found' })

      // Return preferences merged with defaults
      const defaults = {
        notifications: {
          assignmentEmail: true,
          reminderEmail: true,
          overdueEmail: true,
          weeklyDigest: false,
        },
        display: {
          itemsPerPage: 20,
          dateFormat: 'locale',
          compactMode: false,
          sidebarCollapsed: false,
        },
      }

      const prefs = { ...defaults, ...(user.preferences || {}) }
      prefs.notifications = { ...defaults.notifications, ...(user.preferences?.notifications || {}) }
      prefs.display = { ...defaults.display, ...(user.preferences?.display || {}) }

      return reply.status(200).send(prefs)
    },
  )

  // PUT /api/users/preferences - Save current user preferences
  app.put<{ Body: any }>(
    '/preferences',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })

      const prefs = req.body
      if (!prefs || typeof prefs !== 'object') {
        return reply.status(400).send({ error: 'Invalid preferences object' })
      }

      await query(
        `UPDATE users SET preferences = $1 WHERE id = $2`,
        [JSON.stringify(prefs), req.user.userId],
      )

      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.userId, 'UPDATE_PREFERENCES', 'user', req.user.userId, req.ip],
      )

      return reply.status(200).send({ message: 'Preferences saved' })
    },
  )

  // ── Settings: Session Management ──────────────────────────────────────────

  // GET /api/users/sessions - List active sessions for current user
  app.get(
    '/sessions',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })

      const sessions = await queryMany<any>(
        `SELECT id, created_at, last_used_at, user_agent, expires_at
         FROM refresh_tokens
         WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
         ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
        [req.user.userId],
      )

      // Identify current session using the refresh token cookie
      const currentToken = req.cookies?.refreshToken

      return reply.status(200).send(
        sessions.map((s) => ({
          id: s.id,
          createdAt: s.created_at,
          lastUsedAt: s.last_used_at,
          userAgent: s.user_agent,
          expiresAt: s.expires_at,
          isCurrent: currentToken === s.id,
        })),
      )
    },
  )

  // DELETE /api/users/sessions - Revoke all sessions except current
  app.delete(
    '/sessions',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })

      const currentToken = req.cookies?.refreshToken

      const result = currentToken
        ? await query(
            `UPDATE refresh_tokens SET revoked = true
             WHERE user_id = $1 AND revoked = false AND id != $2`,
            [req.user.userId, currentToken],
          )
        : await query(
            `UPDATE refresh_tokens SET revoked = true
             WHERE user_id = $1 AND revoked = false`,
            [req.user.userId],
          )

      const revokedCount = result.rowCount || 0

      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.userId, 'REVOKE_ALL_SESSIONS', 'user', req.user.userId,
          JSON.stringify({ revokedCount }), req.ip],
      )

      return reply.status(200).send({ message: `Revoked ${revokedCount} session(s)`, revokedCount })
    },
  )

  // DELETE /api/users/sessions/:tokenId - Revoke one specific session
  app.delete<{ Params: { tokenId: string } }>(
    '/sessions/:tokenId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })

      const { tokenId } = req.params

      // Verify this session belongs to the current user
      const session = await queryOne<any>(
        `SELECT id FROM refresh_tokens WHERE id = $1 AND user_id = $2`,
        [tokenId, req.user.userId],
      )

      if (!session) {
        return reply.status(404).send({ error: 'Session not found' })
      }

      await query(`UPDATE refresh_tokens SET revoked = true WHERE id = $1`, [tokenId])

      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.userId, 'REVOKE_SESSION', 'user', req.user.userId, req.ip],
      )

      // If revoking the current session, clear the cookie
      const currentToken = req.cookies?.refreshToken
      if (currentToken === tokenId) {
        reply.clearCookie('refreshToken')
      }

      return reply.status(200).send({ message: 'Session revoked' })
    },
  )

  // Groups API endpoints
  // GET /api/users/groups - List groups
  app.get<{} >(
    '/groups',
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

        const groups = await queryMany<any>(
          `SELECT g.id, g.name, g.section_id, s.name as section_name,
                  COUNT(gm.user_id) as member_count
           FROM groups g
           LEFT JOIN sections s ON g.section_id = s.id
           LEFT JOIN group_members gm ON g.id = gm.group_id
           WHERE g.organisation_id = $1
           GROUP BY g.id, g.name, g.section_id, s.name
           ORDER BY g.name ASC`,
          [currentUser.organisation_id],
        )

        return reply.status(200).send(
          groups.map((g) => ({
            id: g.id,
            name: g.name,
            sectionId: g.section_id,
            sectionName: g.section_name,
            memberCount: parseInt(g.member_count),
          })),
        )
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/users/groups - Create group
  app.post<{ Body: any }>(
    '/groups',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { name, sectionId } = req.body as any

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

        const groupId = uuidv4()
        await query(
          `INSERT INTO groups (id, organisation_id, section_id, name)
           VALUES ($1, $2, $3, $4)`,
          [groupId, currentUser.organisation_id, sectionId || null, name],
        )

        // Log creation
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'CREATE_GROUP', 'group', groupId, req.ip],
        )

        return reply.status(201).send({ id: groupId, name })
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'Group name already exists' })
        }
        throw err
      }
    },
  )

  // POST /api/users/groups/:id/members - Add user to group
  app.post<{ Params: { id: string }; Body: any }>(
    '/groups/:id/members',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id } = req.params
      const { userId } = req.body as any

      if (!userId) {
        return reply.status(400).send({ error: 'userId is required' })
      }

      try {
        // Verify group exists
        const group = await queryOne<any>(`SELECT id FROM groups WHERE id = $1`, [id])
        if (!group) {
          return reply.status(404).send({ error: 'Group not found' })
        }

        // Verify user exists
        const user = await queryOne<any>(`SELECT id FROM users WHERE id = $1`, [userId])
        if (!user) {
          return reply.status(404).send({ error: 'User not found' })
        }

        await query(
          `INSERT INTO group_members (group_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, userId],
        )

        // Log addition
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user.userId, 'ADD_GROUP_MEMBER', 'group', id, JSON.stringify({ memberId: userId }), req.ip],
        )

        return reply.status(200).send({ message: 'Member added' })
      } catch (err) {
        throw err
      }
    },
  )

  // DELETE /api/users/groups/:id/members/:userId - Remove user from group
  app.delete<{ Params: { id: string; userId: string } }>(
    '/groups/:id/members/:userId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { id, userId } = req.params

      try {
        // Verify group exists
        const group = await queryOne<any>(`SELECT id FROM groups WHERE id = $1`, [id])
        if (!group) {
          return reply.status(404).send({ error: 'Group not found' })
        }

        await query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [id, userId])

        // Log removal
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user.userId, 'REMOVE_GROUP_MEMBER', 'group', id, JSON.stringify({ memberId: userId }), req.ip],
        )

        return reply.status(200).send({ message: 'Member removed' })
      } catch (err) {
        throw err
      }
    },
  )
}
