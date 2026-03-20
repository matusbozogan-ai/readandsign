import { FastifyInstance } from 'fastify'
import PDFDocument from 'pdfkit'
import { authenticate } from '../middleware'
import { queryOne, queryMany } from '../db'

// ─── Colour palette (matches certificate.ts navy theme) ───────────────────────
const NAVY = '#1a2e4a'
const LIGHT_BLUE = '#e8f0fe'
const MID_BLUE = '#4a6fa5'
const GREEN = '#27ae60'
const ORANGE = '#e67e22'
const RED = '#c0392b'
const GREY = '#7f8c8d'
const LIGHT_GREY = '#f5f5f5'
const DARK_TEXT = '#2c3e50'

interface ReportParams {
  sectionId?: string
  from?: string
  to?: string
  format?: 'pdf' | 'json'
}

interface CustomerReportParams {
  customerId: string
}

export default async function reportsRoutes(app: FastifyInstance) {
  // GET /api/reports/customer — Customer Compliance Report
  app.get<{ Querystring: CustomerReportParams }>(
    '/customer',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      if (req.user.role === 'user') return reply.status(403).send({ error: 'Admin access required' })

      const { customerId } = req.query
      if (!customerId) return reply.status(400).send({ error: 'customerId is required' })

      const generatedAt = new Date()

      try {
        // Customer info
        const customer = await queryOne<any>(
          `SELECT id, name, contact_email, notes FROM customers WHERE id = $1`,
          [customerId],
        )
        if (!customer) return reply.status(404).send({ error: 'Customer not found' })

        const org = await queryOne<any>(
          `SELECT o.name FROM organisations o
           JOIN users u ON u.organisation_id = o.id
           WHERE u.id = $1`,
          [req.user.userId],
        )
        const orgName = org?.name || 'Organisation'

        // All documents for this customer with assignment stats
        const documents = await queryMany<any>(
          `SELECT
             d.id, d.title, d.doc_number, d.category, d.issuer,
             MAX(dv.version_number) AS latest_version,
             COUNT(DISTINCT a.id) AS total_assigned,
             COUNT(DISTINCT sr.id) AS total_signed,
             COUNT(DISTINCT CASE WHEN a.status = 'overdue' THEN a.id END) AS overdue_count,
             COUNT(DISTINCT CASE WHEN a.status IN ('pending','in_progress','read') THEN a.id END) AS pending_count
           FROM documents d
           JOIN document_versions dv ON dv.document_id = d.id AND dv.status = 'published'
           LEFT JOIN assignments a   ON a.document_version_id = dv.id
           LEFT JOIN users u         ON a.user_id = u.id AND u.active = true
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE d.customer_id = $1
           GROUP BY d.id
           ORDER BY d.title`,
          [customerId],
        )

        // Per-user signing detail for this customer's documents
        const userRows = await queryMany<any>(
          `SELECT
             u.name AS user_name, u.email, u.employee_number,
             s.name AS section_name,
             d.title AS doc_title, d.doc_number,
             dv.version_number,
             a.status, a.deadline,
             sr.signed_at, sr.method
           FROM documents d
           JOIN document_versions dv ON dv.document_id = d.id AND dv.status = 'published'
           JOIN assignments a        ON a.document_version_id = dv.id
           JOIN users u              ON a.user_id = u.id AND u.active = true
           LEFT JOIN sections s      ON u.section_id = s.id
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE d.customer_id = $1
           ORDER BY d.title, u.name`,
          [customerId],
        )

        const pdfBuffer = await buildCustomerReportPdf({
          orgName,
          customer,
          generatedAt,
          generatedBy: req.user.email || 'Administrator',
          documents,
          userRows,
        })

        reply.type('application/pdf')
        reply.header('Content-Disposition', `attachment; filename="customer-report-${customer.name.replace(/\s+/g, '-')}-${generatedAt.toISOString().split('T')[0]}.pdf"`)
        return reply.send(pdfBuffer)
      } catch (err: any) {
        console.error('Customer report error:', err)
        return reply.status(500).send({ error: `Failed to generate report: ${err.message}` })
      }
    },
  )

  // GET /api/reports/compliance
  app.get<{ Querystring: ReportParams }>(
    '/compliance',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Admin access required' })
      }

      const { sectionId, from, to, format = 'pdf' } = req.query
      const generatedAt = new Date()

      try {
        // ── 1. Organisation name ──────────────────────────────────────────────
        const org = await queryOne<any>(
          `SELECT o.name FROM organisations o
           JOIN users u ON u.organisation_id = o.id
           WHERE u.id = $1`,
          [req.user.userId],
        )
        const orgName = org?.name || 'Organisation'

        // ── 2. Overall stats ─────────────────────────────────────────────────
        const statsQuery = `
          SELECT
            COUNT(DISTINCT u.id)                                          AS total_users,
            COUNT(DISTINCT d.id)                                          AS total_documents,
            COUNT(DISTINCT a.id)                                          AS total_assignments,
            COUNT(DISTINCT sr.id)                                         AS total_signed,
            COUNT(DISTINCT CASE WHEN a.status = 'overdue' THEN a.id END)  AS total_overdue,
            COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END)  AS total_pending
          FROM assignments a
          JOIN document_versions dv ON a.document_version_id = dv.id
          JOIN documents d          ON dv.document_id = d.id
          JOIN users u              ON a.user_id = u.id
          LEFT JOIN signing_records sr ON a.id = sr.assignment_id
          WHERE dv.status = 'published'
            AND u.active = true
            ${sectionId ? 'AND u.section_id = $1' : ''}
            ${from ? `AND a.created_at >= ${sectionId ? '$2' : '$1'}` : ''}
            ${to ? `AND a.created_at <= ${sectionId ? (from ? '$3' : '$2') : (from ? '$2' : '$1')}` : ''}
        `
        const statsParams: any[] = []
        if (sectionId) statsParams.push(sectionId)
        if (from) statsParams.push(from)
        if (to) statsParams.push(to)

        const stats = await queryOne<any>(statsQuery, statsParams)

        // ── 3. Per-section breakdown ──────────────────────────────────────────
        const sectionRows = await queryMany<any>(
          `SELECT
             s.id, s.name,
             COUNT(DISTINCT u.id)                                                   AS user_count,
             COUNT(DISTINCT a.id)                                                   AS assignments,
             COUNT(DISTINCT sr.id)                                                  AS signed,
             COUNT(DISTINCT CASE WHEN a.status = 'overdue' THEN a.id END)          AS overdue,
             COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END)          AS pending
           FROM sections s
           LEFT JOIN users u        ON u.section_id = s.id AND u.active = true
           LEFT JOIN assignments a  ON a.user_id = u.id
             JOIN document_versions dv ON a.document_version_id = dv.id AND dv.status = 'published'
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE ($1::text IS NULL OR s.id = $1::uuid)
           GROUP BY s.id, s.name
           ORDER BY s.name`,
          [sectionId || null],
        )

        // ── 4. Per-document compliance ────────────────────────────────────────
        const documentRows = await queryMany<any>(
          `SELECT
             d.id, d.title, d.doc_number, d.category,
             MAX(dv.version_number)                                                 AS latest_version,
             COUNT(DISTINCT a.id)                                                   AS total_assigned,
             COUNT(DISTINCT sr.id)                                                  AS total_signed,
             COUNT(DISTINCT CASE WHEN a.status = 'overdue' THEN a.id END)          AS overdue_count
           FROM documents d
           JOIN document_versions dv ON dv.document_id = d.id AND dv.status = 'published'
           LEFT JOIN assignments a   ON a.document_version_id = dv.id
           LEFT JOIN users u         ON a.user_id = u.id AND u.active = true
           LEFT JOIN signing_records sr ON a.id = sr.assignment_id
           WHERE ($1::text IS NULL OR u.section_id = $1::uuid OR u.id IS NULL)
           GROUP BY d.id, d.title, d.doc_number, d.category
           ORDER BY d.title`,
          [sectionId || null],
        )

        // ── 5. Outstanding non-compliance list (top 20) ───────────────────────
        const overdueRows = await queryMany<any>(
          `SELECT
             u.name AS user_name, u.email, u.employee_number,
             s.name AS section_name,
             d.title AS doc_title, d.doc_number,
             a.deadline, a.status,
             EXTRACT(DAY FROM NOW() - a.deadline) AS days_overdue
           FROM assignments a
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d          ON dv.document_id = d.id
           JOIN users u              ON a.user_id = u.id AND u.active = true
           LEFT JOIN sections s      ON u.section_id = s.id
           WHERE a.status IN ('overdue', 'pending')
             AND dv.status = 'published'
             ${sectionId ? 'AND u.section_id = $1' : ''}
           ORDER BY a.status DESC, a.deadline ASC NULLS LAST
           LIMIT 20`,
          sectionId ? [sectionId] : [],
        )

        // ── 6. Recent signings (last 20) ──────────────────────────────────────
        const recentSignings = await queryMany<any>(
          `SELECT
             u.name AS user_name, u.employee_number,
             s.name AS section_name,
             d.title AS doc_title, d.doc_number,
             dv.version_number,
             sr.signed_at, sr.method
           FROM signing_records sr
           JOIN assignments a        ON sr.assignment_id = a.id
           JOIN document_versions dv ON a.document_version_id = dv.id
           JOIN documents d          ON dv.document_id = d.id
           JOIN users u              ON sr.user_id = u.id
           LEFT JOIN sections s      ON u.section_id = s.id
           WHERE ($1::text IS NULL OR u.section_id = $1::uuid)
             ${from ? 'AND sr.signed_at >= $2' : ''}
             ${to ? `AND sr.signed_at <= ${from ? '$3' : '$2'}` : ''}
           ORDER BY sr.signed_at DESC
           LIMIT 20`,
          (() => {
            const p: any[] = [sectionId || null]
            if (from) p.push(from)
            if (to) p.push(to)
            return p
          })(),
        )

        if (format === 'json') {
          return reply.send({ stats, sections: sectionRows, documents: documentRows, overdue: overdueRows, recentSignings })
        }

        // ── 7. Build PDF ──────────────────────────────────────────────────────
        const pdfBuffer = await buildReportPdf({
          orgName,
          generatedAt,
          generatedBy: req.user.email || 'Administrator',
          sectionFilter: sectionId ? sectionRows.find((s: any) => s.id === sectionId)?.name : undefined,
          dateFrom: from,
          dateTo: to,
          stats,
          sections: sectionRows,
          documents: documentRows,
          overdue: overdueRows,
          recentSignings,
        })

        reply.type('application/pdf')
        reply.header('Content-Disposition', `attachment; filename="compliance-report-${generatedAt.toISOString().split('T')[0]}.pdf"`)
        return reply.send(pdfBuffer)
      } catch (err: any) {
        console.error('Report error:', err)
        return reply.status(500).send({ error: `Failed to generate report: ${err.message}` })
      }
    },
  )
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

