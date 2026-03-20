const API_BASE = '/api'

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const headers: Record<string, string> = {
    // Only set Content-Type for requests that carry a JSON body.
    // Sending Content-Type: application/json on a body-less request (DELETE, GET)
    // causes Fastify's JSON parser to attempt parsing an empty body and return 400.
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers as Record<string, string>,
  }

  // Add authorization header if token exists
  const token = localStorage.getItem('accessToken')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (response.status === 401) {
    // Token expired — redirect to login, but NOT for the login endpoint itself.
    // A failed login also returns 401; redirecting there reloads the page and
    // clears React state before the error message can be rendered.
    if (!endpoint.startsWith('/auth/login')) {
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || error.message || response.statusText)
  }

  if (response.status === 204) {
    return undefined as any
  }

  return response.json()
}

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    apiCall<{ accessToken: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  refresh: () =>
    apiCall<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
    }),

  logout: () =>
    apiCall<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),

  me: () =>
    apiCall<any>('/auth/me', {
      method: 'GET',
    }),
}

// Users API
export const usersApi = {
  list: () =>
    apiCall<any[]>('/users', {
      method: 'GET',
    }),

  create: (email: string, password: string, name: string, role: string, sectionId?: string, employeeNumber?: string) =>
    apiCall<any>('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role, sectionId, employeeNumber }),
    }),

  update: (id: string, updates: any) =>
    apiCall<any>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    apiCall<any>(`/users/${id}`, {
      method: 'DELETE',
    }),

  deactivate: (id: string) =>
    apiCall<any>(`/users/${id}`, {
      method: 'DELETE',
    }),

  getAssignments: (id: string) =>
    apiCall<any[]>(`/users/${id}/assignments`, {
      method: 'GET',
    }),
}

// Documents API
export const documentsApi = {
  list: () =>
    apiCall<any[]>('/documents', {
      method: 'GET',
    }),

  create: (title: string, docNumber?: string, category?: string, issuer?: string, sectionId?: string) =>
    apiCall<any>('/documents', {
      method: 'POST',
      body: JSON.stringify({ title, docNumber, category, issuer, sectionId }),
    }),

  get: (id: string) =>
    apiCall<any>(`/documents/${id}`, {
      method: 'GET',
    }),

  update: (id: string, updates: any) =>
    apiCall<any>(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  upload: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/documents/${id}/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || error.message || response.statusText)
    }

    return response.json()
  },

  getFile: (id: string, version?: string) => {
    const url = version ? `${API_BASE}/documents/${id}/file?version=${version}` : `${API_BASE}/documents/${id}/file`
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return fetch(url, {
      credentials: 'include',
      headers,
    })
  },

  publish: (id: string, versionNumber: number, propagateAssignments?: boolean) =>
    apiCall<any>(`/documents/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ versionNumber, propagateAssignments }),
    }),

  getVersions: (id: string) =>
    apiCall<any[]>(`/documents/${id}/versions`, {
      method: 'GET',
    }),

  getVersionAssignments: (versionId: string) =>
    apiCall<any[]>(`/documents/${versionId}/assignments`, {
      method: 'GET',
    }),

  delete: (id: string) =>
    apiCall<any>(`/documents/${id}`, {
      method: 'DELETE',
    }),
}

// Assignments API
export const assignmentsApi = {
  list: () =>
    apiCall<any[]>('/assignments', {
      method: 'GET',
    }),

  create: (documentVersionId: string, userIds?: string[], groupIds?: string[], deadline?: string) =>
    apiCall<any>('/assignments', {
      method: 'POST',
      body: JSON.stringify({ documentVersionId, userIds, groupIds, deadline }),
    }),

  get: (id: string) =>
    apiCall<any>(`/assignments/${id}`, {
      method: 'GET',
    }),

  update: (id: string, updates: any) =>
    apiCall<any>(`/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    apiCall<any>(`/assignments/${id}`, {
      method: 'DELETE',
    }),

  checkOverdue: () =>
    apiCall<any>('/assignments/check-overdue', {
      method: 'POST',
    }),

  remind: (assignmentId: string) =>
    apiCall<any>(`/assignments/${assignmentId}/remind`, {
      method: 'POST',
      // No body — do NOT set Content-Type: application/json on an empty body or
      // Fastify's JSON parser will attempt to parse an empty stream and return 400.
    }),

  remindPending: (documentVersionId: string) =>
    apiCall<any>('/assignments/remind-pending', {
      method: 'POST',
      body: JSON.stringify({ documentVersionId }),
    }),

  getMatrix: (sectionId?: string) => {
    const qs = sectionId ? `?sectionId=${sectionId}` : ''
    return apiCall<any>(`/assignments/matrix${qs}`, { method: 'GET' })
  },

  escalate: (assignmentId: string) =>
    apiCall<any>(`/assignments/escalate/${assignmentId}`, {
      method: 'POST',
    }),

  checkValidity: () =>
    apiCall<any>('/assignments/check-validity', {
      method: 'POST',
    }),
}

