import jwt from 'jsonwebtoken'
import bcryptjs from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_secret'
const REFRESH_SECRET = process.env.JWT_SECRET || 'change_me_secret'
const ACCESS_TOKEN_EXPIRES_IN = '15m'
const REFRESH_TOKEN_EXPIRES_IN = 8 * 60 * 60 // 8 hours in seconds

export interface TokenPayload {
  userId: string
  email: string
  role: string
  organisationId?: string
  iat?: number
  exp?: number
}

export function signAccessToken(userId: string, email: string, role: string, organisationId?: string): string {
  return jwt.sign({ userId, email, role, organisationId }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  })
}

export async function signRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const tokenId = uuidv4()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN * 1000)

  // Hash the token for storage
  const tokenHash = await bcryptjs.hash(tokenId, 10)

  // Use tokenId as the record's primary key so the refresh endpoint
  // can look it up directly with WHERE id = $1 (O(1) lookup before bcrypt verify)
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [tokenId, userId, tokenHash, expiresAt, userAgent || null],
  )

  return tokenId
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload
    return payload
  } catch (err) {
    throw new Error('Invalid or expired access token')
  }
}

export async function verifyRefreshToken(tokenId: string, userId: string): Promise<boolean> {
  const record = await queryOne<any>(
    `SELECT * FROM refresh_tokens
     WHERE id = $1 AND user_id = $2 AND revoked = false AND expires_at > NOW()`,
    [tokenId, userId],
  )

  if (!record) {
    return false
  }

  try {
    const match = await bcryptjs.compare(tokenId, record.token_hash)
    return match
  } catch {
    return false
  }
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`, [tokenHash])
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcryptjs.hash(plaintext, 12)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcryptjs.compare(plaintext, hash)
  } catch {
    return false
  }
}
