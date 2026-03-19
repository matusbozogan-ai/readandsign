import { Pool, QueryResult } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
})

export async function initDB(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf-8')

  let retries = 5
  let lastError: any
  
  while (retries > 0) {
    try {
      console.log(`Attempting database connection (${retries} retries left)...`)
      const client = await pool.connect()
      try {
        console.log('Executing schema initialization...')
        await client.query(schema)
        console.log('Database schema initialized successfully')
        return
      } finally {
        client.release()
      }
    } catch (err) {
      lastError = err
      console.error(`Database connection attempt failed: ${err}`, err)
      retries--
      if (retries > 0) {
        console.log(`Retrying in 5 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }
  
  console.error('Failed to initialize database after all retries:', lastError)
  throw lastError
}

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  return pool.query(text, params)
}

export async function queryOne<T>(text: string, params?: any[]): Promise<T | null> {
  const result = await pool.query(text, params)
  return result.rows[0] || null
}

export async function queryMany<T>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows
}

export async function close(): Promise<void> {
  await pool.end()
}

export default pool