// Reading API
export const readingApi = {
  start: (assignmentId: string) =>
    apiCall<any>('/reading/start', {
      method: 'POST',
      body: JSON.stringify({ assignmentId }),
    }),

  updateProgress: (assignmentId: string, scrollDepth: number, timeSpentSeconds: number, pagesVisited?: number[]) =>
    apiCall<any>('/reading/progress', {
      method: 'POST',
      body: JSON.stringify({ assignmentId, scrollDepth, timeSpentSeconds, pagesVisited }),
    }),

  complete: (assignmentId: string, scrollDepth: number, timeSpentSeconds: number) =>
    apiCall<any>('/reading/complete', {
      method: 'POST',
      body: JSON.stringify({ assignmentId, scrollDepth, timeSpentSeconds }),
    }),

  get: (assignmentId: string) =>
    apiCall<any>(`/reading/${assignmentId}`, {
      method: 'GET',
    }),
}

// Signing API
export const signingApi = {
  sign: (assignmentId: string, credential: string, method: string = 'password') =>
    apiCall<any>('/signing/sign', {
      method: 'POST',
      body: JSON.stringify({ assignmentId, credential, method }),
    }),

  get: (id: string) =>
    apiCall<any>(`/signing/${id}`, {
      method: 'GET',
    }),

  verify: (signingHash: string, assignmentId: string) =>
    apiCall<any>('/signing/verify', {
      method: 'POST',
      body: JSON.stringify({ signingHash, assignmentId }),
    }),

  downloadCertificate: async (assignmentId: string) => {
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(`${API_BASE}/signing/${assignmentId}/certificate`, {
      credentials: 'include',
      headers,
    })
    if (!response.ok) throw new Error('Failed to download certificate')
    return response.blob()
  },
}

// Audit API
export const auditApi = {
  list: (params?: { userId?: string; action?: string; from?: string; to?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)])).toString() : ''
    return apiCall<any>(`/audit${qs}`, {
      method: 'GET',
    })
  },

  export: async (params?: { userId?: string; action?: string; from?: string; to?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)])).toString() : ''
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(`${API_BASE}/audit/export${qs}`, {
      credentials: 'include',
      headers,
    })

    if (!response.ok) {
      throw new Error('Failed to export audit log')
    }

    return response.blob()
  },

  stats: () =>
    apiCall<any>('/audit/stats', {
      method: 'GET',
    }),
}

