import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { organisationsApi } from '../api'
import { SessionTimeout } from './SessionTimeout'
import { NotificationBell } from './NotificationBell'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [orgName, setOrgName] = useState('Read & Sign')
  const [orgSubtitle, setOrgSubtitle] = useState('')

  // Fetch org branding once when user is available
  useEffect(() => {
    if (user) {
      organisationsApi.getCurrent()
        .then((org) => {
          if (org.name) setOrgName(org.name)
          if (org.subtitle) setOrgSubtitle(org.subtitle)
        })
        .catch(() => {/* non-fatal, keep defaults */})
    }
  }, [user])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Close user menu on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

  // Lock body scroll when sidebar overlay is open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const handleLogout = async () => {
    setShowUserMenu(false)
    await logout()
    navigate('/login')
  }

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  // Initials from name
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const isAdmin = user?.role !== 'user'
  const isSuperAdmin = user?.role === 'super_admin'

  return (
    <div className="layout">
      <SessionTimeout />

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Navigation">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">✈ {orgName}</h1>
          {orgSubtitle && <p className="sidebar-logo-sub">{orgSubtitle}</p>}
        </div>

        <nav className="sidebar-nav">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            <span className="sidebar-nav-icon">📊</span>
            Dashboard
          </Link>
          <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>
            <span className="sidebar-nav-icon">⚙</span>
            Settings
          </Link>

          {isAdmin && (
            <>
              <div className="sidebar-nav-section">Management</div>
              <Link to="/admin/documents" className={isActive('/admin/documents') ? 'active' : ''}>
                <span className="sidebar-nav-icon">📄</span>
                Documents
              </Link>
              <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>
                <span className="sidebar-nav-icon">👥</span>
                Users
              </Link>
              <Link to="/admin/assignments" className={isActive('/admin/assignments') ? 'active' : ''}>
                <span className="sidebar-nav-icon">📋</span>
                Assignments
              </Link>
              <Link to="/admin/customers" className={isActive('/admin/customers') ? 'active' : ''}>
                <span className="sidebar-nav-icon">🏢</span>
                Customers
              </Link>

              <div className="sidebar-nav-section">Compliance</div>
              <Link to="/admin/compliance" className={isActive('/admin/compliance') ? 'active' : ''}>
                <span className="sidebar-nav-icon">✅</span>
                Compliance
              </Link>
              <Link to="/admin/matrix" className={isActive('/admin/matrix') ? 'active' : ''}>
                <span className="sidebar-nav-icon">🗂</span>
                Matrix
              </Link>
              <Link to="/admin/audit" className={isActive('/admin/audit') ? 'active' : ''}>
                <span className="sidebar-nav-icon">🔍</span>
                Audit Log
              </Link>

              {isSuperAdmin && (
                <>
                  <div className="sidebar-nav-section">Organisation</div>
                  <Link to="/admin/sections" className={isActive('/admin/sections') ? 'active' : ''}>
                    <span className="sidebar-nav-icon">🏢</span>
                    Sections
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            {/* Hamburger (mobile) */}
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="hamburger-icon">
                <span />
                <span />
                <span />
              </span>
            </button>
            <h2 className="header-title">{orgSubtitle || orgName}</h2>
          </div>

          <div className="header-actions">
            <NotificationBell />
            <div className="user-menu" ref={userMenuRef}>
              <button
                className="user-button"
                onClick={() => setShowUserMenu(o => !o)}
                aria-haspopup="true"
                aria-expanded={showUserMenu}
              >
                <span className="user-avatar">{initials}</span>
                <span className="user-name-text">{user?.name}</span>
              </button>

              {showUserMenu && (
                <div className="user-menu-dropdown" role="menu">
                  <a
                    href="#"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowUserMenu(false)
                      navigate('/settings')
                    }}
                  >
                    ⚙&nbsp; Settings
                  </a>
                  <a
                    href="#"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault()
                      handleLogout()
                    }}
                  >
                    ↩&nbsp; Sign out
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
