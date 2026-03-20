import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from './api'

interface User {
  id: string
  email: string
  name: string
  role: string
  organisationId: string
  sectionId: string | null
}

interface AuthContextType {
  user: User | null
  accessToken: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check auth status on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken')
        if (token) {
          setAccessToken(token)
          // Verify token is still valid
          try {
            const currentUser = await authApi.me()
            setUser(currentUser)
          } catch (err) {
            // Token invalid, clear it
            localStorage.removeItem('accessToken')
            setAccessToken(null)
          }
        }
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      setError(null)
      const response = await authApi.login(email, password)
      localStorage.setItem('accessToken', response.accessToken)
      setAccessToken(response.accessToken)
      setUser(response.user)
    } catch (err: any) {
      const errorMsg = err.message || 'Login failed'
      setError(errorMsg)
      throw err
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('accessToken')
      setAccessToken(null)
      setUser(null)
    }
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, error, login, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
