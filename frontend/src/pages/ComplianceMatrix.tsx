import { useState, useEffect } from 'react'
import { assignmentsApi } from '../api'

interface MatrixUser {
  id: string
  name: string
  email: string
  employeeNumber?: string
  sectionName?: string
}

interface MatrixDocument {
  id: string
  title: string
  docNumber?: string
  versionId: string
  versionNumber: number
}

interface CellStatus {
  status: 'signed' | 'pending' | 'overdue' | 'not_assigned'
  signedAt?: string
  deadline?: string
}

export function ComplianceMatrix() {
  const [users, setUsers] = useState<MatrixUser[]>([])
  const [documents, setDocuments] = useState<MatrixDocument[]>([])
  const [cells, setCells] = useState<Record<string, CellStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [sections, setSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadMatrix() {
      try {
        setLoading(true)
        const data = await assignmentsApi.getMatrix()
        setUsers(data.users)
        setDocuments(data.documents)
        setCells(data.cells)

        // Extract unique sections
        const uniqueSections = new Set<string>()
        for (const user of data.users) {
          if (user.sectionName) {
            uniqueSections.add(user.sectionName)
          }
        }
        setSections(uniqueSections)
      } catch (err: any) {
        setError(err.message || 'Failed to load compliance matrix')
      } finally {
        setLoading(false)
      }
    }

    loadMatrix()
  }, [])

  const filteredUsers = selectedSection
    ? users.filter((u) => u.sectionName === selectedSection)
    : users

  const calculateCompliance = () => {
    if (filteredUsers.length === 0 || documents.length === 0) {
      return 0
    }

    let signedCount = 0
    for (const user of filteredUsers) {
      for (const doc of documents) {
        const key = `${user.id}:${doc.versionId}`
        if (cells[key]?.status === 'signed') {
          signedCount++
        }
      }
    }

    const total = filteredUsers.length * documents.length
    return Math.round((signedCount / total) * 100)
  }

  const handleExportCSV = () => {
    let csv = 'User,Email,'
    csv += documents.map((d) => `${d.title} (${d.docNumber || 'N/A'})`).join(',')
    csv += '\n'

    for (const user of filteredUsers) {
      csv += `"${user.name}","${user.email}"`
      for (const doc of documents) {
        const key = `${user.id}:${doc.versionId}`
        const status = cells[key]?.status || 'not_assigned'
        csv += `,${status}`
      }
      csv += '\n'
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance-matrix-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="loading">Loading compliance matrix...</div>
  }

  const compliance = calculateCompliance()

  return (
    <div className="compliance-matrix">
      <div className="matrix-header">
        <h1>Compliance Matrix</h1>
        <div className="matrix-summary">
          <div className="summary-stat">
            <span className="stat-value">{compliance}%</span>
            <span className="stat-label">Overall Compliance</span>
          </div>
          <div className="summary-stat">
            <span className="stat-value">{filteredUsers.length}</span>
            <span className="stat-label">Users</span>
          </div>
          <div className="summary-stat">
            <span className="stat-value">{documents.length}</span>
            <span className="stat-label">Documents</span>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="matrix-controls">
        <div className="section-filter">
          <label>Filter by Section</label>
          <select value={selectedSection || ''} onChange={(e) => setSelectedSection(e.target.value || null)}>
            <option value="">All Sections</option>
            {Array.from(sections).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={handleExportCSV}>
          📥 Export CSV
        </button>
      </div>

      <div className="matrix-table-container">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="sticky-col">User</th>
              {documents.map((doc) => (
                <th key={doc.versionId} className="document-header" title={doc.title}>
                  <div className="doc-title">{doc.title.substring(0, 20)}</div>
                  <div className="doc-number">{doc.docNumber}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="sticky-col user-cell">
                  <div className="user-name">{user.name}</div>
                  <div className="user-meta">
                    {user.employeeNumber && <span>{user.employeeNumber}</span>}
                    {user.sectionName && <span>{user.sectionName}</span>}
                  </div>
                </td>
                {documents.map((doc) => {
                  const key = `${user.id}:${doc.versionId}`
                  const status = cells[key]?.status || 'not_assigned'
                  const cellClass = `cell-${status}`

                  return (
                    <td key={doc.versionId} className={`matrix-cell ${cellClass}`} title={`${user.name} - ${doc.title}: ${status}`}>
                      <span className="status-icon">
                        {status === 'signed' && '✓'}
                        {status === 'pending' && '○'}
                        {status === 'overdue' && '✗'}
                        {status === 'not_assigned' && '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="matrix-legend">
        <div className="legend-item">
          <span className="legend-box signed">✓</span>
          <span>Signed</span>
        </div>
        <div className="legend-item">
          <span className="legend-box pending">○</span>
          <span>Pending</span>
        </div>
        <div className="legend-item">
          <span className="legend-box overdue">✗</span>
          <span>Overdue</span>
        </div>
        <div className="legend-item">
          <span className="legend-box not-assigned">—</span>
          <span>Not Assigned</span>
        </div>
      </div>
    </div>
  )
}
