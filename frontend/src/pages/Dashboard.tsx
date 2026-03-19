import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { usersApi } from '../api'
import { Badge } from '../components/Badge'
import { DocumentPreviewModal } from '../components/DocumentPreviewModal'

interface Assignment {
  id: string
  documentId: string
  documentTitle: string
  documentNumber: string | null
  versionNumber: number
  fileType: string
  deadline: string | null
  status: string
  createdAt: string
  signedAt: string | null
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Preview modal state
  const [previewAssignment, setPreviewAssignment] = useState<Assignment | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        setLoading(true)
        const data = await usersApi.getAssignments(user.id)
        setAssignments(data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  // 'read' = scrolled through but not yet signed; 'overdue' = past deadline, still unsigned
  // Both must appear in the pending section so they're never invisible to the user.
  const pending = assignments.filter(
    (a) =>
      a.status === 'pending' ||
      a.status === 'reading' ||
      a.status === 'in_progress' ||
      a.status === 'read' ||
      a.status === 'overdue',
  )
  const completed = assignments.filter(
    (a) => a.status === 'completed' || a.status === 'signed',
  )

  const isOverdue = (a: Assignment) =>
    !!a.deadline && new Date(a.deadline) < new Date() && a.status !== 'completed' && a.status !== 'signed'

  const overdueCount = pending.filter(isOverdue).length

  const statusBadge = (a: Assignment) => {
    if (isOverdue(a)) return <Badge status="danger">Overdue</Badge>
    if (a.status === 'reading' || a.status === 'in_progress') return <Badge status="warning">In Progress</Badge>
    if (a.status === 'read') return <Badge status="primary">Read</Badge>
    return <Badge status="secondary">Pending</Badge>
  }

  if (loading) return <div className="loading">Loading your assignments...</div>

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '8px' }}>My Dashboard</h2>
      <p style={{ color: 'var(--text-light)', marginBottom: '32px' }}>
        Welcome back, {user?.name}.
        {pending.length > 0
          ? ` You have ${pending.length} pending assignment${pending.length > 1 ? 's' : ''}${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}.`
          : ' You are all caught up!'}
      </p>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* ── Pending assignments ── */}
      <h3 style={{ marginBottom: '12px', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-light)' }}>
        Pending ({pending.length})
      </h3>

      {pending.length === 0 ? (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            color: '#15803d',
            marginBottom: '32px',
          }}
        >
          ✅ No pending assignments — great work!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {pending.map((a) => (
            <div
              key={a.id}
              style={{
                background: 'white',
                border: isOverdue(a) ? '1px solid #fca5a5' : '1px solid var(--border)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.documentTitle}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {a.documentNumber && <span>#{a.documentNumber}</span>}
                  <span>Version {a.versionNumber}</span>
                  {a.deadline && (
                    <span style={{ color: isOverdue(a) ? '#dc2626' : 'inherit' }}>
                      Due {new Date(a.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {statusBadge(a)}
                <button
                  className="btn btn-secondary btn-sm"
                  title="Preview document"
                  onClick={() => setPreviewAssignment(a)}
                >
                  👁 Preview
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/document/${a.id}`)}
                >
                  Read &amp; Sign →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Completed assignments ── */}
      {completed.length > 0 && (
        <>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-light)' }}>
            Completed ({completed.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {completed.map((a) => (
              <div
                key={a.id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  opacity: 0.8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.documentTitle}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {a.documentNumber && <span>#{a.documentNumber}</span>}
                    <span>Version {a.versionNumber}</span>
                    {a.signedAt && (
                      <span style={{ color: 'var(--success)', fontWeight: '500' }}>
                        ✓ Signed {new Date(a.signedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' '}at {new Date(a.signedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    title="Preview document"
                    onClick={() => setPreviewAssignment(a)}
                  >
                    👁 Preview
                  </button>
                  <Badge status="success">Signed</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Document Preview Modal ── */}
      {previewAssignment && (
        <DocumentPreviewModal
          isOpen={!!previewAssignment}
          onClose={() => setPreviewAssignment(null)}
          documentId={previewAssignment.documentId}
          documentTitle={previewAssignment.documentTitle}
          versionNumber={previewAssignment.versionNumber}
          fileType={previewAssignment.fileType}
        />
      )}
    </div>
  )
}
