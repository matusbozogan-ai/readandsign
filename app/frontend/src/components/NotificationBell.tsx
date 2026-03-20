import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../api'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  entityType: string | null
  entityId: string | null
  read: boolean
  createdAt: string
}

const POLL_INTERVAL_MS = 30_000 // refresh every 30 s

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function notificationIcon(type: string): string {
  switch (type) {
    case 'assignment_created': return '📋'
    case 'document_signed': return '✅'
    case 'overdue': return '⚠️'
    case 'reminder': return '🔔'
    case 'validity_reassignment': return '🔄'
    default: return '🔔'
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list()
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // silently ignore fetch errors (e.g. logged out)
    }
  }, [])

  // Initial load + polling
  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchNotifications])

  // Close panel on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const handleOpen = () => {
    setOpen((o) => !o)
  }

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await notificationsApi.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // ignore
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await notificationsApi.delete(id)
      const deleted = notifications.find((n) => n.id === id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      if (deleted && !deleted.read) {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
    } catch {
      // ignore
    }
  }

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      try {
        await notificationsApi.markRead(n.id)
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // ignore
      }
    }
    // Navigate to relevant page
    if (n.entityType === 'assignment' && n.entityId) {
      setOpen(false)
      navigate(`/document/${n.entityId}`)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: '8px',
          fontSize: '20px',
          lineHeight: 1,
          color: open ? 'var(--primary, #1B3A5C)' : 'var(--text-light, #64748b)',
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--hover-bg, #f1f5f9)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              background: '#ef4444',
              color: 'white',
              borderRadius: '9px',
              fontSize: '11px',
              fontWeight: '700',
              lineHeight: '18px',
              textAlign: 'center',
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxWidth: '90vw',
            background: 'white',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border, #e2e8f0)',
              background: '#f8fafc',
            }}
          >
            <span style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text, #1e293b)' }}>
              Notifications
              {unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: '8px',
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    fontSize: '11px',
                    fontWeight: '700',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: 'var(--primary, #1B3A5C)',
                  fontWeight: '500',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-light, #64748b)', fontSize: '0.9rem' }}>
                Loading…
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-light, #64748b)',
                  fontSize: '0.9rem',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔔</div>
                No notifications yet
              </div>
            )}
            {!loading &&
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    cursor: n.entityType === 'assignment' ? 'pointer' : 'default',
                    background: n.read ? 'white' : '#f0f7ff',
                    borderBottom: '1px solid var(--border, #e2e8f0)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (n.entityType === 'assignment')
                      (e.currentTarget as HTMLDivElement).style.background = n.read ? '#f8fafc' : '#e3f0fe'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = n.read ? 'white' : '#f0f7ff'
                  }}
                >
                  <span style={{ fontSize: '1.3rem', lineHeight: 1.4, flexShrink: 0 }}>
                    {notificationIcon(n.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: n.read ? '500' : '600',
                        fontSize: '0.88rem',
                        color: 'var(--text, #1e293b)',
                        marginBottom: '3px',
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-light, #64748b)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {n.message}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    {!n.read && (
                      <button
                        title="Mark as read"
                        onClick={(e) => handleMarkRead(n.id, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: '#3b82f6',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ read
                      </button>
                    )}
                    <button
                      title="Dismiss"
                      onClick={(e) => handleDelete(n.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#94a3b8',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