interface ReportData {
  orgName: string
  generatedAt: Date
  generatedBy: string
  sectionFilter?: string
  dateFrom?: string
  dateTo?: string
  stats: any
  sections: any[]
  documents: any[]
  overdue: any[]
  recentSignings: any[]
}

async function buildReportPdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ── COVER PAGE ────────────────────────────────────────────────────────────
    doc.addPage()

    // Navy header band
    doc.rect(0, 0, doc.page.width, 200).fill(NAVY)

    // Org name
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text(data.orgName, 50, 60, { width: doc.page.width - 100, align: 'center' })

    doc.fillColor('white').fontSize(15).font('Helvetica')
      .text('COMPLIANCE REPORT', 50, 100, { width: doc.page.width - 100, align: 'center' })

    // Date range under header
    doc.fillColor(DARK_TEXT).fontSize(12).font('Helvetica')
    let dateLabel = 'All Time'
    if (data.dateFrom && data.dateTo) dateLabel = `${fmtDate(data.dateFrom)} – ${fmtDate(data.dateTo)}`
    else if (data.dateFrom) dateLabel = `From ${fmtDate(data.dateFrom)}`
    else if (data.dateTo) dateLabel = `Until ${fmtDate(data.dateTo)}`

    doc.text(dateLabel, 50, 215, { align: 'center', width: doc.page.width - 100 })
    if (data.sectionFilter) {
      doc.text(`Section: ${data.sectionFilter}`, 50, 235, { align: 'center', width: doc.page.width - 100 })
    }

    // Divider
    doc.moveTo(50, 260).lineTo(doc.page.width - 50, 260).strokeColor(MID_BLUE).lineWidth(1).stroke()

    // Summary key metrics boxes
    const metrics = [
      { label: 'Users', value: data.stats?.total_users ?? 0, color: NAVY },
      { label: 'Documents', value: data.stats?.total_documents ?? 0, color: NAVY },
      { label: 'Assignments', value: data.stats?.total_assignments ?? 0, color: NAVY },
      { label: 'Signed', value: data.stats?.total_signed ?? 0, color: GREEN },
      { label: 'Pending', value: data.stats?.total_pending ?? 0, color: ORANGE },
      { label: 'Overdue', value: data.stats?.total_overdue ?? 0, color: RED },
    ]

    const totalAssigned = Number(data.stats?.total_assignments ?? 0)
    const totalSigned = Number(data.stats?.total_signed ?? 0)
    const compliancePct = totalAssigned > 0 ? Math.round((totalSigned / totalAssigned) * 100) : 0

    const boxW = 80
    const boxH = 65
    const boxGap = 12
    const totalBoxW = metrics.length * boxW + (metrics.length - 1) * boxGap
    const startX = (doc.page.width - totalBoxW) / 2

    metrics.forEach((m, i) => {
      const bx = startX + i * (boxW + boxGap)
      const by = 275
      doc.rect(bx, by, boxW, boxH).fill(LIGHT_GREY)
      doc.fillColor(m.color).fontSize(22).font('Helvetica-Bold')
        .text(String(m.value), bx, by + 10, { width: boxW, align: 'center' })
      doc.fillColor(GREY).fontSize(9).font('Helvetica')
        .text(m.label, bx, by + 40, { width: boxW, align: 'center' })
    })

    // Overall compliance %
    const pctY = 360
    doc.fillColor(DARK_TEXT).fontSize(13).font('Helvetica-Bold')
      .text('Overall Compliance Rate', 50, pctY, { align: 'center', width: doc.page.width - 100 })

    // Progress bar
    const barX = 150; const barY = pctY + 25; const barW = doc.page.width - 300
    doc.rect(barX, barY, barW, 20).fill('#e0e0e0')
    const fillColor = compliancePct >= 90 ? GREEN : compliancePct >= 70 ? ORANGE : RED
    doc.rect(barX, barY, barW * (compliancePct / 100), 20).fill(fillColor)
    doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
      .text(`${compliancePct}%`, barX, barY + 4, { width: barW, align: 'center' })

    // Generated by
    doc.fillColor(GREY).fontSize(9).font('Helvetica')
      .text(`Generated: ${fmtDateTime(data.generatedAt)}   |   By: ${data.generatedBy}`, 50, doc.page.height - 60, {
        align: 'center', width: doc.page.width - 100,
      })

    // ── SECTION BREAKDOWN PAGE ────────────────────────────────────────────────
    if (data.sections.length > 0) {
      doc.addPage()
      sectionHeader(doc, 'Section Compliance Breakdown')

      const colWidths = [140, 55, 75, 65, 65, 65, 75]
      const cols = ['Section', 'Users', 'Assignments', 'Signed', 'Pending', 'Overdue', 'Compliance']
      tableHeader(doc, cols, colWidths, doc.y)

      for (const s of data.sections) {
        const assigned = Number(s.assignments ?? 0)
        const signed = Number(s.signed ?? 0)
        const pct = assigned > 0 ? Math.round((signed / assigned) * 100) : 0
        const overdue = Number(s.overdue ?? 0)

        const rowValues = [
          s.name || '(No Section)',
          String(s.user_count ?? 0),
          String(assigned),
          String(signed),
          String(s.pending ?? 0),
          String(overdue),
          `${pct}%`,
        ]
        const rowColor = overdue > 0 ? '#fff5f5' : signed === assigned && assigned > 0 ? '#f0fff4' : 'white'
        tableRow(doc, rowValues, colWidths, rowColor)

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, 'Section Compliance Breakdown (cont.)')
          tableHeader(doc, cols, colWidths, doc.y)
        }
      }
    }

    // ── DOCUMENT COMPLIANCE PAGE ──────────────────────────────────────────────
    if (data.documents.length > 0) {
      doc.addPage()
      sectionHeader(doc, 'Document Compliance Summary')

      const colWidths2 = [185, 75, 70, 70, 65, 75]
      const cols2 = ['Document', 'Doc Number', 'Ver', 'Assigned', 'Signed', 'Compliance']
      tableHeader(doc, cols2, colWidths2, doc.y)

      for (const d of data.documents) {
        const assigned = Number(d.total_assigned ?? 0)
        const signed = Number(d.total_signed ?? 0)
        const pct = assigned > 0 ? Math.round((signed / assigned) * 100) : 0
        const overdue = Number(d.overdue_count ?? 0)

        const rowValues2 = [
          truncate(d.title, 32),
          d.doc_number || '—',
          String(d.latest_version ?? '—'),
          String(assigned),
          String(signed),
          `${pct}%`,
        ]
        const rowColor2 = overdue > 0 ? '#fff5f5' : pct === 100 && assigned > 0 ? '#f0fff4' : 'white'
        tableRow(doc, rowValues2, colWidths2, rowColor2)

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, 'Document Compliance Summary (cont.)')
          tableHeader(doc, cols2, colWidths2, doc.y)
        }
      }
    }

    // ── OUTSTANDING NON-COMPLIANCE PAGE ───────────────────────────────────────
    if (data.overdue.length > 0) {
      doc.addPage()
      sectionHeader(doc, 'Outstanding Non-Compliance')

      doc.fillColor(RED).fontSize(9).font('Helvetica')
        .text('The following assignments are overdue or pending. Immediate action may be required for audit readiness.', 50, doc.y, {
          width: doc.page.width - 100,
        })
      doc.moveDown(0.5)

      const colWidths3 = [100, 80, 90, 110, 65, 55]
      const cols3 = ['Employee', 'Section', 'Document', 'Email', 'Deadline', 'Status']
      tableHeader(doc, cols3, colWidths3, doc.y)

      for (const r of data.overdue) {
        const statusColor = r.status === 'overdue' ? RED : ORANGE
        const rowValues3 = [
          truncate(r.user_name, 14),
          truncate(r.section_name || '—', 12),
          truncate(r.doc_title, 18),
          truncate(r.email, 20),
          r.deadline ? fmtDate(r.deadline) : '—',
          r.status.toUpperCase(),
        ]
        tableRowWithColor(doc, rowValues3, colWidths3, 'white', [null, null, null, null, null, statusColor])

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, 'Outstanding Non-Compliance (cont.)')
          tableHeader(doc, cols3, colWidths3, doc.y)
        }
      }
    }

    // ── RECENT SIGNINGS APPENDIX ──────────────────────────────────────────────
    if (data.recentSignings.length > 0) {
      doc.addPage()
      sectionHeader(doc, 'Recent Signing Records')

      const colWidths4 = [105, 80, 130, 65, 80, 40]
      const cols4 = ['Employee', 'Section', 'Document', 'Version', 'Signed At', 'Method']
      tableHeader(doc, cols4, colWidths4, doc.y)

      for (const r of data.recentSignings) {
        const rowValues4 = [
          truncate(r.user_name, 16),
          truncate(r.section_name || '—', 12),
          truncate(r.doc_title, 22),
          `v${r.version_number}`,
          r.signed_at ? fmtDateTime(new Date(r.signed_at)) : '—',
          r.method === 'pin' ? 'PIN' : 'PWD',
        ]
        tableRow(doc, rowValues4, colWidths4, 'white')

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, 'Recent Signing Records (cont.)')
          tableHeader(doc, cols4, colWidths4, doc.y)
        }
      }
    }

    // Page numbers
    const pageCount = (doc as any).bufferedPageRange().count
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i)
      doc.fillColor(GREY).fontSize(8).font('Helvetica')
        .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30, {
          align: 'right', width: doc.page.width - 100,
        })
    }

    doc.end()
  })
}

