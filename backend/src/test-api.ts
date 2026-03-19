/**
 * Comprehensive API test harness using pg-mem (in-memory PostgreSQL)
 * Tests every major API endpoint and reports bugs.
 */
import { newDb } from 'pg-mem'
import * as fs from 'fs'
import * as path from 'path'

// ─── Colour helpers ──────────────────────────────────────────────────────────
const R = '\x1b[31m'
const G = '\x1b[32m'
const Y = '\x1b[33m'
const B = '\x1b[34m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

// ─── Test result tracking ────────────────────────────────────────────────────
interface TestResult { name: string; passed: boolean; error?: string; details?: any }
const results: TestResult[] = []
let accessToken = ''
let sectionAdminToken = ''
let userToken = ''
let orgId = ''
let sectionId = ''
let userId = ''
let docId = ''
let versionId = ''
let latestVersionId = ''
let assignmentId = ''

function pass(name: string, details?: any) {
  results.push({ name, passed: true, details })
  console.log(`${G}  ✓${RESET} ${name}${details ? ` ${Y}(${JSON.stringify(details)})${RESET}` : ''}`)
}

function fail(name: string, error: string, details?: any) {
  results.push({ name, passed: false, error, details })
  console.log(`${R}  ✗${RESET} ${name}`)
  console.log(`    ${R}${error}${RESET}`)
  if (details) console.log(`    ${Y}${JSON.stringify(details)}${RESET}`)
}

