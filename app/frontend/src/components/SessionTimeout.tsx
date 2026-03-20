import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'

export function SessionTimeout() {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const checkExpiry = () => {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        return
      }

      try {
        // Decode JWT to get expiry
        const parts = token.split('.')
        if (parts.length !== 3) {
          return
        }

        const payload = JSON.parse(atob(parts[1]))
        if (!payload.exp) {
          return
        }

        const expiryTime = payload.exp * 1000 // Convert to milliseconds
        const now = Date.now()
        const remaining = Math.floor((expiryTime - now) / 1000) // In seconds

        setTimeRemaining(remaining)

        if (remaining > 0 && remaining < 300) {
          // Less than 5 minutes
          setShowWarning(true)
        } else if (remaining <= 0) {
          // Session expired
          localStorage.removeItem('accessToken')
          navigate('/login?reason=timeout')
        }
      } catch (err) {
        console.error('Failed to check session expiry:', err)
      }
    }

    checkExpiry()

    // Check every 30 seconds
    const interval = setInterval(checkExpiry, 30000)

    return () => clearInterval(interval)
  }, [navigate])

  const handleExtend = async () => {
    try {
      const response = await authApi.refresh()
      localStorage.setItem('accessToken', response.accessToken)
      setShowWarning(false)
      setTimeRemaining(null)
    } catch (err) {
      console.error('Failed to refresh token:', err)
      navigate('/login?reason=timeout')
    }
  }

  if (!showWarning || timeRemaining === null) {
    return null
  }

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <div className="session-timeout-banner">
      <div className="session-timeout-content">
        <span className="session-timeout-message">
          ⚠️ Your session will expire in {minutes}:{String(seconds).padStart(2, '0')} minutes.
        </span>
        <button className="session-timeout-button" onClick={handleExtend}>
          Click to Extend
        </button>
      </div>
    </div>
  )
}
