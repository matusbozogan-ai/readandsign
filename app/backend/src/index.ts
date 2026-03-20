import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import path from 'path'
import { initDB } from './db'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import documentRoutes from './routes/documents'
import assignmentRoutes from './routes/assignments'
import readingRoutes from './routes/reading'
import signingRoutes from './routes/signing'
import auditRoutes from './routes/audit'
import sectionsRoutes from './routes/sections'
import quizRoutes from './routes/quiz'
import diffRoutes from './routes/diff'
import reportsRoutes from './routes/reports'
import notificationRoutes from './routes/notifications'
import customerRoutes from './routes/customers'
import organisationsRoutes from './routes/organisations'
import documentOptionsRoutes from './routes/documentOptions'

const PORT = parseInt(process.env.PORT || '3000', 10)
const NODE_ENV = process.env.NODE_ENV || 'development'

async function start() {
  const app = Fastify({ logger: NODE_ENV !== 'production' })

  await app.register(cookie)
  await app.register(cors, { origin: true, credentials: true })
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  try {
    await initDB()
  } catch (err) {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  }

  if (process.env.SEED === 'true') {
    try {
      const { seedDatabase } = await import('./seed')
      await seedDatabase()
    } catch (err) {
      console.error('Failed to seed database:', err)
    }
  }

  // Always run PDF repair on startup to fix any corrupt seed files from older versions
  try {
    const { repairInvalidPdfFiles } = await import('./seed')
    await repairInvalidPdfFiles()
  } catch (err) {
    console.error('PDF repair startup check failed (non-fatal):', err)
  }

  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(userRoutes, { prefix: '/api/users' })
  app.register(documentRoutes, { prefix: '/api/documents' })
  app.register(assignmentRoutes, { prefix: '/api/assignments' })
  app.register(readingRoutes, { prefix: '/api/reading' })
  app.register(signingRoutes, { prefix: '/api/signing' })
  app.register(auditRoutes, { prefix: '/api/audit' })
  app.register(sectionsRoutes, { prefix: '/api/sections' })
  app.register(quizRoutes, { prefix: '/api/quiz' })
  app.register(diffRoutes, { prefix: '/api/diff' })
  app.register(reportsRoutes, { prefix: '/api/reports' })
  app.register(notificationRoutes, { prefix: '/api/notifications' })
  app.register(customerRoutes, { prefix: '/api/customers' })
  app.register(organisationsRoutes, { prefix: '/api/organisations' })
  app.register(documentOptionsRoutes, { prefix: '/api/document-options' })

  app.get('/health', async () => ({ status: 'ok' }))

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Server listening on 0.0.0.0:${PORT}`)
}

start().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
