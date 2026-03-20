import { useState, useEffect } from 'react'
import { quizApi } from '../api'

interface Question {
  id: string
  questionText: string
  options: Array<{ id: string; text: string }>
  orderIndex?: number
}

interface QuizProps {
  documentId: string
  assignmentId: string
  onPassed: () => void
  onSkip?: () => void
}

export function Quiz({ documentId, assignmentId, onPassed, onSkip }: QuizProps) {
  const [quiz, setQuiz] = useState<any>(null)
  const [attempt, setAttempt] = useState<any>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadQuiz() {
      try {
        setLoading(true)
        const quizData = await quizApi.getForDocument(documentId)
        setQuiz(quizData)

        // Check if already attempted
        try {
          const attemptData = await quizApi.getAttempt(assignmentId)
          setAttempt(attemptData)
        } catch {
          // No attempt yet
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load quiz')
      } finally {
        setLoading(false)
      }
    }

    loadQuiz()
  }, [documentId, assignmentId])

  const handleAnswerChange = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }))
  }

  const handleSubmit = async () => {
    if (!quiz) return

    // Check if all questions are answered
    if (Object.keys(answers).length !== quiz.questions.length) {
      setError('Please answer all questions before submitting')
      return
    }

    try {
      setSubmitting(true)
      const result = await quizApi.submitAttempt(assignmentId, answers)
      setAttempt(result)

      if (result.passed) {
        onPassed()
      } else {
        setError(
          `You scored ${result.score}%. Required: ${result.passScore}%. Please re-read the document and try again.`,
        )
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit quiz')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading quiz...</div>
  }

  if (!quiz) {
    return <div className="error">Quiz not found</div>
  }

  if (attempt && attempt.passed) {
    return (
      <div className="quiz-passed">
        <div className="quiz-result-box success">
          <p className="quiz-result-title">✓ Quiz Passed</p>
          <p className="quiz-result-score">You scored {attempt.score}%</p>
          <p className="quiz-result-message">You may now sign this document.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h3>{quiz.title || 'Comprehension Check'}</h3>
        <p className="quiz-meta">
          {quiz.questions.length} questions | Pass score: {quiz.passScore}%
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="quiz-questions">
        {quiz.questions.map((question: Question, idx: number) => (
          <div key={question.id} className="quiz-question">
            <p className="question-number">Question {idx + 1}</p>
            <p className="question-text">{question.questionText}</p>
            <div className="question-options">
              {question.options.map((option: any) => (
                <label key={option.id} className="option-label">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={answers[question.id] === option.id}
                    onChange={() => handleAnswerChange(question.id, option.id)}
                    disabled={submitting || (attempt && attempt.passed)}
                  />
                  <span className="option-text">{option.text}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="quiz-actions">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting || (attempt && attempt.passed) || Object.keys(answers).length !== quiz.questions.length}
        >
          {submitting ? 'Submitting...' : 'Submit Quiz'}
        </button>
        {onSkip && (
          <button className="btn btn-secondary" onClick={onSkip} disabled={submitting || (attempt && attempt.passed)}>
            Skip for Now
          </button>
        )}
      </div>

      {attempt && !attempt.passed && (
        <div className="quiz-previous-attempt">
          <p>Your previous attempt: {attempt.score}%</p>
        </div>
      )}
    </div>
  )
}
