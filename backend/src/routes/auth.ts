import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { signAccessToken, signRefreshToken, verifyPassword, hashPassword } from '../auth'
import { authenticate } from '../middleware'
import { queryOne, query } from '../db'

interface LoginRequest {
  email: string
  password: string
}

interface User {
  id: string
  email: string
  name: string
  role: string
  organisation_id: string
  section_id: string | null
}

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post<{ Body: LoginRequest }>('/login', async (req, reply) => {
    const { email, password } = req.body

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' })
    }

    const user = await queryOne<any>(
      `SELECT id, email, password_hash, name, role, organisation_id, section_id, active
       FROM users WHERE email = $1`,
      [email],
    )

    if (!user || !user.active) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const passwordValid = await verifyPassword(password, user.password_hash)
    if (!passwordValid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    // Create tokens
    const accessToken = signAccessToken(user.id, user.email, user.role, user.organisation_id)
    const refreshToken = await signRefreshToken(user.id, req.headers['user-agent'] as string | undefined)

    // Set refresh token in HTTP-only cookie
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // Allow HTTP in development
      sameSite: 'lax',
      maxAge: 8 * 60 * 60, // 8 hours
    })

    // Log authentication event
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'LOGIN', 'user', user.id, req.ip],
    )

    return reply.status(200).send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organisationId: user.organisation_id,
        sectionId: user.section_id,
      },
    })
  })

  // POST /api/auth/refresh
  app.post('/refresh', async (req, reply) => {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token' })
    }

    // Look up the token record by token ID (tokenId is stored as the record's primary key)
    // then bcrypt-verify the token against the stored hash to confirm ownership
    const record = await queryOne<any>(
      `SELECT rt.id, rt.user_id, rt.token_hash
       FROM refresh_tokens rt
       WHERE rt.id = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
      [refreshToken],
    )

    if (!record) {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    const { verifyRefreshToken } = await import('../auth')
    const isValid = await verifyRefreshToken(refreshToken, record.user_id)

    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    const user = await queryOne<any>(
      `SELECT id, email, role, organisation_id FROM users WHERE id = $1 AND active = true`,
      [record.user_id],
    )

    if (!user) {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    // Update last_used_at for this session
    await query(`UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1`, [refreshToken])

    const accessToken = signAccessToken(user.id, user.email, user.role, user.organisation_id)
    return reply.status(200).send({ accessToken })
  })

  // POST /api/auth/logout
  app.post('/logout', { onRequest: [authenticate] }, async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }

    // Log logout event
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.userId, 'LOGOUT', 'user', req.user.userId, req.ip],
    )

    // Clear refresh token cookie
    reply.clearCookie('refreshToken')
    return reply.status(200).send({ message: 'Logged out' })
  })

  // GET /api/auth/me
  app.get('/me', { onRequest: [authenticate] }, async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }

    const user = await queryOne<User>(
      `SELECT id, email, name, role, organisation_id, section_id
       FROM users WHERE id = $1`,
      [req.user.userId],
    )

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    return reply.status(200).send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisation_id,
      sectionId: user.section_id,
    })
  })
}
