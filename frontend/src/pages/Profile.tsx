import { useState, useEffect } from 'react'
import { profileApi } from '../api'

export function Profile() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Account details
  const [name, setName] = useState('')

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // PIN
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinCurrentPassword, setPinCurrentPassword] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const data = await profileApi.get()
        setProfile(data)
        setName(data.name)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setError(null)
      await profileApi.update({ name })
      setSuccess('Name updated successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword || !newPassword) {
      setError('Both passwords are required')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    try {
      setError(null)
      setPasswordLoading(true)
      await profileApi.update({ currentPassword, newPassword })
      setSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!pin || !pinCurrentPassword) {
      setError('PIN and password are required')
      return
    }

    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits')
      return
    }

    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    try {
      setError(null)
      setPinLoading(true)
      await profileApi.setPin(pin, pinCurrentPassword)
      setSuccess('PIN set successfully')
      setPin('')
      setConfirmPin('')
      setPinCurrentPassword('')
      // Reload profile to update hasPin status
      const data = await profileApi.get()
      setProfile(data)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPinLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading profile...</div>

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>My Profile</h2>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: '16px' }}>{success}</div>}

      {/* Account Details */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Account Details</h3>
        <form onSubmit={handleUpdateName}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Email
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: '#f5f5f5',
                cursor: 'not-allowed',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Role
            </label>
            <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '14px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  backgroundColor: profile?.role === 'super_admin' ? 'var(--red)' : profile?.role === 'section_admin' ? 'var(--blue)' : 'var(--gray)',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {profile?.role === 'super_admin' ? 'Super Admin' : profile?.role === 'section_admin' ? 'Section Admin' : 'User'}
              </span>
            </div>
          </div>

          {profile?.sectionName && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
                Section
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '14px' }}>
                {profile.sectionName}
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary">
            Update Name
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Change Password</h3>
        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
            {passwordLoading ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Signing PIN */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>Signing PIN</h3>
        {profile?.hasPin ? (
          <div style={{ padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '4px', marginBottom: '16px', color: '#2e7d32' }}>
            ✓ PIN is set and active
          </div>
        ) : (
          <div style={{ padding: '12px', backgroundColor: '#fff3e0', borderRadius: '4px', marginBottom: '16px', color: '#e65100' }}>
            No PIN configured. Set a PIN to sign documents with PIN authentication.
          </div>
        )}

        <form onSubmit={handleSetPin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              PIN (6 digits)
            </label>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
                fontKerning: 'auto',
                letterSpacing: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Confirm PIN
            </label>
            <input
              type="text"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
                letterSpacing: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Current Password
            </label>
            <input
              type="password"
              value={pinCurrentPassword}
              onChange={(e) => setPinCurrentPassword(e.target.value)}
              placeholder="Enter your password to confirm"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={pinLoading}>
            {pinLoading ? 'Setting PIN...' : profile?.hasPin ? 'Update PIN' : 'Set PIN'}
          </button>
        </form>
      </div>
    </div>
  )
}