// Sections API
export const sectionsApi = {
  list: () => apiCall<any[]>('/sections', { method: 'GET' }),
  create: (name: string) => apiCall<any>('/sections', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, name: string) => apiCall<any>(`/sections/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: string) => apiCall<any>(`/sections/${id}`, { method: 'DELETE' }),
}

// Profile API
export const profileApi = {
  get: () => apiCall<any>('/users/profile', { method: 'GET' }),
  update: (updates: { name?: string; currentPassword?: string; newPassword?: string }) =>
    apiCall<any>('/users/profile', { method: 'PUT', body: JSON.stringify(updates) }),
  setPin: (pin: string, currentPassword: string) =>
    apiCall<any>('/users/profile/pin', { method: 'POST', body: JSON.stringify({ pin, currentPassword }) }),
}

// Groups API
export const groupsApi = {
  list: () => apiCall<any[]>('/users/groups', { method: 'GET' }),
  create: (name: string, sectionId: string) => apiCall<any>('/users/groups', { method: 'POST', body: JSON.stringify({ name, sectionId }) }),
  addMember: (groupId: string, userId: string) =>
    apiCall<any>(`/users/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (groupId: string, userId: string) =>
    apiCall<any>(`/users/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
}

// Diff API
export const diffApi = {
  getVersionDiff: (documentId: string, v1: string, v2: string) =>
    apiCall<any>(`/diff/${documentId}?v1=${v1}&v2=${v2}`, { method: 'GET' }),
}

// Reports API
export const reportsApi = {
  downloadCustomerReport: async (customerId: string) => {
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const response = await fetch(`${API_BASE}/reports/customer?customerId=${customerId}`, {
      credentials: 'include',
      headers,
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(err.error || response.statusText)
    }
    return response.blob()
  },

  downloadComplianceReport: async (params?: { sectionId?: string; from?: string; to?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
      : ''
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(`${API_BASE}/reports/compliance${qs}`, {
      credentials: 'include',
      headers,
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(err.error || response.statusText)
    }
    return response.blob()
  },
}

// Customers API
export const customersApi = {
  list: () => apiCall<any[]>('/customers', { method: 'GET' }),

  create: (name: string, contactEmail?: string, notes?: string) =>
    apiCall<any>('/customers', { method: 'POST', body: JSON.stringify({ name, contactEmail, notes }) }),

  update: (id: string, updates: { name?: string; contactEmail?: string; notes?: string }) =>
    apiCall<any>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

  delete: (id: string) =>
    apiCall<any>(`/customers/${id}`, { method: 'DELETE' }),
}

// Organisations API
export const organisationsApi = {
  getCurrent: () => apiCall<{ id: string; name: string; subtitle: string | null }>('/organisations/current', { method: 'GET' }),
  updateCurrent: (updates: { name?: string; subtitle?: string }) =>
    apiCall<{ id: string; name: string; subtitle: string | null }>('/organisations/current', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
}

// Document Options API (categories and issuers)
export const documentOptionsApi = {
  list: (type?: 'category' | 'issuer') => {
    const qs = type ? `?type=${type}` : ''
    return apiCall<Array<{ id: string; type: string; value: string; createdAt: string }>>(`/document-options${qs}`, { method: 'GET' })
  },
  create: (type: 'category' | 'issuer', value: string) =>
    apiCall<{ id: string; type: string; value: string }>('/document-options', {
      method: 'POST',
      body: JSON.stringify({ type, value }),
    }),
  delete: (id: string) =>
    apiCall<any>(`/document-options/${id}`, { method: 'DELETE' }),
}

// Notifications API
export const notificationsApi = {
  list: () =>
    apiCall<{ notifications: any[]; unreadCount: number }>('/notifications', {
      method: 'GET',
    }),

  markRead: (id: string) =>
    apiCall<any>(`/notifications/${id}/read`, {
      method: 'POST',
    }),

  markAllRead: () =>
    apiCall<any>('/notifications/read-all', {
      method: 'POST',
    }),

  delete: (id: string) =>
    apiCall<any>(`/notifications/${id}`, {
      method: 'DELETE',
    }),
}

// Settings API
export const settingsApi = {
  getPreferences: () => apiCall<any>('/users/preferences', { method: 'GET' }),
  savePreferences: (prefs: any) =>
    apiCall<any>('/users/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  getSessions: () => apiCall<any[]>('/users/sessions', { method: 'GET' }),
  revokeAllSessions: () => apiCall<any>('/users/sessions', { method: 'DELETE' }),
  revokeSession: (tokenId: string) =>
    apiCall<any>(`/users/sessions/${tokenId}`, { method: 'DELETE' }),
}

// Quiz API
export const quizApi = {
  getForDocument: (documentId: string) =>
    apiCall<any>(`/quiz/document/${documentId}`, { method: 'GET' }),
  create: (documentId: string, data: any) =>
    apiCall<any>(`/quiz/document/${documentId}`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (documentId: string) =>
    apiCall<any>(`/quiz/document/${documentId}`, { method: 'DELETE' }),
  submitAttempt: (assignmentId: string, answers: Record<string, string>) =>
    apiCall<any>('/quiz/attempt', { method: 'POST', body: JSON.stringify({ assignmentId, answers }) }),
  getAttempt: (assignmentId: string) =>
    apiCall<any>(`/quiz/attempt/${assignmentId}`, { method: 'GET' }),
}
