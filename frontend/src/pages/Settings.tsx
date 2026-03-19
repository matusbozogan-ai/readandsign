import { useState, useEffect, useCallback } from 'react'
import { profileApi, settingsApi } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  notifications: {
    assignmentEmail: boolean
    reminderEmail: boolean
    overdueEmail: boolean
    weeklyDigest: boolean
  }
  display: {
    itemsPerPage: 10 | 20 | 50 | 100
    dateFormat: 'locale' | 'iso' | 'relative'
    compactMode: boolean
    sidebarCollapsed: boolean
  }
}

interface Session {
  id: string
  createdAt: string
  lastUsedAt: string | null
  userAgent: string | null
  expiresAt: string
  isCurrent: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseUA(ua: string | null): string {
  if (!ua) return 'Unknown browser'
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('Edg')) return 'Edge'
  return ua.substring(0, 40)
}

function parseOS(ua: string | null): string {
  if (!ua) return 'Unknown OS'
  if (ua.includes('Windows NT 10')) return 'Windows 10/11'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Android')) return 'Android'
  return 'Unknown OS'
}

function timeAgo(date: string | null): string {
  if (!date) return 'Never'
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: checked ? 'var(--primary, #1B3A5C)' : '#d1d5db',
        transition: 'background-color 0.2s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '23px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: 'white',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SettingRow({
  label, description, children,
}: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: '1px solid var(--border, #e2e8f0)',
      gap: '16px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text, #1a202c)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: '12px', color: 'var(--text-light, #718096)', marginTop: '2px' }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: 'var(--navy, #1B3A5C)' }}>
        {title}
      </h3>
      <div>{children}</div>
    </div>
  )
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const [profile, setProfile] = useState<any>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    profileApi.get().then((d) => { setProfile(d); setName(d.name) }).catch(() => {})
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      await profileApi.update({ name })
      setMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <div className="loading">Loading…</div>

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Administrator',
    section_admin: 'Section Administrator',
    user: 'Standard User',
  }
  const roleBg: Record<string, string> = {
    super_admin: '#dc2626',
    section_admin: '#2563eb',
    user: '#6b7280',
  }

  return (
    <form onSubmit={handleSave}>
      {msg && (
        <div className={msg.type === 'success' ? 'success' : 'error'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      <SectionCard title="Identity">
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 0', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--primary, #1B3A5C)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', fontWeight: 700, flexShrink: 0,
          }}>
            {profile.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '16px' }}>{profile.name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-light)' }}>{profile.email}</div>
          </div>
        </div>

        <SettingRow label="Display Name" description="Shown throughout the platform">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '220px', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px' }}
          />
        </SettingRow>

        <SettingRow label="Email Address" description="Contact your administrator to change email">
          <input
            type="email"
            value={profile.email}
            disabled
            style={{ width: '220px', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px', background: '#f9fafb', cursor: 'not-allowed' }}
          />
        </SettingRow>

        <SettingRow label="Employee Number" description="Assigned by your organisation">
          <input
            type="text"
            value={profile.employeeNumber || '—'}
            disabled
            style={{ width: '220px', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px', background: '#f9fafb', cursor: 'not-allowed' }}
          />
        </SettingRow>

        <SettingRow label="Role">
          <span style={{
            display: 'inline-block', padding: '4px 10px', borderRadius: '4px',
            fontSize: '12px', fontWeight: 600, color: 'white',
            backgroundColor: roleBg[profile.role] || '#6b7280',
          }}>
            {roleLabel[profile.role] || profile.role}
          </span>
        </SettingRow>

        {profile.sectionName && (
          <SettingRow label="Section">
            <span style={{ fontSize: '14px', color: 'var(--text)' }}>{profile.sectionName}</span>
          </SettingRow>
        )}

        <div style={{ padding: '10px 0 0', borderTop: '0' }}>
          <SettingRow label="Member Since" description="">
            <span style={{ fontSize: '14px', color: 'var(--text-light)' }}>
              {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            </span>
          </SettingRow>
        </div>
      </SectionCard>

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  )
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Password form
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdStrength, setPwdStrength] = useState(0)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // PIN form
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinPwd, setPinPwd] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinMsg, setPinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [sessionMsg, setSessionMsg] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const data = await settingsApi.getSessions()
      setSessions(data)
    } catch { /* ignore */ }
    finally { setSessionsLoading(false) }
  }, [])

  useEffect(() => {
    profileApi.get().then(setProfile).catch(() => {})
    loadSessions()
  }, [loadSessions])

  const checkStrength = (pwd: string) => {
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++
    setPwdStrength(score)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPwd || !newPwd) { setPwdMsg({ type: 'error', text: 'All fields are required.' }); return }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'error', text: 'New passwords do not match.' }); return }
    if (newPwd.length < 8) { setPwdMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return }
    setPwdSaving(true); setPwdMsg(null)
    try {
      await profileApi.update({ currentPassword: currentPwd, newPassword: newPwd })
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdStrength(0)
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message })
    } finally { setPwdSaving(false) }
  }

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || !pinPwd) { setPinMsg({ type: 'error', text: 'PIN and password required.' }); return }
    if (!/^\d{6}$/.test(pin)) { setPinMsg({ type: 'error', text: 'PIN must be exactly 6 digits.' }); return }
    if (pin !== confirmPin) { setPinMsg({ type: 'error', text: 'PINs do not match.' }); return }
    setPinSaving(true); setPinMsg(null)
    try {
      await profileApi.setPin(pin, pinPwd)
      setPinMsg({ type: 'success', text: profile?.hasPin ? 'PIN updated successfully.' : 'PIN set successfully.' })
      setPin(''); setConfirmPin(''); setPinPwd('')
      const d = await profileApi.get(); setProfile(d)
    } catch (err: any) {
      setPinMsg({ type: 'error', text: err.message })
    } finally { setPinSaving(false) }
  }

  const handleRevokeSession = async (tokenId: string) => {
    setRevokingId(tokenId)
    try {
      await settingsApi.revokeSession(tokenId)
      await loadSessions()
    } catch (err: any) {
      alert(`Failed: ${err.message}`)
    } finally { setRevokingId(null) }
  }

  const handleRevokeAll = async () => {
    if (!window.confirm('This will sign out all other devices. Continue?')) return
    try {
      const r = await settingsApi.revokeAllSessions()
      setSessionMsg(`Signed out ${r.revokedCount} other session(s).`)
      await loadSessions()
      setTimeout(() => setSessionMsg(null), 4000)
    } catch (err: any) {
      alert(`Failed: ${err.message}`)
    }
  }

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
  const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#16a34a']

  return (
    <div>
      {/* Change Password */}
      <SectionCard title="Change Password">
        <form onSubmit={handlePasswordChange}>
          {pwdMsg && (
            <div className={pwdMsg.type === 'success' ? 'success' : 'error'} style={{ marginBottom: '12px' }}>
              {pwdMsg.text}
            </div>
          )}
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Enter current password" autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" value={newPwd}
              onChange={(e) => { setNewPwd(e.target.value); checkStrength(e.target.value) }}
              placeholder="Min. 8 characters" autoComplete="new-password" />
            {newPwd && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} style={{
                      height: '4px', flex: 1, borderRadius: '2px',
                      background: i <= pwdStrength ? strengthColor[pwdStrength] : '#e2e8f0',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: '12px', color: strengthColor[pwdStrength] }}>
                  {strengthLabel[pwdStrength]}
                </span>
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Repeat new password" autoComplete="new-password" />
            {confirmPwd && newPwd !== confirmPwd && (
              <small style={{ color: '#ef4444' }}>Passwords do not match</small>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
            {pwdSaving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </SectionCard>

      {/* PIN */}
      <SectionCard title="Signing PIN">
        <div style={{
          padding: '10px 14px', borderRadius: '6px', marginBottom: '16px',
          background: profile?.hasPin ? '#f0fdf4' : '#fffbeb',
          color: profile?.hasPin ? '#166534' : '#92400e',
          fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>{profile?.hasPin ? '✓ PIN is active' : '⚠ No PIN set'}</span>
          {!profile?.hasPin && (
            <span style={{ color: '#92400e' }}>— Set a 6-digit PIN to sign documents faster</span>
          )}
        </div>

        <form onSubmit={handleSetPin}>
          {pinMsg && (
            <div className={pinMsg.type === 'success' ? 'success' : 'error'} style={{ marginBottom: '12px' }}>
              {pinMsg.text}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{profile?.hasPin ? 'New PIN' : 'PIN'} (6 digits)</label>
              <input type="password" inputMode="numeric" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••" maxLength={6}
                style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '18px' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Confirm PIN</label>
              <input type="password" inputMode="numeric" value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••" maxLength={6}
                style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '18px' }} />
            </div>
          </div>
          {pin.length === 6 && confirmPin.length === 6 && pin !== confirmPin && (
            <small style={{ color: '#ef4444', display: 'block', marginBottom: '8px' }}>PINs do not match</small>
          )}
          <div className="form-group">
            <label>Your Password (to confirm)</label>
            <input type="password" value={pinPwd} onChange={(e) => setPinPwd(e.target.value)}
              placeholder="Enter your account password" autoComplete="current-password" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pinSaving}>
            {pinSaving ? 'Setting…' : profile?.hasPin ? 'Update PIN' : 'Set PIN'}
          </button>
        </form>
      </SectionCard>

      {/* Active Sessions */}
      <SectionCard title="Active Sessions">
        {sessionMsg && (
          <div className="success" style={{ marginBottom: '12px' }}>{sessionMsg}</div>
        )}
        <p style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '12px', marginTop: 0 }}>
          Devices currently signed into your account. Revoke sessions you don't recognise.
        </p>

        {sessionsLoading ? (
          <div className="loading" style={{ padding: '12px 0' }}>Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--text-light)', fontSize: '13px' }}>No active sessions found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {sessions.map((s) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                background: s.isCurrent ? '#f0f9ff' : '#fafafa',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px' }}>
                    {s.userAgent?.includes('Mobile') || s.userAgent?.includes('Android') || s.userAgent?.includes('iPhone') ? '📱' : '🖥'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {parseOS(s.userAgent)} — {parseUA(s.userAgent)}
                      {s.isCurrent && (
                        <span style={{ fontSize: '11px', background: '#0ea5e9', color: 'white', borderRadius: '4px', padding: '1px 6px' }}>
                          This device
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                      Last active {timeAgo(s.lastUsedAt || s.createdAt)} · Expires {new Date(s.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    className="btn btn-xs btn-danger"
                    onClick={() => handleRevokeSession(s.id)}
                    disabled={revokingId === s.id}
                    style={{ flexShrink: 0 }}
                  >
                    {revokingId === s.id ? '…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {sessions.filter((s) => !s.isCurrent).length > 0 && (
          <button className="btn btn-secondary" onClick={handleRevokeAll}>
            Sign Out All Other Devices
          </button>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab({ prefs, onSave, saving }: {
  prefs: Preferences
  onSave: (p: Preferences) => void
  saving: boolean
}) {
  const [local, setLocal] = useState(prefs)

  useEffect(() => { setLocal(prefs) }, [prefs])

  const setNotif = (key: keyof Preferences['notifications'], val: boolean) =>
    setLocal((p) => ({ ...p, notifications: { ...p.notifications, [key]: val } }))

  return (
    <div>
      <SectionCard title="Email Notifications">
        <p style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: 0, marginBottom: '4px' }}>
          Control which emails the platform sends to your address.
        </p>

        <SettingRow
          label="New assignment"
          description="When a document is assigned to you"
        >
          <Toggle checked={local.notifications.assignmentEmail} onChange={(v) => setNotif('assignmentEmail', v)} />
        </SettingRow>

        <SettingRow
          label="Deadline reminders"
          description="When a signing deadline is approaching"
        >
          <Toggle checked={local.notifications.reminderEmail} onChange={(v) => setNotif('reminderEmail', v)} />
        </SettingRow>

        <SettingRow
          label="Overdue alerts"
          description="When an assignment passes its deadline unsigned"
        >
          <Toggle checked={local.notifications.overdueEmail} onChange={(v) => setNotif('overdueEmail', v)} />
        </SettingRow>

        <SettingRow
          label="Weekly digest"
          description="Summary of outstanding compliance items every Monday"
        >
          <Toggle checked={local.notifications.weeklyDigest} onChange={(v) => setNotif('weeklyDigest', v)} />
        </SettingRow>
      </SectionCard>

      <button className="btn btn-primary" onClick={() => onSave(local)} disabled={saving}>
        {saving ? 'Saving…' : 'Save Notification Settings'}
      </button>
    </div>
  )
}

// ─── Tab: Display ─────────────────────────────────────────────────────────────

function DisplayTab({ prefs, onSave, saving }: {
  prefs: Preferences
  onSave: (p: Preferences) => void
  saving: boolean
}) {
  const [local, setLocal] = useState(prefs)

  useEffect(() => { setLocal(prefs) }, [prefs])

  const setDisplay = (key: keyof Preferences['display'], val: any) =>
    setLocal((p) => ({ ...p, display: { ...p.display, [key]: val } }))

  return (
    <div>
      <SectionCard title="Table & List Preferences">
        <SettingRow
          label="Items per page"
          description="Default number of rows in tables"
        >
          <select
            value={local.display.itemsPerPage}
            onChange={(e) => setDisplay('itemsPerPage', parseInt(e.target.value) as any)}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </SettingRow>

        <SettingRow
          label="Date format"
          description="How dates are displayed throughout the app"
        >
          <select
            value={local.display.dateFormat}
            onChange={(e) => setDisplay('dateFormat', e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px' }}
          >
            <option value="locale">Local ({new Date().toLocaleDateString()})</option>
            <option value="iso">ISO ({new Date().toISOString().split('T')[0]})</option>
            <option value="relative">Relative (3 days ago)</option>
          </select>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Layout">
        <SettingRow
          label="Compact mode"
          description="Reduce padding and font sizes for denser information display"
        >
          <Toggle checked={local.display.compactMode} onChange={(v) => setDisplay('compactMode', v)} />
        </SettingRow>

        <SettingRow
          label="Collapse sidebar by default"
          description="Start with the navigation sidebar minimised"
        >
          <Toggle checked={local.display.sidebarCollapsed} onChange={(v) => setDisplay('sidebarCollapsed', v)} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Preview">
        <div style={{
          padding: '12px 16px', borderRadius: '6px', background: '#f8fafc',
          border: '1px solid var(--border)', fontSize: local.display.compactMode ? '12px' : '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: local.display.compactMode ? '6px' : '10px' }}>
            <strong>Document Title</strong>
            <span style={{ color: 'var(--text-light)' }}>
              {local.display.dateFormat === 'iso'
                ? new Date().toISOString().split('T')[0]
                : local.display.dateFormat === 'relative'
                ? 'Today'
                : new Date().toLocaleDateString()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              PENDING
            </span>
            <span style={{ color: 'var(--text-light)' }}>Deadline: 3/24/2026</span>
          </div>
        </div>
      </SectionCard>

      <button className="btn btn-primary" onClick={() => onSave(local)} disabled={saving}>
        {saving ? 'Saving…' : 'Save Display Settings'}
      </button>
    </div>
  )
}

// ─── Main Settings page ───────────────────────────────────────────────────────

const TABS = [
  { id: 'profile', label: '👤 Profile' },
  { id: 'security', label: '🔒 Security' },
  { id: 'notifications', label: '🔔 Notifications' },
  { id: 'display', label: '🎨 Display' },
] as const

type TabId = (typeof TABS)[number]['id']

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)

  useEffect(() => {
    settingsApi.getPreferences().then(setPrefs).catch(() => {})
  }, [])

  const handleSavePrefs = async (updated: Preferences) => {
    setPrefsSaving(true); setPrefsMsg(null)
    try {
      await settingsApi.savePreferences(updated)
      setPrefs(updated)
      // Persist display prefs in localStorage so they're available immediately
      localStorage.setItem('userPrefs', JSON.stringify(updated.display))
      setPrefsMsg('Settings saved.')
      setTimeout(() => setPrefsMsg(null), 3000)
    } catch (err: any) {
      setPrefsMsg(`Error: ${err.message}`)
    } finally {
      setPrefsSaving(false)
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 24px' }}>Settings</h2>

      {prefsMsg && (
        <div className={prefsMsg.startsWith('Error') ? 'error' : 'success'} style={{ marginBottom: '16px' }}>
          {prefsMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Sidebar tabs */}
        <nav style={{
          flexShrink: 0, width: '180px',
          background: 'white', borderRadius: '8px',
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'block', width: '100%', padding: '12px 16px',
                textAlign: 'left', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: activeTab === tab.id ? 600 : 400,
                background: activeTab === tab.id ? 'var(--primary, #1B3A5C)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--text)',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && prefs && (
            <NotificationsTab prefs={prefs} onSave={handleSavePrefs} saving={prefsSaving} />
          )}
          {activeTab === 'display' && prefs && (
            <DisplayTab prefs={prefs} onSave={handleSavePrefs} saving={prefsSaving} />
          )}
          {(activeTab === 'notifications' || activeTab === 'display') && !prefs && (
            <div className="loading">Loading preferences…</div>
          )}
        </div>
      </div>
    </div>
  )
}
