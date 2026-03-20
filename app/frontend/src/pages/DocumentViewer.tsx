import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import { assignmentsApi, readingApi, signingApi, documentsApi, profileApi } from '../api'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  read: 'Read',
  signed: 'Signed',
  overdue: 'Overdue',
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

export function DocumentViewer() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const navigate = useNavigate()

  const [assignment, setAssignment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [totalPages, setTotalPages] = useState(0)
  const [scrollDepth, setScrollDepth] = useState(0)
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0)
  const [pagesVisited, setPagesVisited] = useState<number[]>([])
  const [readingStarted, setReadingStarted] = useState(false)
  const [fileDownloaded, setFileDownloaded] = useState(false)

  const [showSignModal, setShowSignModal] = useState(false)
  const [signPassword, setSignPassword] = useState('')
  const [signPin, setSignPin] = useState('')
  const [signingMethod, setSigningMethod] = useState<'password' | 'pin'>('password')
  const [hasPin, setHasPin] = useState(false)
  const [signLoading, setSignLoading] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [signSuccess, setSignSuccess] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [certDownloading, setCertDownloading] = useState(false)

  // Authenticated download/open helper — plain <a href> can't send JWT headers,
  // so we fetch the file programmatically and create a temporary blob URL.
  const handleAuthDownload = async (download = true) => {
    if (!assignment) return
    setDownloadError(null)
    try {
      const response = await documentsApi.getFile(assignment.documentId)
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText)
        let msg = response.statusText
        try { msg = JSON.parse(errText).error || msg } catch { /* not JSON */ }
        throw new Error(`Could not download file (${response.status}): ${msg}`)
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const ext = assignment.fileType || 'pdf'
      const a = document.createElement('a')
      a.href = blobUrl
      if (download) {
        a.download = `${assignment.documentTitle || 'document'}.${ext}`
      } else {
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      }
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Revoke after short delay to let browser pick up the URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
      setFileDownloaded(true)
    } catch (err: any) {
      setDownloadError(err.message || 'Download failed')
    }
  }

  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const pageCanvasesRef = useRef<HTMLCanvasElement[]>([])
  const pageObserversRef = useRef<IntersectionObserver[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load assignment details and user profile
  useEffect(() => {
    const loadAssignment = async () => {
      if (!assignmentId) return

      try {
        setLoading(true)
        const [data, profile] = await Promise.all([
          assignmentsApi.get(assignmentId),
          profileApi.get(),
        ])
        setAssignment(data)
        setHasPin(!!profile?.hasPin)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadAssignment()
  }, [assignmentId])

  const isPdf = !assignment?.fileType || assignment?.fileType === 'pdf'

  // Derive signing condition from the assignment's document settings
  const signingCondition: 'none' | 'time' | 'download' | 'time_and_download' =
    assignment?.signingCondition || 'time'
  const requiredSeconds: number = assignment?.signingConditionSeconds ?? 10

  // canSign conditions
  const timeMet = signingCondition === 'none' || signingCondition === 'download'
    ? true
    : timeSpentSeconds >= requiredSeconds
  const downloadMet = signingCondition === 'none' || signingCondition === 'time'
    ? true
    : fileDownloaded
  const canSign = timeMet && downloadMet && assignment?.status !== 'signed'

  // Load and render PDF (only for PDF file types)
  useEffect(() => {
    if (!assignment || !pdfContainerRef.current || !isPdf) return

    const loadPdf = async () => {
      try {
        const response = await documentsApi.getFile(assignment.documentId)

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText)
          let errMsg = response.statusText
          try { errMsg = JSON.parse(errText).error || errMsg } catch { /* not JSON */ }
          throw new Error(`Could not fetch document (${response.status}): ${errMsg}`)
        }

        const arrayBuffer = await response.arrayBuffer()

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        setTotalPages(pdf.numPages)

        // Clear previous canvases
        pdfContainerRef.current!.innerHTML = ''
        pageCanvasesRef.current = []

        // Render each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)

          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')!

          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'pdf-canvas'

          // Render page
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise

          pdfContainerRef.current!.appendChild(canvas)
          pageCanvasesRef.current.push(canvas)

          // Setup intersection observer for scroll tracking
          const observer = new IntersectionObserver(
            ([entry]) => {
              if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                setPagesVisited((prev) => {
                  if (!prev.includes(pageNum)) {
                    return [...prev, pageNum]
                  }
                  return prev
                })
              }
            },
            { threshold: 0.8 },
          )

          observer.observe(canvas)
          pageObserversRef.current.push(observer)
        }
      } catch (err: any) {
        setError(`Failed to load PDF: ${err.message}`)
      }
    }

    loadPdf()

    return () => {
      // Cleanup observers
      pageObserversRef.current.forEach((obs) => obs.disconnect())
      pageObserversRef.current = []
    }
  }, [assignment, isPdf])

  // For non-PDF: set scrollDepth to 100 once downloaded to allow signing
  useEffect(() => {
    if (!isPdf && fileDownloaded) {
      setScrollDepth(100)
      setTotalPages(1)
      setPagesVisited([1])
    }
  }, [isPdf, fileDownloaded])

  // Track scroll depth
  useEffect(() => {
    const handleScroll = () => {
      if (!pdfContainerRef.current) return

      const { scrollHeight, scrollTop, clientHeight } = pdfContainerRef.current
      const scrollableHeight = scrollHeight - clientHeight
      const depth = scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 0

      setScrollDepth(Math.min(100, depth))
    }

    const container = pdfContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Start reading session and track time
  useEffect(() => {
    if (!readingStarted && assignment) {
      const startReading = async () => {
        try {
          await readingApi.start(assignmentId!)
          setReadingStarted(true)
        } catch (err) {
          console.error('Failed to start reading:', err)
        }
      }

      startReading()
    }
  }, [assignment, assignmentId, readingStarted])

  // Timer for time spent
  useEffect(() => {
    if (!readingStarted || !document.hasFocus()) return

    timerRef.current = setInterval(() => {
      setTimeSpentSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [readingStarted])

  // Update reading progress
  useEffect(() => {
    if (!readingStarted || timeSpentSeconds % 15 !== 0) return

    const updateProgress = async () => {
      try {
        await readingApi.updateProgress(assignmentId!, scrollDepth, timeSpentSeconds, pagesVisited)
      } catch (err) {
        console.error('Failed to update progress:', err)
      }
    }

    updateProgress()
  }, [assignmentId, readingStarted, scrollDepth, timeSpentSeconds, pagesVisited])

  // Auto-complete reading when sufficient progress
  useEffect(() => {
    if (!readingStarted || assignment?.status === 'signed' || assignment?.status === 'read') return

    if (scrollDepth >= 95) {
      const completeReading = async () => {
        try {
          await readingApi.complete(assignmentId!, scrollDepth, timeSpentSeconds)
        } catch (err) {
          console.error('Failed to complete reading:', err)
        }
      }

      completeReading()
    }
  }, [assignmentId, readingStarted, scrollDepth, timeSpentSeconds, assignment?.status])

  const handleSign = async () => {
    const credential = signingMethod === 'pin' ? signPin : signPassword

    if (!credential) {
      setSignError(`${signingMethod === 'pin' ? 'PIN' : 'Password'} is required`)
      return
    }

    setSignLoading(true)
    setSignError(null)

    try {
      await signingApi.sign(assignmentId!, credential, signingMethod)
      setSignSuccess(true)
      setSignPassword('')
      setSignPin('')

      // Reload assignment
      const updatedAssignment = await assignmentsApi.get(assignmentId!)
      setAssignment(updatedAssignment)

      setTimeout(() => {
        setShowSignModal(false)
        setSignSuccess(false)
      }, 2000)
    } catch (err: any) {
      setSignError(err.message || 'Failed to sign document')
    } finally {
      setSignLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading document...</div>
  if (error) return <div className="error">{error}</div>
  if (!assignment) return <div className="error">Assignment not found</div>

  const fileTypeLabel: Record<string, string> = {
    pdf: 'PDF', pptx: 'PowerPoint', docx: 'Word', xlsx: 'Excel',
  }
  const fileTypeIcon: Record<string, string> = {
    pdf: '📄', pptx: '📊', docx: '📝', xlsx: '📈',
  }
  const docFileType = assignment.fileType || 'pdf'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ marginBottom: '4px' }}>{assignment.documentTitle}</h2>
            <p style={{ color: 'var(--text-light)', fontSize: '14px', margin: 0 }}>
              Version {assignment.versionNumber} • {assignment.documentNumber}{' '}
              <span style={{ marginLeft: '6px' }}>
                {fileTypeIcon[docFileType] || '📄'} {fileTypeLabel[docFileType] || docFileType.toUpperCase()}
              </span>
            </p>
          </div>
          <Badge
            status={
              assignment.status === 'signed' ? 'success'
              : assignment.status === 'read' ? 'primary'
              : assignment.status === 'in_progress' ? 'warning'
              : 'secondary'
            }
          >
            {STATUS_LABELS[assignment.status] ?? assignment.status}
          </Badge>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '4px' }}>
              {`Time: ${Math.floor(timeSpentSeconds / 60)}:${(timeSpentSeconds % 60).toString().padStart(2, '0')}`}
            </div>
            {isPdf && (
              <div className="pdf-progress">
                <div className="pdf-progress-bar" style={{ width: `${scrollDepth}%` }}></div>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-light)' }}>
            {isPdf && <>Time: {Math.floor(timeSpentSeconds / 60)}:{(timeSpentSeconds % 60).toString().padStart(2, '0')}</>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
          {isPdf && (
            <span>
              <strong>Pages Visited:</strong> {pagesVisited.length}/{totalPages}
            </span>
          )}
          <span>
            <strong>Status:</strong>{' '}
            {canSign ? (
              <span style={{ color: 'var(--success)' }}>✓ Ready to sign</span>
            ) : (
              <span style={{ color: 'var(--warning)' }}>
                {(() => {
                  const parts: string[] = []
                  if (!timeMet) parts.push(`${Math.max(0, requiredSeconds - timeSpentSeconds)}s remaining`)
                  if (!downloadMet) parts.push('download required')
                  return parts.join(' · ') || 'Not ready'
                })()}
              </span>
            )}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, marginBottom: '16px' }}>
        {isPdf ? (
          <>
            <div className="pdf-container" ref={pdfContainerRef}></div>
            {/* Show download button for PDF when condition requires download */}
            {(signingCondition === 'download' || signingCondition === 'time_and_download') && (
              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                {downloadError && (
                  <div className="error" style={{ marginBottom: '8px', fontSize: '13px' }}>{downloadError}</div>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => handleAuthDownload(true)}
                >
                  📥 Download PDF
                </button>
                {fileDownloaded && (
                  <span style={{ marginLeft: '12px', color: 'var(--success)', fontSize: '14px' }}>
                    ✓ Downloaded
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px' }}>{fileTypeIcon[docFileType] || '📄'}</div>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>{fileTypeLabel[docFileType] || docFileType.toUpperCase()} Document</h3>
              <p style={{ color: 'var(--text-light)', margin: '0 0 20px' }}>
                This document must be opened and reviewed before signing.
              </p>
              {downloadError && (
                <div className="error" style={{ marginBottom: '12px', fontSize: '13px' }}>{downloadError}</div>
              )}
              <button
                className="btn btn-primary"
                onClick={() => handleAuthDownload(false)}
              >
                Open {fileTypeLabel[docFileType] || 'Document'} ↗
              </button>
              {fileDownloaded && (
                <div style={{ marginTop: '16px', color: 'var(--success)', fontSize: '14px' }}>
                  ✓ Document opened — please review it and then sign below
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
        {assignment.status !== 'signed' && (
          <button
            className="btn btn-primary"
            onClick={() => setShowSignModal(true)}
            disabled={!canSign}
            title={!canSign ? (() => {
              const parts: string[] = []
              if (!timeMet) parts.push(`${Math.max(0, requiredSeconds - timeSpentSeconds)}s remaining`)
              if (!downloadMet) parts.push('download the file first')
              return parts.join(', ')
            })() : ''}
          >
            Sign Document
          </button>
        )}
        {assignment.status === 'signed' && (
          <>
            <div className="success" style={{ flex: 1, margin: 0, padding: '10px 12px' }}>
              ✓ Document signed successfully
            </div>
            <button
              className="btn btn-secondary"
              disabled={certDownloading}
              onClick={async () => {
                setCertDownloading(true)
                try {
                  const blob = await signingApi.downloadCertificate(assignmentId!)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `certificate-${assignmentId!.substring(0, 8)}.pdf`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                } catch {
                  // silent — user can retry
                } finally {
                  setCertDownloading(false)
                }
              }}
            >
              {certDownloading ? 'Generating…' : '⬇ Certificate'}
            </button>
          </>
        )}
      </div>

      <Modal
        isOpen={showSignModal}
        onClose={() => {
          setShowSignModal(false)
          setSignPassword('')
          setSignPin('')
          setSignError(null)
        }}
        title="Sign Document"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowSignModal(false)
                setSignPassword('')
                setSignPin('')
              }}
              disabled={signLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSign} disabled={signLoading}>
              {signLoading ? 'Signing...' : 'Confirm Signature'}
            </button>
          </div>
        }
      >
        {signSuccess ? (
          <div className="success">✓ Document signed successfully!</div>
        ) : (
          <>
            {signError && <div className="error">{signError}</div>}

            {/* Method toggle — only show PIN option if user has a PIN set */}
            {hasPin && (
              <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => { setSigningMethod('password'); setSignPin(''); setSignError(null) }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: signingMethod === 'password' ? '600' : '400',
                    background: signingMethod === 'password' ? 'var(--primary, #1B3A5C)' : 'white',
                    color: signingMethod === 'password' ? 'white' : 'var(--text-light)',
                    fontSize: '13px',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  🔑 Password
                </button>
                <button
                  type="button"
                  onClick={() => { setSigningMethod('pin'); setSignPassword(''); setSignError(null) }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontWeight: signingMethod === 'pin' ? '600' : '400',
                    background: signingMethod === 'pin' ? 'var(--primary, #1B3A5C)' : 'white',
                    color: signingMethod === 'pin' ? 'white' : 'var(--text-light)',
                    fontSize: '13px',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  🔢 PIN
                </button>
              </div>
            )}

            {signingMethod === 'password' ? (
              <div className="form-group">
                <label htmlFor="sign-password">Enter your password to confirm signature:</label>
                <input
                  id="sign-password"
                  type="password"
                  value={signPassword}
                  onChange={(e) => setSignPassword(e.target.value)}
                  placeholder="Your account password"
                  disabled={signLoading}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSign()}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="sign-pin">Enter your 6-digit PIN to confirm signature:</label>
                <input
                  id="sign-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={signPin}
                  onChange={(e) => setSignPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit PIN"
                  disabled={signLoading}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSign()}
                />
              </div>
            )}

            <p style={{ fontSize: '12px', color: 'var(--text-light)', margin: 0 }}>
              By signing this document, you confirm that you have read and understood all the content.
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}
