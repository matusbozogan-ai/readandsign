import { useState, useEffect } from 'react'
import { auditApi } from '../api'
import { Badge } from '../components/Badge'

export function AuditLog() {
  const [logs, setLogs] = useState<any[]>([])
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [filterAction, setFilterAction] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')

  useEffect(() => {
    loadLogs(0)
  }, [])

  const loadLogs = async (offset: number) => {
    try {
      setLoading(true)
      const filters: any = { offset, limit: 50 }
      if (filterAction) filters.action = filterAction
      if (filterFromDate) filters.from = filterFromDate
      if (filterToDate) filters.to = filterToDate

      const result = await auditApi.list(filters)
      setLogs(result.data || result)
      setPagination(result.pagination || { total: result.length, limit: 50, offset, hasMore: false })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyFilters = () => {
    loadLogs(0)
  }

  const handleResetFilters = () => {
    setFilterAction('')
    setFilterFromDate('')
    setFilterToDate('')
    loadLogs(0)
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const filters: any = {}
      if (filterAction) filters.action = filterAction
      if (filterFromDate) filters.from = filterFromDate
      if (filterToDate) filters.to = filterToDate

      const blob = await auditApi.export(filters)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('Failed to export audit log: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handlePreviousPage = () => {
    if (pagination.offset >= pagination.limit) {
      loadLogs(pagination.offset - pagination.limit)
    }
  }

  const handleNextPage = () => {
    if (pagination.hasMore) {
      loadLogs(pagination.offset + pagination.limit)
    }
  }

  if (loading) return <div className="loading">Loading audit log...</div>

  const getActionBadgeStatus = (action: string) => {
    if (action.includes('LOGIN')) return 'primary'
    if (action.includes('LOGOUT')) return 'primary'
    if (action.includes('CREATE')) return 'success'
    if (action.includes('DELETE')) return 'danger'
    if (action.includes('SIGN')) return 'success'
    if (action.includes('UPDATE')) return 'primary'
    return 'primary'
  }

  const allActions = ['LOGIN', 'LOGOUT', 'CREATE_USER', 'DELETE_USER', 'UPDATE_USER', 'SIGN_DOCUMENT', 'CREATE_DOCUMENT', 'CREATE_ASSIGNMENT', 'UPDATE_ASSIGNMENT']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Audit Log</h2>
        <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : '⬇ Export as CSV'}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#fafafa' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 'bold' }}>Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-light)' }}>
              Action
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <option value="">All Actions</option>
              {allActions.map((action) => (
                <option key={action} value={action}>
                  {action.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-light)' }}>
              From Date
            </label>
            <input
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-light)' }}>
              To Date
            </label>
            <input
              type="date"
              value={filterToDate}
              onChange={(e) => setFilterToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={handleApplyFilters} style={{ fontSize: '12px', padding: '8px 12px' }}>
            Apply Filters
          </button>
          <button className="btn btn-secondary" onClick={handleResetFilters} style={{ fontSize: '12px', padding: '8px 12px' }}>
            Reset
          </button>
        </div>
      </div>

      {/* Results */}
      {logs.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)' }}>No audit log entries found.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <small style={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </small>
                    </td>
                    <td>
                      <div className="list-item-title">{log.userName || 'System'}</div>
                      <div className="list-item-subtitle">{log.userEmail || 'N/A'}</div>
                    </td>
                    <td>
                      <Badge status={getActionBadgeStatus(log.action)}>
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td>
                      <small style={{ color: 'var(--text-light)' }}>
                        {log.entityType || '—'} {log.entityId ? `(${log.entityId.substring(0, 8)}...)` : ''}
                      </small>
                    </td>
                    <td>
                      <small style={{ color: 'var(--text-light)' }}>{log.ipAddress || 'Unknown'}</small>
                    </td>
                    <td>
                      {log.metadata && (
                        <small style={{ color: 'var(--text-light)', fontFamily: 'monospace' }}>
                          {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata).substring(0, 50)}...
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
            <small style={{ color: 'var(--text-light)' }}>
              Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} entries
            </small>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handlePreviousPage}
                disabled={pagination.offset === 0}
                style={{
                  padding: '6px 12px',
                  backgroundColor: pagination.offset === 0 ? '#e0e0e0' : 'var(--blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pagination.offset === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!pagination.hasMore}
                style={{
                  padding: '6px 12px',
                  backgroundColor: !pagination.hasMore ? '#e0e0e0' : 'var(--blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !pagination.hasMore ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
