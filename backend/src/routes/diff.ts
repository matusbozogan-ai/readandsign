import { FastifyInstance } from 'fastify'
import * as fs from 'fs'
import * as path from 'path'
import * as Diff from 'diff'
import { authenticate } from '../middleware'
import { queryOne, queryMany } from '../db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads'

interface DiffHunk {
  type: 'added' | 'removed' | 'unchanged'
  value: string
}

interface DiffResult {
  v1: { id: string; versionNumber: number; revision: string; effectiveDate: string; publishedAt: string }
  v2: { id: string; versionNumber: number; revision: string; effectiveDate: string; publishedAt: string }
  documentTitle: string
  documentNumber: string
  hunks: DiffHunk[]
  stats: {
    added: number
    removed: number
    unchanged: number
    changePercent: number
  }
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  // Normalize whitespace and split into paragraphs
  return data.text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export default async function diffRoutes(app: FastifyInstance) {
  // GET /api/diff/:documentId?v1=<versionId>&v2=<versionId>
  // Returns a word-level diff between two versions of a document
  app.get<{
    Params: { documentId: string }
    Querystring: { v1: string; v2: string }
  }>(
    '/:documentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      // Only admins can view diffs
      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Admin access required' })
      }

      const { documentId } = req.params
      const { v1: v1Id, v2: v2Id } = req.query

      if (!v1Id || !v2Id) {
        return reply.status(400).send({ error: 'v1 and v2 version IDs are required' })
      }

      if (v1Id === v2Id) {
        return reply.status(400).send({ error: 'v1 and v2 must be different versions' })
      }

      try {
        // Load document info
        const doc = await queryOne<any>(
          `SELECT id, title, doc_number FROM documents WHERE id = $1`,
          [documentId],
        )

        if (!doc) {
          return reply.status(404).send({ error: 'Document not found' })
        }

        // Load both versions
        const versions = await queryMany<any>(
          `SELECT id, version_number, revision, effective_date, published_at, file_path
           FROM document_versions
           WHERE id IN ($1, $2) AND document_id = $3`,
          [v1Id, v2Id, documentId],
        )

        if (versions.length !== 2) {
          return reply.status(404).send({ error: 'One or both versions not found for this document' })
        }

        const ver1 = versions.find((v: any) => v.id === v1Id)!
        const ver2 = versions.find((v: any) => v.id === v2Id)!

        // Ensure both versions have files
        if (!ver1.file_path) {
          return reply.status(400).send({ error: `Version ${ver1.version_number} has no uploaded file` })
        }
        if (!ver2.file_path) {
          return reply.status(400).send({ error: `Version ${ver2.version_number} has no uploaded file` })
        }

        const file1 = path.join(UPLOAD_DIR, ver1.file_path)
        const file2 = path.join(UPLOAD_DIR, ver2.file_path)

        if (!fs.existsSync(file1)) {
          return reply.status(400).send({ error: `File for version ${ver1.version_number} not found on disk` })
        }
        if (!fs.existsSync(file2)) {
          return reply.status(400).send({ error: `File for version ${ver2.version_number} not found on disk` })
        }

        // Extract text from both PDFs
        const [text1, text2] = await Promise.all([
          extractPdfText(file1),
          extractPdfText(file2),
        ])

        // Compute word-level diff
        const rawDiff = Diff.diffWordsWithSpace(text1, text2)

        // Build hunks - collapse long unchanged sections for readability
        const CONTEXT_WORDS = 30
        const hunks: DiffHunk[] = []

        for (const part of rawDiff) {
          if (part.added) {
            hunks.push({ type: 'added', value: part.value })
          } else if (part.removed) {
            hunks.push({ type: 'removed', value: part.value })
          } else {
            // For long unchanged sections, keep only context around changes
            const words = part.value.split(/\s+/).filter(Boolean)
            if (words.length <= CONTEXT_WORDS * 2) {
              hunks.push({ type: 'unchanged', value: part.value })
            } else {
              // Keep first CONTEXT_WORDS and last CONTEXT_WORDS words
              const firstWords = words.slice(0, CONTEXT_WORDS).join(' ')
              const lastWords = words.slice(-CONTEXT_WORDS).join(' ')
              const skipped = words.length - CONTEXT_WORDS * 2
              hunks.push({ type: 'unchanged', value: firstWords + ' ' })
              hunks.push({ type: 'unchanged', value: `\n[... ${skipped} unchanged words ...]\n` })
              hunks.push({ type: 'unchanged', value: ' ' + lastWords })
            }
          }
        }

        // Compute stats
        let addedWords = 0
        let removedWords = 0
        let unchangedWords = 0

        for (const part of rawDiff) {
          const wordCount = part.value.split(/\s+/).filter(Boolean).length
          if (part.added) addedWords += wordCount
          else if (part.removed) removedWords += wordCount
          else unchangedWords += wordCount
        }

        const totalWords = addedWords + removedWords + unchangedWords
        const changePercent = totalWords > 0
          ? Math.round(((addedWords + removedWords) / totalWords) * 100)
          : 0

        const result: DiffResult = {
          v1: {
            id: ver1.id,
            versionNumber: ver1.version_number,
            revision: ver1.revision || '1',
            effectiveDate: ver1.effective_date || '',
            publishedAt: ver1.published_at || '',
          },
          v2: {
            id: ver2.id,
            versionNumber: ver2.version_number,
            revision: ver2.revision || '1',
            effectiveDate: ver2.effective_date || '',
            publishedAt: ver2.published_at || '',
          },
          documentTitle: doc.title,
          documentNumber: doc.doc_number || '',
          hunks,
          stats: {
            added: addedWords,
            removed: removedWords,
            unchanged: unchangedWords,
            changePercent,
          },
        }

        return reply.status(200).send(result)
      } catch (err: any) {
        console.error('Diff error:', err)
        return reply.status(500).send({ error: `Failed to compute diff: ${err.message}` })
      }
    },
  )
}
