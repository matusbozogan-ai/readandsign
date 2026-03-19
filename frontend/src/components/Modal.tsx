import React from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}

export function Modal({ isOpen, onClose, title, children, footer, wide }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content"
        style={wide ? { maxWidth: '820px', width: '92vw' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
