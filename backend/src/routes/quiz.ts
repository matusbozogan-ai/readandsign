import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'

interface QuizQuestion {
  id?: string
  questionText: string
  options: Array<{ id: string; text: string }>
  correctOptionId: string
  orderIndex?: number
}

interface CreateQuizRequest {
  title?: string
  passScore?: number
  questions: QuizQuestion[]
}

interface SubmitQuizAttemptRequest {
  assignmentId: string
  answers: Record<string, string>
}

export default async function quizRoutes(app: FastifyInstance) {
  // GET /api/quiz/document/:documentId - Get quiz for a document
  app.get<{ Params: { documentId: string } }>(
    '/document/:documentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { documentId } = req.params

      try {
        const quiz = await queryOne<any>(
          `SELECT id, title, pass_score FROM document_quizzes WHERE document_id = $1 AND active = true`,
          [documentId],
        )

        if (!quiz) {
          return reply.status(404).send({ error: 'Quiz not found' })
        }

        const questions = await queryMany<any>(
          `SELECT id, question_text, options, correct_option_id, order_index
           FROM quiz_questions
           WHERE quiz_id = $1
           ORDER BY order_index ASC`,
          [quiz.id],
        )

        // For non-admin users, don't include correct_option_id
        let formattedQuestions = questions.map((q) => ({
          id: q.id,
          questionText: q.question_text,
          options: q.options,
          orderIndex: q.order_index,
          ...(req.user?.role !== 'user' && { correctOptionId: q.correct_option_id }),
        }))

        // Admin users see correct answers
        if (req.user?.role !== 'user') {
          formattedQuestions = questions.map((q) => ({
            id: q.id,
            questionText: q.question_text,
            options: q.options,
            orderIndex: q.order_index,
            correctOptionId: q.correct_option_id,
          }))
        }

        return reply.status(200).send({
          id: quiz.id,
          title: quiz.title,
          passScore: quiz.pass_score,
          questions: formattedQuestions,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/quiz/document/:documentId - Create/update quiz (admin only)
  app.post<{ Params: { documentId: string }; Body: CreateQuizRequest }>(
    '/document/:documentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { documentId } = req.params
      const { title = 'Comprehension Check', passScore = 80, questions = [] } = req.body

      if (questions.length === 0) {
        return reply.status(400).send({ error: 'At least one question is required' })
      }

      if (questions.length > 10) {
        return reply.status(400).send({ error: 'Maximum 10 questions allowed' })
      }

      try {
        // Verify document exists
        const document = await queryOne<any>(`SELECT id FROM documents WHERE id = $1`, [documentId])
        if (!document) {
          return reply.status(404).send({ error: 'Document not found' })
        }

        // Delete existing quiz if present
        const existingQuiz = await queryOne<any>(
          `SELECT id FROM document_quizzes WHERE document_id = $1`,
          [documentId],
        )

        if (existingQuiz) {
          await query(`DELETE FROM document_quizzes WHERE id = $1`, [existingQuiz.id])
        }

        // Create new quiz
        const quizId = uuidv4()
        await query(
          `INSERT INTO document_quizzes (id, document_id, title, pass_score, active)
           VALUES ($1, $2, $3, $4, true)`,
          [quizId, documentId, title, passScore],
        )

        // Create questions
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i]
          const questionId = uuidv4()
          await query(
            `INSERT INTO quiz_questions (id, quiz_id, question_text, options, correct_option_id, order_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [questionId, quizId, q.questionText, JSON.stringify(q.options), q.correctOptionId, i],
          )
        }

        // Log to audit log
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'CREATE_QUIZ', 'quiz', quizId, req.ip],
        )

        return reply.status(201).send({ id: quizId, message: 'Quiz created successfully' })
      } catch (err) {
        throw err
      }
    },
  )

  // DELETE /api/quiz/document/:documentId - Delete quiz (admin only)
  app.delete<{ Params: { documentId: string } }>(
    '/document/:documentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      if (req.user.role === 'user') {
        return reply.status(403).send({ error: 'Not authorized' })
      }

      const { documentId } = req.params

      try {
        const quiz = await queryOne<any>(
          `SELECT id FROM document_quizzes WHERE document_id = $1`,
          [documentId],
        )

        if (!quiz) {
          return reply.status(404).send({ error: 'Quiz not found' })
        }

        await query(`DELETE FROM document_quizzes WHERE id = $1`, [quiz.id])

        // Log to audit log
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.userId, 'DELETE_QUIZ', 'quiz', quiz.id, req.ip],
        )

        return reply.status(200).send({ message: 'Quiz deleted' })
      } catch (err) {
        throw err
      }
    },
  )

  // POST /api/quiz/attempt - Submit quiz attempt
  app.post<{ Body: SubmitQuizAttemptRequest }>(
    '/attempt',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId, answers } = req.body

      if (!assignmentId || !answers) {
        return reply.status(400).send({ error: 'assignmentId and answers are required' })
      }

      try {
        // Get assignment and document quiz
        const assignment = await queryOne<any>(
          `SELECT a.id, a.user_id, a.document_version_id FROM assignments a WHERE a.id = $1`,
          [assignmentId],
        )

        if (!assignment) {
          return reply.status(404).send({ error: 'Assignment not found' })
        }

        if (assignment.user_id !== req.user.userId && req.user.role === 'user') {
          return reply.status(403).send({ error: 'Not authorized' })
        }

        // Get document version to find quiz
        const docVersion = await queryOne<any>(
          `SELECT d.id FROM document_versions dv
           JOIN documents d ON dv.document_id = d.id
           WHERE dv.id = $1`,
          [assignment.document_version_id],
        )

        if (!docVersion) {
          return reply.status(404).send({ error: 'Document not found' })
        }

        const quiz = await queryOne<any>(
          `SELECT id, pass_score FROM document_quizzes WHERE document_id = $1 AND active = true`,
          [docVersion.id],
        )

        if (!quiz) {
          return reply.status(404).send({ error: 'Quiz not found' })
        }

        // Get all questions
        const questions = await queryMany<any>(
          `SELECT id, correct_option_id FROM quiz_questions WHERE quiz_id = $1`,
          [quiz.id],
        )

        // Calculate score
        let correctCount = 0
        const correctAnswers: Record<string, string> = {}

        for (const q of questions) {
          correctAnswers[q.id] = q.correct_option_id
          if (answers[q.id] === q.correct_option_id) {
            correctCount++
          }
        }

        const score = Math.round((correctCount / questions.length) * 100)
        const passed = score >= quiz.pass_score

        // Create or update quiz attempt
        const existingAttempt = await queryOne<any>(
          `SELECT id FROM quiz_attempts WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (existingAttempt) {
          await query(
            `UPDATE quiz_attempts SET answers = $1, score = $2, passed = $3, attempted_at = NOW()
             WHERE assignment_id = $4`,
            [JSON.stringify(answers), score, passed, assignmentId],
          )
        } else {
          const attemptId = uuidv4()
          await query(
            `INSERT INTO quiz_attempts (id, assignment_id, user_id, answers, score, passed)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [attemptId, assignmentId, req.user.userId, JSON.stringify(answers), score, passed],
          )
        }

        // Log to audit log
        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.userId,
            'SUBMIT_QUIZ_ATTEMPT',
            'quiz_attempt',
            assignmentId,
            JSON.stringify({ score, passed }),
            req.ip,
          ],
        )

        return reply.status(200).send({
          score,
          passed,
          passScore: quiz.pass_score,
          correctAnswers,
        })
      } catch (err) {
        throw err
      }
    },
  )

  // GET /api/quiz/attempt/:assignmentId - Get existing attempt
  app.get<{ Params: { assignmentId: string } }>(
    '/attempt/:assignmentId',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: 'Not authenticated' })
      }

      const { assignmentId } = req.params

      try {
        const attempt = await queryOne<any>(
          `SELECT id, score, passed, attempted_at FROM quiz_attempts WHERE assignment_id = $1`,
          [assignmentId],
        )

        if (!attempt) {
          return reply.status(404).send({ error: 'No attempt found' })
        }

        return reply.status(200).send({
          id: attempt.id,
          score: attempt.score,
          passed: attempt.passed,
          attemptedAt: attempt.attempted_at,
        })
      } catch (err) {
        throw err
      }
    },
  )
}
