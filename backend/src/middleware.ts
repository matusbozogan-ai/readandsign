import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken, TokenPayload } from './auth'

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload
      ipAddress?: string
    }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload
    ipAddress?: string
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' })
    }

    const token = authHeader.substring(7)
    const payload = verifyAccessToken(token)
    req.user = payload
    req.ipAddress = req.ip
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...allowedRoles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (!req.user) {
      return
    }

    if (!allowedRoles.includes(req.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' })
    }
  }
}

export async function optionalAuth(req: FastifyRequest): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const payload = verifyAccessToken(token)
      req.user = payload
    }
  } catch {
    // Silent fail for optional auth
  }
}