// ─── Table helpers ────────────────────────────────────────────────────────────

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.rect(50, doc.y, doc.page.width - 100, 28).fill(NAVY)
  doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
    .text(title, 58, doc.y - 20, { width: doc.page.width - 116 })
  doc.moveDown(1.2)
}

function tableHeader(doc: PDFKit.PDFDocument, cols: string[], widths: number[], y: number) {
  let x = 50
  doc.rect(50, y, widths.reduce((a, b) => a + b, 0), 18).fill(LIGHT_BLUE)
  doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold')
  cols.forEach((col, i) => {
    doc.text(col, x + 3, y + 4, { width: widths[i] - 6, align: 'left' })
    x += widths[i]
  })
  doc.y = y + 18
}

function tableRow(doc: PDFKit.PDFDocument, values: string[], widths: number[], bgColor: string) {
  tableRowWithColor(doc, values, widths, bgColor, [])
}

function tableRowWithColor(
  doc: PDFKit.PDFDocument,
  values: string[],
  widths: number[],
  bgColor: string,
  cellColors: (string | null)[],
) {
  const rowH = 16
  const y = doc.y
  const totalW = widths.reduce((a, b) => a + b, 0)
  doc.rect(50, y, totalW, rowH).fill(bgColor)

  // Border
  doc.rect(50, y, totalW, rowH).strokeColor('#e0e0e0').lineWidth(0.5).stroke()

  let x = 50
  doc.fontSize(8).font('Helvetica')
  values.forEach((val, i) => {
    const color = cellColors[i] || DARK_TEXT
    doc.fillColor(color).text(val, x + 3, y + 3, { width: widths[i] - 6, align: 'left', lineBreak: false })
    x += widths[i]
  })
  doc.y = y + rowH
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDate(d: string | Date): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d).split('T')[0]
  return dt.toISOString().split('T')[0]
}

