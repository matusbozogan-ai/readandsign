import { useState, useEffect } from 'react'
import { quizApi } from '../api'

interface QuizQuestion {
  id?: string
  questionText: string
  options: Array<{ id: string; text: string }>
  correctOptionId: string
  orderIndex?: number
}

interface QuizBuilderProps {
  documentId: string
  onClose: () => void
  onSave?: () => void
}

export function QuizBuilder({ documentId, onClose, onSave }: QuizBuilderProps) {
  const [title, setTitle] = useState('Comprehension Check')
  const [passScore, setPassScore] = useState(80)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadQuiz() {
      try {
        setLoading(true)
        const quiz = await quizApi.getForDocument(documentId)
        setTitle(quiz.title || 'Comprehension Check')
        setPassScore(quiz.passScore || 80)
        const formattedQuestions = quiz.questions.map((q: any) => ({
          id: q.id,
          questionText: q.questionText,
          options: q.options,
          correctOptionId: q.correctOptionId,
          orderIndex: q.orderIndex,
        }))
        setQuestions(formattedQuestions)
      } catch (err) {
        // No quiz exists yet - that's fine
      } finally {
        setLoading(false)
      }
    }

    loadQuiz()
  }, [documentId])

  const addQuestion = () => {
    if (questions.length >= 10) {
      setError('Maximum 10 questions allowed')
      return
    }

    const newQuestion: QuizQuestion = {
      questionText: '',
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' },
      ],
      correctOptionId: 'a',
      orderIndex: questions.length,
    }

    setQuestions([...questions, newQuestion])
  }

  const deleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions]
    ;(updated[index] as any)[field] = value
    setQuestions(updated)
  }

  const updateOption = (questionIndex: number, optionIndex: number, text: string) => {
    const updated = [...questions]
    updated[questionIndex].options[optionIndex].text = text
    setQuestions(updated)
  }

  const handleSave = async () => {
    if (questions.length === 0) {
      setError('At least one question is required')
      return
    }

    // Validate all questions
    for (const q of questions) {
      if (!q.questionText.trim()) {
        setError('All questions must have text')
        return
      }
      for (const opt of q.options) {
        if (!opt.text.trim()) {
          setError('All options must have text')
          return
        }
      }
    }

    try {
      setSaving(true)
      await quizApi.create(documentId, {
        title,
        passScore,
        questions: questions.map((q, idx) => ({
          questionText: q.questionText,
          options: q.options,
          correctOptionId: q.correctOptionId,
          orderIndex: idx,
        })),
      })

      if (onSave) {
        onSave()
      }
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save quiz')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this quiz? This cannot be undone.')) {
      return
    }

    try {
      setSaving(true)
      await quizApi.delete(documentId)
      setQuestions([])
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to delete quiz')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="modal-content">
        <p>Loading quiz...</p>
      </div>
    )
  }

  return (
    <div className="modal-content quiz-builder">
      <div className="modal-header">
        <h2>Quiz Builder</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="modal-body">
        <div className="form-group">
          <label>Quiz Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Comprehension Check" />
        </div>

        <div className="form-group">
          <label>Pass Score (%)</label>
          <input type="range" min="0" max="100" step="5" value={passScore} onChange={(e) => setPassScore(parseInt(e.target.value))} />
          <span className="pass-score-display">{passScore}%</span>
        </div>

        <div className="quiz-questions-list">
          {questions.map((question, qIdx) => (
            <div key={qIdx} className="quiz-question-card">
              <div className="question-header">
                <h4>Question {qIdx + 1}</h4>
                <button className="btn-danger-small" onClick={() => deleteQuestion(qIdx)}>
                  Delete
                </button>
              </div>

              <div className="form-group">
                <label>Question Text</label>
                <textarea
                  value={question.questionText}
                  onChange={(e) => updateQuestion(qIdx, 'questionText', e.target.value)}
                  placeholder="Enter the question"
                />
              </div>

              <div className="question-options">
                <p className="label">Options (mark the correct one)</p>
                {question.options.map((option, oIdx) => (
                  <div key={oIdx} className="option-input">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      value={option.id}
                      checked={question.correctOptionId === option.id}
                      onChange={() => updateQuestion(qIdx, 'correctOptionId', option.id)}
                    />
                    <label className="option-letter">{String.fromCharCode(65 + oIdx)}.</label>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                      placeholder="Enter option text"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {questions.length < 10 && (
          <button className="btn btn-secondary" onClick={addQuestion}>
            + Add Question
          </button>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        {questions.length > 0 && (
          <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            Delete Quiz
          </button>
        )}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || questions.length === 0}>
          {saving ? 'Saving...' : 'Save Quiz'}
        </button>
      </div>
    </div>
  )
}