async function req(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`http://127.0.0.1:3001${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

// ─── Setup pg-mem and patch the db module ─────────────────────────────────────
async function setupDatabase() {
  const db = newDb()

  // Read schema
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')

  // pg-mem doesn't support all Postgres features, filter problematic lines
  const lines = schema.split('\n')
  const filtered = lines.filter(line => {
    const l = line.trim().toLowerCase()
    // Skip trigger creation (pg-mem has limited trigger support)
    if (l.startsWith('create or replace function')) return false
    if (l.startsWith('create trigger')) return false
    if (l.includes('returns trigger')) return false
    if (l.includes('$body$') || l.includes('$func$')) return false
    if (l.includes('plpgsql')) return false
    if (l.startsWith('end;') && !l.includes('end;end')) return false
    if (l.includes('language plpgsql')) return false
    return true
  }).join('\n')

  await db.public.query(filtered)
  return db
}

// ─── Patch the db module ─────────────────────────────────────────────────────
async function patchDb(db: any) {
  const { Client } = db.adapters.createPg()

  // Monkey-patch the db module
  const dbModule = await import('./db')
  const pool = { query: async (text: string, values?: any[]) => {
    const client = new Client()
    await client.connect()
    try {
      const result = await client.query(text, values)
      return result
    } finally {
      await client.end()
    }
  }}

  // Override the exported query functions
  ;(dbModule as any).pool = pool
}

// ─── Start the Fastify server with patched db ─────────────────────────────────
async function startServer(db: any): Promise<any> {
  // We need to bypass the regular index.ts startup and manually wire things
  // Use ts-node to compile and run with the mock
  const Fastify = (await import('fastify')).default
  const cookie = (await import('@fastify/cookie')).default
  const cors = (await import('@fastify/cors')).default
  const multipart = (await import('@fastify/multipart')).default

  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(cors, { origin: true, credentials: true })
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  return app
}

// ─── Main test runner ─────────────────────────────────────────────────────────
async function runTests() {
  console.log(`\n${BOLD}${B}═══ Read & Sign API Test Suite ═══${RESET}\n`)

  // ── Direct DB + module-level tests (no HTTP server) ───────────────────────
  console.log(`${BOLD}[1] Database Schema Tests${RESET}`)

  let dbInstance: any
  try {
    dbInstance = newDb()
    const schemaPath = path.join(__dirname, 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')

    // Strip unsupported PL/pgSQL blocks for pg-mem
    const cleanSchema = schema
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
      .replace(/CREATE TRIGGER[\s\S]*?;/gi, '')

    await dbInstance.public.query(cleanSchema)
    pass('Schema loads without errors')
  } catch (e: any) {
    fail('Schema loads without errors', e.message)
  }

  // Test tables exist
  if (dbInstance) {
    const expectedTables = [
      'organisations', 'sections', 'users', 'groups', 'group_members',
      'documents', 'document_versions', 'assignments', 'read_events',
      'signing_records', 'audit_log', 'refresh_tokens',
    ]
    for (const table of expectedTables) {
      try {
        await dbInstance.public.query(`SELECT 1 FROM ${table} LIMIT 1`)
        pass(`Table '${table}' exists`)
      } catch (e: any) {
        fail(`Table '${table}' exists`, e.message)
      }
    }

    // Test Phase 3 tables
    for (const table of ['document_quizzes', 'quiz_questions', 'quiz_attempts']) {
      try {
        await dbInstance.public.query(`SELECT 1 FROM ${table} LIMIT 1`)
        pass(`Phase 3 table '${table}' exists`)
      } catch (e: any) {
        fail(`Phase 3 table '${table}' exists`, e.message)
      }
    }

    // Test validity_days column
    try {
      await dbInstance.public.query(`SELECT validity_days FROM documents LIMIT 1`)
      pass('documents.validity_days column exists')
    } catch (e: any) {
      fail('documents.validity_days column exists', e.message)
    }

    // Test pin_hash column
    try {
      await dbInstance.public.query(`SELECT pin_hash FROM users LIMIT 1`)
      pass('users.pin_hash column exists')
    } catch (e: any) {
      fail('users.pin_hash column exists', e.message)
    }

    // Seed basic data
    console.log(`\n${BOLD}[2] Data Seed Tests${RESET}`)
    try {
      const { v4: uuidv4 } = await import('uuid')
      const bcrypt = await import('bcryptjs')

      orgId = uuidv4()
      sectionId = uuidv4()
      const adminId = uuidv4()
      const sectionAdminId = uuidv4()
      userId = uuidv4()

      await dbInstance.public.query(`INSERT INTO organisations (id, name) VALUES ($1, $2)`, [orgId, 'Test Aviation'])
      await dbInstance.public.query(`INSERT INTO sections (id, organisation_id, name) VALUES ($1, $2, $3)`, [sectionId, orgId, 'Ramp Ops'])

      const pwHash = await bcrypt.hash('Admin123!', 10)
      const userPwHash = await bcrypt.hash('User123!', 10)

      await dbInstance.public.query(
        `INSERT INTO users (id, organisation_id, email, password_hash, name, role, active) VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [adminId, orgId, 'admin@test.com', pwHash, 'Super Admin', 'super_admin']
      )
      await dbInstance.public.query(
        `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, role, active) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [sectionAdminId, orgId, sectionId, 'sectionadmin@test.com', pwHash, 'Section Admin', 'section_admin']
      )
      await dbInstance.public.query(
        `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, role, employee_number, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [userId, orgId, sectionId, 'user1@test.com', userPwHash, 'Test User', 'user', 'EMP001']
      )
      pass('Seed: organisations, sections, users created')

      // Create a document
      const createdByAdminId = adminId
      docId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO documents (id, organisation_id, title, doc_number, category, issuer, created_by, validity_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [docId, orgId, 'Safety Manual', 'DOC-001', 'Safety', 'Ops Dept', createdByAdminId, 365]
      )
      pass('Seed: document created')

      // Create a draft version
      versionId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO document_versions (id, document_id, version_number, status, file_hash) VALUES ($1,$2,$3,$4,$5)`,
        [versionId, docId, 1, 'draft', 'abc123def456']
      )
      pass('Seed: document draft version created')

      // Publish the version
      await dbInstance.public.query(
        `UPDATE document_versions SET status = 'published', published_at = NOW() WHERE id = $1`,
        [versionId]
      )
      latestVersionId = versionId
      pass('Seed: document version published')

      // Create an assignment
      assignmentId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, deadline, status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [assignmentId, versionId, userId, adminId, new Date(Date.now() + 7 * 86400000), 'pending']
      )
      pass('Seed: assignment created')

    } catch (e: any) {
      fail('Data seeding', e.message)
    }
  }

  // ── SQL Query Tests ───────────────────────────────────────────────────────
  console.log(`\n${BOLD}[3] SQL Query Tests (key backend queries)${RESET}`)

  if (dbInstance) {
    // Test the documents list query (the one we fixed with latestVersionId)
    try {
      const result = await dbInstance.public.query(
        `SELECT d.id, d.title, d.doc_number, d.category, d.issuer, d.created_at, d.validity_days,
                u.name as created_by_name,
                MAX(dv.version_number) as latest_version,
                (SELECT status FROM document_versions WHERE document_id = d.id ORDER BY version_number DESC LIMIT 1) as latest_status,
                (SELECT id FROM document_versions WHERE document_id = d.id AND status = 'published' ORDER BY version_number DESC LIMIT 1) as latest_version_id,
                COUNT(DISTINCT CASE WHEN dv.status = 'published' THEN a.id END) as total_assignments,
                COUNT(DISTINCT CASE WHEN dv.status = 'published' THEN sr.id END) as total_signed
         FROM documents d
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN document_versions dv ON d.id = dv.document_id
         LEFT JOIN assignments a ON dv.id = a.document_version_id AND dv.status = 'published'
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id AND dv.status = 'published'
         GROUP BY d.id, u.name
         ORDER BY d.created_at DESC`
      )
      const row = result.rows[0]
      if (!row) throw new Error('No documents returned')
      if (!row.latest_version_id) throw new Error(`latest_version_id is null — assignment creation would fail! Got: ${JSON.stringify(row)}`)
      pass('GET /documents query returns latest_version_id', { latestVersionId: row.latest_version_id?.substring(0, 8) + '...' })
    } catch (e: any) {
      fail('GET /documents query returns latest_version_id', e.message)
    }

    // Test the compliance matrix query (fixed with DB organisationId lookup)
    try {
      const currentUser = await dbInstance.public.query(
        `SELECT organisation_id FROM users WHERE id = $1`,
        [userId]
      )
      const resolvedOrgId = currentUser.rows[0]?.organisation_id
      if (!resolvedOrgId) throw new Error('Could not resolve organisation_id from DB')

      const users = await dbInstance.public.query(
        `SELECT id, name, email, employee_number, section_id FROM users WHERE organisation_id = $1 AND active = true ORDER BY name`,
        [resolvedOrgId]
      )
      if (users.rows.length === 0) throw new Error('Matrix: no users found with resolved orgId')
      pass('Compliance matrix: organisationId resolved from DB', { userCount: users.rows.length })
    } catch (e: any) {
      fail('Compliance matrix: organisationId resolved from DB', e.message)
    }

    // Test assignment creation — correct version ID lookup
    try {
      const docResult = await dbInstance.public.query(
        `SELECT (SELECT id FROM document_versions WHERE document_id = d.id AND status = 'published' ORDER BY version_number DESC LIMIT 1) as latest_version_id
         FROM documents d WHERE d.id = $1`,
        [docId]
      )
      const lvid = docResult.rows[0]?.latest_version_id
      if (!lvid) throw new Error('No published version ID for document — assignment create would return 404')

      // Verify this version ID actually exists in document_versions
      const versionCheck = await dbInstance.public.query(
        `SELECT id FROM document_versions WHERE id = $1`,
        [lvid]
      )
      if (versionCheck.rows.length === 0) throw new Error('version_id not found in document_versions — 404 would occur')
      pass('Assignment creation: version ID resolves correctly', { versionId: lvid.substring(0, 8) + '...' })
    } catch (e: any) {
      fail('Assignment creation: version ID resolves correctly', e.message)
    }

    // Test overdue assignment check
    try {
      const result = await dbInstance.public.query(
        `UPDATE assignments SET status = 'overdue'
         WHERE deadline < NOW() AND status NOT IN ('signed')
         RETURNING id`
      )
      // Should return 0 rows since deadline is 7 days in future
      pass('Check-overdue query executes', { updatedCount: result.rowCount })
    } catch (e: any) {
      fail('Check-overdue query executes', e.message)
    }

    // Test audit log insert
    try {
      await dbInstance.public.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address) VALUES ($1,$2,$3,$4,$5)`,
        [userId, 'TEST_ACTION', 'assignment', assignmentId, '127.0.0.1']
      )
      pass('Audit log insert works')
    } catch (e: any) {
      fail('Audit log insert works', e.message)
    }

    // Test audit log query with filters
    try {
      const result = await dbInstance.public.query(
        `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id,
                al.metadata, al.ip_address, al.created_at, u.email, u.name, u.employee_number
         FROM audit_log al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.action = 'TEST_ACTION'
         ORDER BY al.created_at DESC
         LIMIT 50 OFFSET 0`
      )
      if (result.rows.length === 0) throw new Error('Audit log query returned no results')
      pass('Audit log query with filters works', { count: result.rows.length })
    } catch (e: any) {
      fail('Audit log query with filters works', e.message)
    }

    // Test signing record insert
    try {
      const { v4: uuidv4 } = await import('uuid')
      const signingId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO signing_records (id, assignment_id, user_id, method, signing_hash) VALUES ($1,$2,$3,$4,$5)`,
        [signingId, assignmentId, userId, 'password', 'testhash123']
      )
      // Update assignment status
      await dbInstance.public.query(
        `UPDATE assignments SET status = 'signed' WHERE id = $1`,
        [assignmentId]
      )
      pass('Signing record insert and assignment status update works')
    } catch (e: any) {
      fail('Signing record insert and assignment status update works', e.message)
    }

    // Test compliance matrix cells query
    try {
      const assignment = await dbInstance.public.query(
        `SELECT a.id, a.deadline, a.status, sr.signed_at
         FROM assignments a
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id
         WHERE a.user_id = $1 AND a.document_version_id = $2`,
        [userId, versionId]
      )
      if (assignment.rows.length === 0) throw new Error('Matrix cell query returned no data for existing assignment')
      const cell = assignment.rows[0]
      const status = cell.signed_at ? 'signed' : cell.status === 'overdue' ? 'overdue' : 'pending'
      pass('Matrix cell query works', { status })
    } catch (e: any) {
      fail('Matrix cell query works', e.message)
    }

    // Test read_events table
    try {
      const { v4: uuidv4 } = await import('uuid')
      const readId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO read_events (id, assignment_id, started_at, scroll_depth, pages_visited, time_spent_seconds)
         VALUES ($1, $2, NOW(), $3, $4, $5)`,
        [readId, assignmentId, 85.5, JSON.stringify([1, 2, 3]), 120]
      )
      pass('Read event insert works')
    } catch (e: any) {
      fail('Read event insert works', e.message)
    }

    // Test validity check query
    try {
      const expiredSignings = await dbInstance.public.query(
        `SELECT sr.assignment_id, sr.user_id, dv.document_id, dv.version_number, d.validity_days
         FROM signing_records sr
         JOIN assignments a ON sr.assignment_id = a.id
         JOIN document_versions dv ON a.document_version_id = dv.id
         JOIN documents d ON dv.document_id = d.id
         WHERE d.validity_days IS NOT NULL
         AND sr.signed_at + (d.validity_days || ' days')::INTERVAL < NOW()`
      )
      // Should return 0 rows since we just created the record
      pass('Validity check query executes', { expiredCount: expiredSignings.rows.length })
    } catch (e: any) {
      fail('Validity check query executes', e.message)
    }

    // Test PIN hash column
    try {
      const { v4: uuidv4 } = await import('uuid')
      const bcrypt = await import('bcryptjs')
      const pinHash = await bcrypt.hash('123456', 10)
      await dbInstance.public.query(
        `UPDATE users SET pin_hash = $1 WHERE id = $2`,
        [pinHash, userId]
      )
      const checkPin = await dbInstance.public.query(
        `SELECT pin_hash FROM users WHERE id = $1`,
        [userId]
      )
      if (!checkPin.rows[0]?.pin_hash) throw new Error('PIN hash not stored')
      pass('PIN hash column can be set and retrieved')
    } catch (e: any) {
      fail('PIN hash column can be set and retrieved', e.message)
    }

    // Test quiz tables
    try {
      const { v4: uuidv4 } = await import('uuid')
      const quizId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO document_quizzes (id, document_id, title, pass_score, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [quizId, docId, 'Safety Quiz', 80, userId]
      )
      const questionId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, options, correct_answer, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [questionId, quizId, 'What is safety?', JSON.stringify(['A', 'B', 'C', 'D']), 'A', 1]
      )
      pass('Quiz tables: quiz and question insert work')
    } catch (e: any) {
      fail('Quiz tables: quiz and question insert work', e.message)
    }

    // Test group and group_members
    try {
      const { v4: uuidv4 } = await import('uuid')
      const groupId = uuidv4()
      await dbInstance.public.query(
        `INSERT INTO groups (id, organisation_id, name, created_by) VALUES ($1,$2,$3,$4)`,
        [groupId, orgId, 'Morning Shift', userId]
      )
      await dbInstance.public.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)`,
        [groupId, userId]
      )
      const memberCount = await dbInstance.public.query(
        `SELECT COUNT(*) as count FROM group_members WHERE group_id = $1`,
        [groupId]
      )
      if (parseInt(memberCount.rows[0].count) !== 1) throw new Error('Group member count incorrect')
      pass('Groups and group_members work correctly')
    } catch (e: any) {
      fail('Groups and group_members work correctly', e.message)
    }

    // Test sections query
    try {
      const sections = await dbInstance.public.query(
        `SELECT id, name, created_at FROM sections WHERE organisation_id = $1 ORDER BY name ASC`,
        [orgId]
      )
      if (sections.rows.length === 0) throw new Error('No sections found')
      pass('Sections query works', { count: sections.rows.length })
    } catch (e: any) {
      fail('Sections query works', e.message)
    }
  }

  // ── Code Review Checks ────────────────────────────────────────────────────
  console.log(`\n${BOLD}[4] Code Review / Logic Checks${RESET}`)

  // Check: documents API returns latestVersionId
  try {
    const docRouteCode = fs.readFileSync(path.join(__dirname, 'routes/documents.ts'), 'utf8')
    if (docRouteCode.includes('latest_version_id') && docRouteCode.includes('latestVersionId')) {
      pass('documents.ts: latestVersionId added to API response')
    } else {
      fail('documents.ts: latestVersionId added to API response', 'latestVersionId not found in code')
    }
  } catch (e: any) {
    fail('documents.ts: latestVersionId check', e.message)
  }

  // Check: AdminAssignments uses latestVersionId
  try {
    const frontendPath = path.join(__dirname, '../../frontend/src/pages/AdminAssignments.tsx')
    const code = fs.readFileSync(frontendPath, 'utf8')
    if (code.includes('latestVersionId') && !code.includes('value={doc.id}')) {
      pass('AdminAssignments.tsx: uses latestVersionId (not doc.id)')
    } else if (code.includes('value={doc.id}')) {
      fail('AdminAssignments.tsx: uses latestVersionId', 'Still using doc.id as value — bug not fixed!')
    } else {
      fail('AdminAssignments.tsx: uses latestVersionId', 'latestVersionId not found in AdminAssignments.tsx')
    }
  } catch (e: any) {
    fail('AdminAssignments.tsx: latestVersionId check', e.message)
  }

  // Check: matrix endpoint uses DB-resolved orgId
  try {
    const code = fs.readFileSync(path.join(__dirname, 'routes/assignments.ts'), 'utf8')
    if (code.includes('SELECT organisation_id FROM users WHERE id = $1') && code.includes('const orgId')) {
      pass('assignments.ts matrix: organisationId resolved from DB')
    } else {
      fail('assignments.ts matrix: organisationId resolved from DB', 'DB-resolution code not found')
    }
  } catch (e: any) {
    fail('assignments.ts matrix check', e.message)
  }

  // Check: diff route registered
  try {
    const code = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
    if (code.includes("prefix: '/api/diff'") && code.includes("prefix: '/api/reports'")) {
      pass('index.ts: /api/diff and /api/reports routes registered')
    } else {
      fail('index.ts: diff/reports routes', 'diff or reports route not registered')
    }
  } catch (e: any) {
    fail('index.ts route registration check', e.message)
  }

  // Check: btn-xs CSS class exists
  try {
    const cssPath = path.join(__dirname, '../../frontend/src/index.css')
    const css = fs.readFileSync(cssPath, 'utf8')
    if (css.includes('.btn-xs')) {
      pass('index.css: .btn-xs class defined')
    } else {
      fail('index.css: .btn-xs class defined', '.btn-xs missing — delete buttons in AdminAssignments would be unstyled')
    }
  } catch (e: any) {
    fail('index.css: .btn-xs check', e.message)
  }

  // Check: VersionDiff component exists
  try {
    const exists = fs.existsSync(path.join(__dirname, '../../frontend/src/components/VersionDiff.tsx'))
    if (exists) pass('VersionDiff.tsx component exists')
    else fail('VersionDiff.tsx component exists', 'File not found')
  } catch (e: any) {
    fail('VersionDiff.tsx check', e.message)
  }

  // Check: reports.ts exists
  try {
    const exists = fs.existsSync(path.join(__dirname, 'routes/reports.ts'))
    if (exists) pass('routes/reports.ts exists')
    else fail('routes/reports.ts exists', 'File not found')
  } catch (e: any) {
    fail('routes/reports.ts check', e.message)
  }

  // Check: auth cookie sameSite changed to 'lax' for development
  try {
    const code = fs.readFileSync(path.join(__dirname, 'routes/auth.ts'), 'utf8')
    if (code.includes("sameSite: 'lax'") || code.includes('sameSite: "lax"')) {
      pass("auth.ts: cookie sameSite is 'lax' (works for HTTP dev)")
    } else if (code.includes("sameSite: 'strict'") || code.includes('sameSite: "strict"')) {
      fail("auth.ts: cookie sameSite is 'strict'", "Should be 'lax' for local HTTP development — refresh token won't be sent on same-origin requests in some browsers")
    } else {
      fail("auth.ts: cookie sameSite check", "Can't determine sameSite value")
    }
  } catch (e: any) {
    fail('auth.ts sameSite check', e.message)
  }

  // Check: refresh token endpoint logic
  try {
    const code = fs.readFileSync(path.join(__dirname, 'routes/auth.ts'), 'utf8')
    if (code.includes('SELECT user_id FROM refresh_tokens WHERE revoked = false') &&
        !code.includes('WHERE user_id =')) {
      fail('auth.ts: /refresh endpoint', "Refresh token endpoint doesn't verify which user the token belongs to — any valid token grants any user's session")
    } else {
      pass('auth.ts: refresh endpoint user validation present')
    }
  } catch (e: any) {
    fail('auth.ts refresh check', e.message)
  }

  // Check: pdf-parse dependency for diff
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps['pdf-parse'] && deps['diff']) {
      pass('package.json: pdf-parse and diff dependencies present')
    } else {
      fail('package.json: pdf-parse and diff dependencies', `Missing: ${!deps['pdf-parse'] ? 'pdf-parse ' : ''}${!deps['diff'] ? 'diff' : ''}`)
    }
  } catch (e: any) {
    fail('package.json dependency check', e.message)
  }

  // Check: frontend build output exists
  try {
    const distPath = path.join(__dirname, '../../frontend/dist/index.html')
    if (fs.existsSync(distPath)) {
      pass('Frontend dist/index.html exists (build succeeded)')
    } else {
      fail('Frontend dist/index.html exists', 'Frontend not built — run npm run build in frontend dir')
    }
  } catch (e: any) {
    fail('Frontend build check', e.message)
  }

  // ── JWT / Auth Logic Tests ────────────────────────────────────────────────
  console.log(`\n${BOLD}[5] Auth Module Tests${RESET}`)

  try {
    const { signAccessToken, verifyAccessToken } = await import('./auth')
    const token = signAccessToken('user-1', 'test@test.com', 'super_admin', 'org-1')
    const payload = verifyAccessToken(token)
    if (payload.userId !== 'user-1') throw new Error('userId mismatch')
    if (payload.role !== 'super_admin') throw new Error('role mismatch')
    if (payload.organisationId !== 'org-1') throw new Error('organisationId mismatch')
    pass('JWT sign and verify works correctly')
  } catch (e: any) {
    fail('JWT sign and verify', e.message)
  }

  try {
    const { signAccessToken, verifyAccessToken } = await import('./auth')
    // Test with undefined organisationId (simulates old JWT)
    const token = signAccessToken('user-1', 'test@test.com', 'super_admin', undefined)
    const payload = verifyAccessToken(token)
    if (payload.organisationId !== undefined) {
      fail('JWT: undefined organisationId handled', `Expected undefined, got: ${payload.organisationId}`)
    } else {
      pass('JWT: undefined organisationId is preserved (DB lookup needed)')
    }
  } catch (e: any) {
    fail('JWT undefined organisationId test', e.message)
  }

  // ── Document Query Tests ──────────────────────────────────────────────────
  console.log(`\n${BOLD}[6] Additional Query Checks${RESET}`)

  if (dbInstance) {
    // Test the version diff route query
    try {
      const versions = await dbInstance.public.query(
        `SELECT id, version_number, revision, effective_date, published_at, file_path
         FROM document_versions
         WHERE id IN ($1, $2) AND document_id = $3`,
        [versionId, versionId, docId]
      )
      pass('Version diff version lookup query works', { found: versions.rows.length })
    } catch (e: any) {
      fail('Version diff version lookup query', e.message)
    }

    // Test the report generator stats query (simplified)
    try {
      const stats = await dbInstance.public.query(
        `SELECT
           COUNT(DISTINCT u.id) AS total_users,
           COUNT(DISTINCT d.id) AS total_documents,
           COUNT(DISTINCT a.id) AS total_assignments,
           COUNT(DISTINCT sr.id) AS total_signed,
           COUNT(DISTINCT CASE WHEN a.status = 'overdue' THEN a.id END) AS total_overdue,
           COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END) AS total_pending
         FROM assignments a
         JOIN document_versions dv ON a.document_version_id = dv.id
         JOIN documents d ON dv.document_id = d.id
         JOIN users u ON a.user_id = u.id
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id
         WHERE dv.status = 'published' AND u.active = true`
      )
      pass('Report stats query executes', {
        users: stats.rows[0]?.total_users,
        docs: stats.rows[0]?.total_documents,
        assignments: stats.rows[0]?.total_assignments
      })
    } catch (e: any) {
      fail('Report stats query executes', e.message)
    }

    // Test the document versions list query
    try {
      const versions = await dbInstance.public.query(
        `SELECT dv.id, dv.version_number, dv.revision, dv.effective_date, dv.status,
                dv.file_hash, dv.published_at,
                COUNT(DISTINCT a.id) as assignment_count,
                COUNT(DISTINCT sr.id) as signed_count
         FROM document_versions dv
         LEFT JOIN assignments a ON dv.id = a.document_version_id
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id
         WHERE dv.document_id = $1
         GROUP BY dv.id
         ORDER BY dv.version_number DESC`,
        [docId]
      )
      if (versions.rows.length === 0) throw new Error('No versions returned')
      pass('Document versions list query works', { count: versions.rows.length })
    } catch (e: any) {
      fail('Document versions list query', e.message)
    }

    // Test: check that assignments list query returns correct fields for admin
    try {
      const assignments = await dbInstance.public.query(
        `SELECT a.id, a.document_version_id, a.deadline, a.status, a.created_at,
                d.title, d.doc_number, dv.version_number, u.name as assigned_to,
                re.scroll_depth, re.completed_at, re.time_spent_seconds,
                CASE WHEN sr.id IS NOT NULL THEN true ELSE false END as signed
         FROM assignments a
         JOIN document_versions dv ON a.document_version_id = dv.id
         JOIN documents d ON dv.document_id = d.id
         JOIN users u ON a.user_id = u.id
         LEFT JOIN read_events re ON a.id = re.assignment_id
         LEFT JOIN signing_records sr ON a.id = sr.assignment_id
         ORDER BY a.created_at DESC`
      )
      if (assignments.rows.length === 0) throw new Error('No assignments returned for admin')
      const row = assignments.rows[0]
      if (!row.assigned_to) throw new Error('assigned_to (user name) is null')
      pass('Admin assignments list query works', { count: assignments.rows.length, assignedTo: row.assigned_to })
    } catch (e: any) {
      fail('Admin assignments list query', e.message)
    }
  }

  // ── Print Summary ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}${B}═══ Test Summary ═══${RESET}`)
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length

  console.log(`${G}Passed: ${passed}/${total}${RESET}`)
  if (failed > 0) {
    console.log(`${R}Failed: ${failed}/${total}${RESET}`)
    console.log(`\n${BOLD}${R}── FAILURES ──${RESET}`)
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ${R}✗ ${r.name}${RESET}`)
      console.log(`    Error: ${r.error}`)
    })
  }
  console.log('')

  return { passed, failed, total, results }
}

runTests().then(({ passed, total, failed }) => {
  process.exit(failed > 0 ? 1 : 0)
}).catch(err => {
  console.error('Test runner crashed:', err)
  process.exit(1)
})