function fmtDateTime(d: Date): string {
  if (!d || isNaN(d.getTime())) return '—'
  return d.toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
}

function truncate(s: string | null | undefined, maxLen: number): string {
  if (!s) return '—'
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '…' : s
}

// ─── Customer PDF builder ─────────────────────────────────────────────────────

interface CustomerReportData {
  orgName: string
  customer: { id: string; name: string; contact_email: string | null; notes: string | null }
  generatedAt: Date
  generatedBy: string
  documents: any[]
  userRows: any[]
}

async function buildCustomerReportPdf(data: CustomerReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ── COVER PAGE ──────────────────────────────────────────────────────────
    doc.addPage()

    // Navy header band
    doc.rect(0, 0, doc.page.width, 180).fill(NAVY)

    doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
      .text(data.orgName, 50, 50, { width: doc.page.width - 100, align: 'center' })
    doc.fillColor('white').fontSize(14).font('Helvetica')
      .text('CUSTOMER COMPLIANCE REPORT', 50, 82, { width: doc.page.width - 100, align: 'center' })
    doc.fillColor('#90B8D8').fontSize(18).font('Helvetica-Bold')
      .text(data.customer.name, 50, 112, { width: doc.page.width - 100, align: 'center' })

    // Customer info box
    let infoY = 200
    if (data.customer.contact_email) {
      doc.fillColor(DARK_TEXT).fontSize(11).font('Helvetica')
        .text(`Contact: ${data.customer.contact_email}`, 50, infoY, { align: 'center', width: doc.page.width - 100 })
      infoY += 18
    }
    if (data.customer.notes) {
      doc.fillColor(GREY).fontSize(10).font('Helvetica-Oblique')
        .text(data.customer.notes, 50, infoY, { align: 'center', width: doc.page.width - 100 })
      infoY += 18
    }

    // Divider
    doc.moveTo(50, infoY + 10).lineTo(doc.page.width - 50, infoY + 10)
      .strokeColor(MID_BLUE).lineWidth(1).stroke()

    // Summary stats boxes
    const totalDocs = data.documents.length
    const totalAssigned = data.documents.reduce((s, d) => s + Number(d.total_assigned), 0)
    const totalSigned = data.documents.reduce((s, d) => s + Number(d.total_signed), 0)
    const totalOverdue = data.documents.reduce((s, d) => s + Number(d.overdue_count), 0)
    const compliancePct = totalAssigned > 0 ? Math.round((totalSigned / totalAssigned) * 100) : 0

    const metrics = [
      { label: 'Documents', value: totalDocs, color: NAVY },
      { label: 'Assignments', value: totalAssigned, color: NAVY },
      { label: 'Signed', value: totalSigned, color: GREEN },
      { label: 'Overdue', value: totalOverdue, color: RED },
    ]

    const boxW = 90; const boxH = 60; const boxGap = 14
    const totalBoxW = metrics.length * boxW + (metrics.length - 1) * boxGap
    const startX = (doc.page.width - totalBoxW) / 2
    const boxY = infoY + 30

    metrics.forEach((m, i) => {
      const bx = startX + i * (boxW + boxGap)
      doc.rect(bx, boxY, boxW, boxH).fill(LIGHT_GREY)
      doc.fillColor(m.color).fontSize(22).font('Helvetica-Bold')
        .text(String(m.value), bx, boxY + 8, { width: boxW, align: 'center' })
      doc.fillColor(GREY).fontSize(9).font('Helvetica')
        .text(m.label, bx, boxY + 38, { width: boxW, align: 'center' })
    })

    // Progress bar
    const pctY = boxY + boxH + 20
    doc.fillColor(DARK_TEXT).fontSize(12).font('Helvetica-Bold')
      .text('Compliance Rate', 50, pctY, { align: 'center', width: doc.page.width - 100 })
    const barX = 150; const barY = pctY + 22; const barW = doc.page.width - 300
    doc.rect(barX, barY, barW, 18).fill('#e0e0e0')
    const fillColor = compliancePct >= 90 ? GREEN : compliancePct >= 70 ? ORANGE : RED
    doc.rect(barX, barY, barW * (compliancePct / 100), 18).fill(fillColor)
    doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
      .text(`${compliancePct}%`, barX, barY + 3, { width: barW, align: 'center' })

    doc.fillColor(GREY).fontSize(9).font('Helvetica')
      .text(`Generated: ${fmtDateTime(data.generatedAt)}   |   By: ${data.generatedBy}`,
        50, doc.page.height - 55, { align: 'center', width: doc.page.width - 100 })

    // ── DOCUMENT SUMMARY PAGE ────────────────────────────────────────────────
    if (data.documents.length > 0) {
      doc.addPage()
      sectionHeader(doc, `Documents Assigned to ${data.customer.name}`)

      const colW = [180, 75, 55, 65, 65, 65, 50]
      const cols = ['Document Title', 'Doc Number', 'Version', 'Assigned', 'Signed', 'Overdue', 'Rate']
      tableHeader(doc, cols, colW, doc.y)

      for (const d of data.documents) {
        const assigned = Number(d.total_assigned)
        const signed = Number(d.total_signed)
        const pct = assigned > 0 ? Math.round((signed / assigned) * 100) : 0
        const overdue = Number(d.overdue_count)

        tableRowWithColor(
          doc,
          [
            truncate(d.title, 30),
            d.doc_number || '—',
            String(d.latest_version ?? '—'),
            String(assigned),
            String(signed),
            String(overdue),
            `${pct}%`,
          ],
          colW,
          overdue > 0 ? '#fff5f5' : pct === 100 && assigned > 0 ? '#f0fff4' : 'white',
          [],
        )

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, `Documents Assigned to ${data.customer.name} (cont.)`)
          tableHeader(doc, cols, colW, doc.y)
        }
      }
    }

    // ── PER-USER DETAIL PAGE ─────────────────────────────────────────────────
    if (data.userRows.length > 0) {
      doc.addPage()
      sectionHeader(doc, 'User Signing Detail')

      const colW2 = [100, 80, 110, 115, 60, 65]
      const cols2 = ['Employee', 'Section', 'Document', 'Signed At / Status', 'Deadline', 'Method']
      tableHeader(doc, cols2, colW2, doc.y)

      for (const r of data.userRows) {
        const isSigned = !!r.signed_at
        const signedAtOrStatus = isSigned
          ? fmtDateTime(new Date(r.signed_at))
          : r.status === 'overdue' ? 'OVERDUE' : r.status?.toUpperCase() || 'PENDING'
        const rowBg = r.status === 'overdue' ? '#fff5f5' : isSigned ? '#f0fff4' : 'white'
        const statusColor = r.status === 'overdue' ? RED : isSigned ? GREEN : ORANGE

        tableRowWithColor(
          doc,
          [
            truncate(r.user_name, 14),
            truncate(r.section_name || '—', 12),
            truncate(r.doc_title, 20),
            signedAtOrStatus,
            r.deadline ? fmtDate(r.deadline) : '—',
            isSigned ? (r.method === 'pin' ? 'PIN' : 'PWD') : '—',
          ],
          colW2,
          rowBg,
          [null, null, null, statusColor, null, null],
        )

        if (doc.y > doc.page.height - 100) {
          doc.addPage()
          sectionHeader(doc, 'User Signing Detail (cont.)')
          tableHeader(doc, cols2, colW2, doc.y)
        }
      }
    }

    // Page numbers
    const pageCount = (doc as any).bufferedPageRange().count
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i)
      doc.fillColor(GREY).fontSize(8).font('Helvetica')
        .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30, {
          align: 'right', width: doc.page.width - 100,
        })
    }

    doc.end()
  })
}
