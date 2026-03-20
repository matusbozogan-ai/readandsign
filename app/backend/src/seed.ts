import { v4 as uuidv4 } from 'uuid'
import { query, queryOne, queryMany } from './db'
import { hashPassword } from './auth'
import * as fs from 'fs'
import * as path from 'path'
import PDFDocument from 'pdfkit'

export async function seedDatabase() {
  try {
    // Check if already seeded
    const existingOrg = await queryOne(
      `SELECT id FROM organisations WHERE name = 'Demo Aviation GH' LIMIT 1`,
    )

    if (existingOrg) {
      console.log('Database already seeded, skipping...')
      return
    }

    // Create organisation
    const orgId = uuidv4()
    await query(`INSERT INTO organisations (id, name, subtitle) VALUES ($1, $2, $3)`, [
      orgId,
      'Demo Aviation GH',
      'Vienna Airport · Ground Handling',
    ])
    console.log('Created organisation: Demo Aviation GH')

    // Create sections
    const rampSectionId = uuidv4()
    const paxSectionId = uuidv4()

    await query(`INSERT INTO sections (id, organisation_id, name) VALUES ($1, $2, $3)`, [
      rampSectionId,
      orgId,
      'Ramp Operations',
    ])

    await query(`INSERT INTO sections (id, organisation_id, name) VALUES ($1, $2, $3)`, [
      paxSectionId,
      orgId,
      'Passenger Services',
    ])
    console.log('Created sections: Ramp Operations, Passenger Services')

    // Create users
    const adminId = uuidv4()
    const adminHash = await hashPassword('Admin123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [adminId, orgId, null, 'admin@demo.com', adminHash, 'Super Admin', 'super_admin'],
    )

    // Ramp section admin
    const rampAdminId = uuidv4()
    const rampAdminHash = await hashPassword('Admin123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [rampAdminId, orgId, rampSectionId, 'ramp.admin@demo.com', rampAdminHash, 'Ramp Admin', 'section_admin'],
    )

    // Pax section admin
    const paxAdminId = uuidv4()
    const paxAdminHash = await hashPassword('Admin123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [paxAdminId, orgId, paxSectionId, 'pax.admin@demo.com', paxAdminHash, 'Passenger Admin', 'section_admin'],
    )

    // Ramp users
    const user1Id = uuidv4()
    const user1Hash = await hashPassword('User123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, employee_number, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [user1Id, orgId, rampSectionId, 'user1@demo.com', user1Hash, 'John Smith', 'EMP001', 'user'],
    )

    const user2Id = uuidv4()
    const user2Hash = await hashPassword('User123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, employee_number, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [user2Id, orgId, rampSectionId, 'user2@demo.com', user2Hash, 'Jane Doe', 'EMP002', 'user'],
    )

    // Pax users
    const user3Id = uuidv4()
    const user3Hash = await hashPassword('User123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, employee_number, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [user3Id, orgId, paxSectionId, 'user3@demo.com', user3Hash, 'Alice Johnson', 'EMP003', 'user'],
    )

    const user4Id = uuidv4()
    const user4Hash = await hashPassword('User123!')

    await query(
      `INSERT INTO users (id, organisation_id, section_id, email, password_hash, name, employee_number, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [user4Id, orgId, paxSectionId, 'user4@demo.com', user4Hash, 'Bob Wilson', 'EMP004', 'user'],
    )

    console.log('Created 7 users (1 super admin, 2 section admins, 4 regular users)')

    // Create group
    const groupId = uuidv4()
    await query(`INSERT INTO groups (id, organisation_id, section_id, name) VALUES ($1, $2, $3, $4)`, [
      groupId,
      orgId,
      rampSectionId,
      'Morning Shift',
    ])

    // Add members to group
    await query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [groupId, user1Id])
    await query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [groupId, user2Id])

    console.log('Created group: Morning Shift with 2 members')

    // Create documents
    const doc1Id = uuidv4()
    await query(
      `INSERT INTO documents (id, organisation_id, section_id, title, doc_number, category, issuer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        doc1Id,
        orgId,
        rampSectionId,
        'Aircraft Ground Handling Manual',
        'DOC-001',
        'Operations',
        'Safety Department',
        adminId,
      ],
    )

    const doc2Id = uuidv4()
    await query(
      `INSERT INTO documents (id, organisation_id, section_id, title, doc_number, category, issuer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        doc2Id,
        orgId,
        rampSectionId,
        'Ramp Safety Procedures',
        'DOC-002',
        'Safety',
        'Operations',
        rampAdminId,
      ],
    )

    const doc3Id = uuidv4()
    await query(
      `INSERT INTO documents (id, organisation_id, section_id, title, doc_number, category, issuer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        doc3Id,
        orgId,
        paxSectionId,
        'Customer Service Standards',
        'DOC-003',
        'Compliance',
        'HR Department',
        paxAdminId,
      ],
    )

    console.log('Created 3 sample documents')

    // Create document versions with PDF files
    const uploadDir = process.env.UPLOAD_DIR || '/uploads'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    // Helper: generate a valid PDF using pdfkit
    const generateSamplePdf = (title: string, content: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 60 })
        const chunks: Buffer[] = []
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        // Title
        doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' })
        doc.moveDown(1.5)

        // Body content (2 pages worth of text)
        doc.fontSize(12).font('Helvetica').text(content, { align: 'justify' })
        doc.moveDown()

        // Section headings and paragraphs
        const sections = [
          { heading: '1. Purpose and Scope', body: 'This document establishes the standards and procedures required for safe and efficient operations. All personnel must read and understand these guidelines before commencing duties. Compliance with these procedures is mandatory for all staff members.' },
          { heading: '2. Responsibilities', body: 'All team members are responsible for adhering to the procedures outlined in this document. Supervisors are responsible for ensuring compliance within their teams. Any deviations must be reported immediately to the relevant authority.' },
          { heading: '3. Safety Requirements', body: 'Personnel must wear appropriate personal protective equipment at all times while on the operational area. Safety briefings must be conducted at the start of each shift. Any unsafe condition must be reported and corrected immediately.' },
          { heading: '4. Operating Procedures', body: 'Follow the step-by-step instructions provided in this section carefully. Do not skip steps or take shortcuts. If uncertain about any procedure, consult your supervisor before proceeding.' },
          { heading: '5. Emergency Procedures', body: 'In the event of an emergency, follow the established emergency response plan. Evacuate the area using designated emergency exits. Do not use elevators during emergencies. Report all incidents to the safety officer.' },
          { heading: '6. Documentation and Reporting', body: 'All activities must be documented accurately and completely. Records must be maintained for the specified retention period. Falsification of records is a serious violation and will result in disciplinary action.' },
        ]

        for (const section of sections) {
          doc.moveDown(0.8)
          doc.fontSize(14).font('Helvetica-Bold').text(section.heading)
          doc.moveDown(0.4)
          doc.fontSize(11).font('Helvetica').text(section.body, { align: 'justify' })
        }

        doc.moveDown(2)
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888888')
          .text('This document is for training and demonstration purposes. Employees must sign this document to confirm they have read and understood its contents.', { align: 'center' })

        doc.end()
      })
    }

    const docTitles = [
      'Aircraft Ground Handling Manual',
      'Ramp Safety Procedures',
      'Customer Service Standards',
    ]

    const docDescriptions = [
      'This manual covers all aspects of aircraft ground handling operations including marshalling, pushback procedures, fuelling safety, baggage handling, and aircraft servicing. Ground handlers must be familiar with all sections before performing any aircraft-side duties.',
      'These safety procedures govern all ramp operations and must be strictly followed to prevent accidents and injuries. The ramp is a hazardous environment and requires constant vigilance and adherence to safety protocols.',
      'This document outlines the standards expected of all customer service personnel. Providing excellent service while maintaining safety and regulatory compliance is the cornerstone of our passenger services department.',
    ]

    // Version 1 for each document
    for (let i = 0; i < 3; i++) {
      const docId = [doc1Id, doc2Id, doc3Id][i]
      const verId = uuidv4()
      const filePath = path.join(uploadDir, `${docId}_v1_${Date.now()}.pdf`)

      const pdfBuffer = await generateSamplePdf(docTitles[i], docDescriptions[i])
      fs.writeFileSync(filePath, pdfBuffer)

      await query(
        `INSERT INTO document_versions (id, document_id, version_number, revision, effective_date, file_path, file_hash, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [verId, docId, 1, 'Initial Version', '2026-01-01', filePath, 'hash123', 'published'],
      )
    }

    console.log('Created document versions with PDF files')

    // Create assignments
    const today = new Date()
    const deadline = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

    // Get the version IDs
    const version1 = await queryOne(
      `SELECT id FROM document_versions WHERE document_id = $1 AND version_number = 1`,
      [doc1Id],
    )

    const version2 = await queryOne(
      `SELECT id FROM document_versions WHERE document_id = $1 AND version_number = 1`,
      [doc2Id],
    )

    const version3 = await queryOne(
      `SELECT id FROM document_versions WHERE document_id = $1 AND version_number = 1`,
      [doc3Id],
    )

    if (version1 && version2 && version3) {
      const versionId1 = (version1 as any).id
      const versionId2 = (version2 as any).id
      const versionId3 = (version3 as any).id

      // Assign documents to users
      for (const userId of [user1Id, user2Id]) {
        const assignmentId = uuidv4()
        await query(
          `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, deadline, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [assignmentId, versionId1, userId, rampAdminId, deadline],
        )

        // Create read event with some progress
        const readEventId = uuidv4()
        await query(
          `INSERT INTO read_events (id, assignment_id, started_at, scroll_depth, time_spent_seconds, pages_visited)
           VALUES ($1, $2, NOW(), 45, 120, '[]')`,
          [readEventId, assignmentId],
        )
      }

      // Assign doc 2 to ramp users
      const assign2Id = uuidv4()
      await query(
        `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, deadline, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [assign2Id, versionId2, user1Id, rampAdminId, deadline],
      )

      // Assign doc 3 to pax users
      for (const userId of [user3Id, user4Id]) {
        const assignmentId = uuidv4()
        await query(
          `INSERT INTO assignments (id, document_version_id, user_id, assigned_by, deadline, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [assignmentId, versionId3, userId, paxAdminId, deadline],
        )
      }
    }

    console.log('Created sample assignments')

    // Seed document option lists (categories and issuers)
    const seedCategories = ['Operations', 'Safety', 'HR', 'Compliance', 'Training', 'Emergency Procedures']
    const seedIssuers = ['Safety Department', 'Operations', 'HR Department', 'Compliance Office', 'Training Centre']

    for (const cat of seedCategories) {
      await query(
        `INSERT INTO document_options (organisation_id, type, value)
         VALUES ($1, 'category', $2)
         ON CONFLICT (organisation_id, type, value) DO NOTHING`,
        [orgId, cat],
      )
    }
    for (const iss of seedIssuers) {
      await query(
        `INSERT INTO document_options (organisation_id, type, value)
         VALUES ($1, 'issuer', $2)
         ON CONFLICT (organisation_id, type, value) DO NOTHING`,
        [orgId, iss],
      )
    }
    console.log('Seeded document categories and issuers')

    // Log seeding
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, metadata)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'SEED_DATABASE', 'system', JSON.stringify({ org: orgId })],
    )

    console.log('Database seed completed successfully')
  } catch (err) {
    console.error('Error seeding database:', err)
    throw err
  }
}

