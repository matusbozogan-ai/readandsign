import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { documentsApi } from '../api'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: '📄',
  pptx: '📊',
  docx: '📝',
  xlsx: '📈',
}

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentTitle: string
  versionNumber?: number
  fileType?: string
}

export function DocumentPreviewModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  versionNumber,
  fileType = 'pdf',
}: DocumentPreviewModalProps) {
  // scrollRef  → the outer scrollable container (for scroll-position tracking)
  // canvasRef  → a dedicated inner div React never renders children into (safe for imperative canvas appending)
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const isPdf = !fileType || fileType === 'pdf'

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Load & render PDF into the dedicated canvasRef div
  useEffect(() => {
    if (!isOpen || !isPdf) return

    let cancelled = false

    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      setTotalPages(0)
      setCurrentPage(1)

      // Clear any previous canvases
      if (canvasRef.current) canvasRef.current.innerHTML = ''

      try {
        const response = await documentsApi.getFile(
          documentId,
          versionNumber !== undefined ? String(versionNumber) : undefined,
        )
        if (cancelled) return

        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        if (cancelled) return

        setTotalPages(pdf.numPages)

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled || !canvasRef.current) return

          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: 1.5 })

          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.dataset.page = String(pageNum)
          canvas.style.cssText = [
            'display:block',
            'margin:0 auto 20px',
            'border-radius:4px',
            'box-shadow:0 2px 10px rgba(0,0,0,0.18)',
            'max-width:100%',
          ].join(';')

          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled || !canvasRef.current) return
          canvasRef.current.appendChild(canvas)
        }
      } catch (err: any) {
        if (!cancelled) setError(`Could not load document: ${err.message}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPdf()

    return () => {
      cancelled = true
      // Clean up canvases when modal closes or deps change
      if (canvasRef.current) canvasRef.current.innerHTML = ''
    }
  }, [isOpen, documentId, versionNumber, isPdf])

  // Track current page from scroll position
  const onScroll = useCallback(() => {
    if (!scrollRef.current || !canvasRef.current) return
    const scrollTop = scrollRef.current.scrollTop + 80
    let current = 1
    canvasRef.current
      .querySelectorAll<HTMLCanvasElement>('canvas[data-page]')
      .forEach((c) => {
        if (c.offsetTop <= scrollTop) current = Number(c.dataset.page)
      })
    setCurrentPage(current)
  }, [])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15,23,42,0.82)',
      }}
      onClick={onClose}
    >
      {/* ── Header ── */}
      <div
        style={{
          flexShrink: 0,
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>
            {FILE_TYPE_ICONS[fileType] ?? '📄'}
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: '600',
                fontSize: '0.95rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {documentTitle}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {versionNumber !== undefined && `Version ${versionNumber}`}
              {versionNumber !== undefined && totalPages > 0 && ' · '}
              {totalPages > 0 && `Page ${currentPage} / ${totalPages}`}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            flexShrink: 0,
            background: 'none',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            color: '#475569',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Body ── */}
      <div
        ref={scrollRef}
        onScroll={isPdf ? onScroll : undefined}
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#f1f5f9',
          padding: '28px 16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading indicator — rendered by React, lives outside canvasRef */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid #e2e8f0',
                borderTopColor: '#166534',
                borderRadius: '50%',
                animation: 'ras-spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            Loading document…
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            style={{
              maxWidth: '480px',
              margin: '60px auto',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              padding: '20px',
              color: '#9f1239',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠</div>
            {error}
          </div>
        )}

        {/* Non-PDF download prompt */}
        {!isPdf && !loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              gap: '16px',
              color: '#475569',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '64px' }}>{FILE_TYPE_ICONS[fileType] ?? '📄'}</div>
            <p style={{ margin: 0, fontWeight: '500' }}>
              {fileType.toUpperCase()} files cannot be previewed inline.
            </p>
            <a
              href={`/api/documents/${documentId}/file${versionNumber !== undefined ? `?version=${versionNumber}` : ''}`}
              download
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                background: '#166534',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '0.9rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              ⬇ Download to view
            </a>
          </div>
        )}

        {/*
          Dedicated canvas mount point — React declares this div but NEVER
          renders children into it, so imperative canvas.appendChild() calls
          are safe across re-renders.
        */}
        {isPdf && (
          <div ref={canvasRef} />
        )}
      </div>

      <style>{`@keyframes ras-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
