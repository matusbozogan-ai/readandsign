import { useState, useEffect } from 'react'
import { diffApi } from '../api'
import { Modal } from './Modal'

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
  stats: { added: number; removed: number; unchanged: number; changePercent: number }
}

interface Version {
  id: string
  versionNumber: number
  revision?: string
  status: string
  effectiveDate?: string
  publishedAt?: string
}

interface VersionDiffProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentTitle: string
  versions: Version[]
}

export function VersionDiff({ isOpen, onClose, documentId, documentTitle, versions }: VersionDiffProps) {
  const publishedVersions = versions.filter((v) => v.status === 'published')

  const [v1Id, setV1Id] = useState('')
  const [v2Id, setV2Id] = useState('')
  const [result, setResult] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-select the two latest published versions by default
  useEffect(() => {
    if (publishedVersions.length >= 2) {
      const sorted = [...publishedVersions].sort((a, b) => b.versionNumber - a.versionNumber)
      setV2Id(sorted[0].id)
      setV1Id(sorted[1].id)
    } else if (publishedVersions.length === 1) {
      setV2Id(publishedVersions[0].id)
      setV1Id('')
    }
    setResult(null)
    setError(null)
  }, [isOpen, versions])

  const handleCompare = async () => {
    if (!v1Id || !v2Id) {
      setError('Please select both versions to compare')
      return
    }
    if (v1Id === v2Id) {
      setError('Please select two different versions')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await diffApi.getVersionDiff(documentId, v1Id, v2Id)
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to compute diff')
    } finally {
      setLoading(false)
    }
  }

  const ver1 = versions.find((v) => v.id === v1Id)
  const ver2 = versions.find((v) => v.id === v2Id)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Version Diff — ${documentTitle}`}
      wide
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Version selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '12px', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Base version (older)</label>
            <select value={v1Id} onChange={(e) => setV1Id(e.target.value)}>
              <option value="">Select version…</option>
              {publishedVersions
                .slice()
                .sort((a, b) => a.versionNumber - b.versionNumber)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}{v.revision ? ` rev.${v.revision}` : ''}{' '}
                    {v.effectiveDate ? `(${v.effectiveDate})` : ''}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ fontSize: '20px', color: 'var(--text-light)', paddingBottom: '6px' }}>→</div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Compare version (newer)</label>
            <select value={v2Id} onChange={(e) => setV2Id(e.target.value)}>
              <option value="">Select version…</option>
              {publishedVersions
                .slice()
                .sort((a, b) => a.versionNumber - b.versionNumber)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}{v.revision ? ` rev.${v.revision}` : ''}{' '}
                    {v.effectiveDate ? `(${v.effectiveDate})` : ''}
                  </option>
                ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleCompare}
            disabled={loading || !v1Id || !v2Id}
            style={{ paddingBottom: '6px' }}
          >
            {loading ? 'Comparing…' : 'Compare'}
          </button>
        </div>

        {publishedVersions.length < 2 && (
          <div className="error">
            At least two published versions are needed to compare.
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {/* Stats bar */}
        {result && (
          <>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                padding: '10px 14px',
                background: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '13px',
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong>v{ver1?.versionNumber}</strong> vs <strong>v{ver2?.versionNumber}</strong>
              </span>
              <span style={{ color: '#27ae60' }}>
                +{result.stats.added} words added
              </span>
              <span style={{ color: '#e74c3c' }}>
                −{result.stats.removed} words removed
              </span>
              <span style={{ color: 'var(--text-light)' }}>
                {result.stats.unchanged} unchanged
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontWeight: 600,
                  color: result.stats.changePercent > 20 ? '#e74c3c' : result.stats.changePercent > 5 ? '#e67e22' : '#27ae60',
                }}
              >
                {result.stats.changePercent}% changed
              </span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
              <span
                style={{
                  background: '#d4edda',
                  color: '#155724',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: '1px solid #c3e6cb',
                }}
              >
                ▲ Added text
              </span>
              <span
                style={{
                  background: '#f8d7da',
                  color: '#721c24',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: '1px solid #f5c6cb',
                }}
              >
                ▼ Removed text
              </span>
              <span
                style={{
                  background: '#f5f5f5',
                  color: '#666',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: '1px solid #ddd',
                }}
              >
                Unchanged
              </span>
            </div>

            {/* Diff viewer */}
            <div
              style={{
                border: '1px solid #ddd',
                borderRadius: '6px',
                padding: '16px',
                maxHeight: '420px',
                overflowY: 'auto',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '13px',
                lineHeight: '1.7',
                background: 'white',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {result.hunks.map((hunk, i) => {
                if (hunk.type === 'added') {
                  return (
                    <span
                      key={i}
                      style={{
                        background: '#d4edda',
                        color: '#155724',
                        borderRadius: '2px',
                        padding: '0 1px',
                      }}
                      title="Added in new version"
                    >
                      {hunk.value}
                    </span>
                  )
                } else if (hunk.type === 'removed') {
                  return (
                    <span
                      key={i}
                      style={{
                        background: '#f8d7da',
                        color: '#721c24',
                        textDecoration: 'line-through',
                        borderRadius: '2px',
                        padding: '0 1px',
                      }}
                      title="Removed in new version"
                    >
                      {hunk.value}
                    </span>
                  )
                } else {
                  // Unchanged — check if it's an ellipsis placeholder
                  if (hunk.value.startsWith('\n[...')) {
                    return (
                      <span
                        key={i}
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          color: '#999',
                          fontSize: '11px',
                          padding: '6px 0',
                          fontFamily: 'monospace',
                          fontStyle: 'italic',
                        }}
                      >
                        {hunk.value.trim()}
                      </span>
                    )
                  }
                  return (
                    <span key={i} style={{ color: '#333' }}>
                      {hunk.value}
                    </span>
                  )
                }
              })}
            </div>
          </>
        )}

        {!result && !loading && !error && publishedVersions.length >= 2 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: 'var(--text-light)',
              fontSize: '14px',
              background: '#f8f9fa',
              borderRadius: '6px',
              border: '1px dashed #ddd',
            }}
          >
            Select two versions above and click <strong>Compare</strong> to see what changed between them.
          </div>
        )}
      </div>
    </Modal>
  )
}