/**
 * Repair any document version files that are corrupt or too small to be valid PDFs.
 * This handles existing databases that were seeded with the old invalid byte-array PDF.
 * Safe to run on every startup — it only replaces files smaller than 1 KB.
 */
export async function repairInvalidPdfFiles(): Promise<void> {
  try {
    const versions = await queryMany<any>(
      `SELECT dv.id, dv.file_path, d.title
       FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       WHERE dv.file_path IS NOT NULL`,
    )

    let repaired = 0
    for (const v of versions) {
      const filePath: string = v.file_path
      if (!filePath) continue

      // Only attempt to repair PDF files — skip Office formats
      const fileExt = path.extname(filePath).toLowerCase()
      if (fileExt && fileExt !== '.pdf') continue

      // Check if file exists, is a reasonable size, and starts with the PDF magic bytes
      let needsRepair = false
      if (!fs.existsSync(filePath)) {
        needsRepair = true
      } else {
        const stat = fs.statSync(filePath)
        if (stat.size < 1024) {
          needsRepair = true  // anything under 1 KB is definitely corrupt
        } else {
          // Read the first 8 bytes and check for the %PDF- magic signature
          const fd = fs.openSync(filePath, 'r')
          const magic = Buffer.alloc(8)
          fs.readSync(fd, magic, 0, 8, 0)
          fs.closeSync(fd)
          if (!magic.toString('ascii').startsWith('%PDF-')) {
            needsRepair = true  // file exists but is not a valid PDF
          }
        }
      }

      if (!needsRepair) continue

      // Ensure directory exists
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      // Regenerate a proper PDF
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 60 })
        const chunks: Buffer[] = []
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const title: string = v.title || 'Sample Document'
        doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' })
        doc.moveDown(1.5)
        doc.fontSize(12).font('Helvetica').text(
          'This is a sample document generated for demonstration purposes. ' +
          'Please read this document carefully before signing. ' +
          'It contains important information about operational procedures and safety requirements.\n\n' +
          'All personnel are expected to understand and comply with the guidelines contained herein. ' +
          'Questions about any section should be directed to your supervisor before signing.',
          { align: 'justify' },
        )
        doc.moveDown(2)
        doc.fontSize(14).font('Helvetica-Bold').text('1. Introduction')
        doc.moveDown(0.4)
        doc.fontSize(11).font('Helvetica').text(
          'This document establishes the standards and procedures required for safe and efficient operations. ' +
          'All personnel must read and understand these guidelines before commencing duties.',
          { align: 'justify' },
        )
        doc.moveDown()
        doc.fontSize(14).font('Helvetica-Bold').text('2. Safety Requirements')
        doc.moveDown(0.4)
        doc.fontSize(11).font('Helvetica').text(
          'Safety is the top priority. Personnel must adhere to all safety protocols at all times. ' +
          'Protective equipment must be worn in designated areas. Any unsafe condition must be reported immediately.',
          { align: 'justify' },
        )
        doc.moveDown()
        doc.fontSize(14).font('Helvetica-Bold').text('3. Compliance')
        doc.moveDown(0.4)
        doc.fontSize(11).font('Helvetica').text(
          'Compliance with these procedures is mandatory. Violations may result in disciplinary action. ' +
          'By signing this document you confirm you have read and understood all sections.',
          { align: 'justify' },
        )
        doc.end()
      })

      fs.writeFileSync(filePath, pdfBuffer)
      repaired++
      console.log(`Repaired invalid PDF: ${filePath}`)
    }

    if (repaired > 0) {
      console.log(`PDF repair complete: ${repaired} file(s) replaced with valid PDFs`)
    }
  } catch (err) {
    console.error('PDF repair check failed (non-fatal):', err)
  }
}
