import { useState, useEffect } from 'react'
import { assignmentsApi, auditApi, reportsApi, sectionsApi, customersApi } from '../api'
import { Badge } from '../components/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  read: 'Read',
  signed: 'Signed',
  overdue: 'Overdue',
}

export function ComplianceDashboard() {
  const [assignments, setAssignments] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [sections, setSections] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [checkingOverdue, setCheckingOverdue] = useState(false)

  // General report state
  const [reportSectionId, setReportSectionId] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // Customer report state
  const [reportCustomerId, setReportCustomerId] = useState('')
  const [generatingCustomerReport, setGeneratingCustomerReport] = useState(false)
  const [customerReportError, setCustomerReportError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [assignmentsData, statsData, sectionsData, customersData] = await Promise.all([
        assignmentsApi.list(),
        auditApi.stats(),
        sectionsApi.list(),
        customersApi.list().catch(() => [] as any[]),
      ])
      setAssignments(assignmentsData)
      setStats(statsData)
      setSections(sectionsData)
      setCustomers(customersData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateCustomerReport = async () => {
    if (!reportCustomerId) return
    setGeneratingCustomerReport(true)
    setCustomerReportError(null)
    try {
      const blob = await reportsApi.downloadCustomerReport(reportCustomerId)
      const customer = customers.find((c) => c.id === reportCustomerId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `customer-report-${(customer?.name || 'customer').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setCustomerReportError(err.message || 'Failed to generate report')
    } finally {
      setGeneratingCustomerReport(false)
    }
  }

  const handleGenerateReport = async () => {
    setGeneratingReport(true)
    setReportError(null)
    try {
      const params: { sectionId?: string; from?: string; to?: string } = {}
      if (reportSectionId) params.sectionId = reportSectionId
      if (reportFrom) params.from = reportFrom
      if (reportTo) params.to = reportTo
      const blob = await reportsApi.downloadComplianceReport(params)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dateStr = new Date().toISOString().split('T')[0]
      a.download = `compliance-report-${dateStr}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate report')
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleCheckOverdue = async () => {
    try {
      setError(null)
      setCheckingOverdue(true)
      const result = await assignmentsApi.checkOverdue()
      setSuccess(`Updated ${result.count} assignments to overdue`)
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCheckingOverdue(false)
    }
  }

  if (loading) return <div className="loading">Loading compliance data...</div>
  if (error) return <div className="error">{error}</div>

  const totalAssignments = assignments.length
  const completedAssignments = assignments.filter((a) => a.status === 'signed').length
  const complianceRate = totalAssignments > 0 ? ((completedAssignments / totalAssignments) * 100).toFixed(1) : '0'
  const pendingAssignments = assignments.filter((a) => a.status === 'pending').length
  const overdueAssignments = assignments.filter((a) => {
    if (!a.deadline) return false
    return new Date(a.deadline) < new Date() && a.status !== 'signed'
  }).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Compliance Dashboard</h2>
        <button className="btn btn-primary" onClick={handleCheckOverdue} disabled={checkingOverdue}>
          {checkingOverdue ? 'Checking...' : 'Check Overdue'}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: '16px' }}>{success}</div>}

      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-label">Total Assignments</div>
          <div className="stat-value">{totalAssignments}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Compliance Rate</div>
          <div className="stat-value">{complianceRate}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Signed Documents</div>
          <div className="stat-value">{completedAssignments}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>
            {pendingAssignments}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {overdueAssignments}
          </div>
        </div>
      </div>

      {/* Compliance Report Generator */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '4px' }}>Generate Compliance Report</h3>
        <p style={{ color: 'var(--text-light)', fontSize: '13px', marginBottom: '16px' }}>
          Export a formal PDF compliance report for audits, management review, or regulatory submissions.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Section (optional)</label>
            <select value={reportSectionId} onChange={(e) => setReportSectionId(e.target.value)}>
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>From date</label>
            <input
              type="date"
              value={reportFrom}
              onChange={(e) => setReportFrom(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>To date</label>
            <input
              type="date"
              value={reportTo}
              onChange={(e) => setReportTo(e.target.value)}
            />
          </div>
        </div>

        {reportError && <div className="error" style={{ marginBottom: '12px' }}>{reportError}</div>}

        <button
          className="btn btn-primary"
          onClick={handleGenerateReport}
          disabled={generatingReport}
        >
          {generatingReport ? 'Generating PDF…' : '⬇ Download Compliance Report'}
        </button>
      </div>

      {/* Customer Compliance Report */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '4px' }}>Customer Compliance Report</h3>
        <p style={{ color: 'var(--text-light)', fontSize: '13px', marginBottom: '16px' }}>
          Export a PDF report showing all documents and signing statuses for a specific customer.
        </p>

        {customers.length === 0 ? (
          <p style={{ color: 'var(--text-light)', fontSize: '13px', margin: 0 }}>
            No customers defined. Go to <strong>Management → Customers</strong> to add customers and link them to documents.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
                <label>Customer</label>
                <select value={reportCustomerId} onChange={(e) => setReportCustomerId(e.target.value)}>
                  <option value="">— Select a customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.documentCount > 0 ? ` (${c.documentCount} docs)` : ' — no docs'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {customerReportError && <div className="error" style={{ marginBottom: '12px' }}>{customerReportError}</div>}

            <button
              className="btn btn-primary"
              onClick={handleGenerateCustomerReport}
              disabled={generatingCustomerReport || !reportCustomerId}
            >
              {generatingCustomerReport ? 'Generating PDF…' : '⬇ Download Customer Report'}
            </button>
          </>
        )}
      </div>

      {stats && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>System Statistics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '4px' }}>
                Total Login Events
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--navy)' }}>
                {stats.totalLogins}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '4px' }}>
                Total Sign Events
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--navy)' }}>
                {stats.totalSignings}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '4px' }}>
                Total Reading Completions
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--navy)' }}>
                {stats.totalReadings}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '4px' }}>
                Total Audit Events
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--navy)' }}>
                {stats.totalEvents}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>Pending Assignments</h3>
        {assignments.filter((a) => a.status !== 'signed').length === 0 ? (
          <p style={{ color: 'var(--text-light)' }}>All assignments completed!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {assignments
                .filter((a) => a.status !== 'signed')
                .sort((a, b) => {
                  if (a.deadline && b.deadline) {
                    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
                  }
                  return 0
                })
                .map((assignment) => {
                  const isOverdue = assignment.deadline && new Date(assignment.deadline) < new Date()
                  return (
                    <tr key={assignment.id} style={{ backgroundColor: isOverdue ? '#fff5f5' : undefined }}>
                      <td>
                        <div className="list-item-title">{assignment.documentTitle}</div>
                        <div className="list-item-subtitle">{assignment.documentNumber}</div>
                      </td>
                      <td>{assignment.assignedTo || '—'}</td>
                      <td>
                        <Badge
                          status={
                            isOverdue ? 'danger'
                            : assignment.status === 'signed' ? 'success'
                            : assignment.status === 'read' ? 'primary'
                            : assignment.status === 'in_progress' ? 'warning'
                            : 'secondary'
                          }
                        >
                          {isOverdue ? 'Overdue' : (STATUS_LABELS[assignment.status] ?? assignment.status)}
                        </Badge>
                      </td>
                      <td>
                        {assignment.scrollDepth != null && Number(assignment.scrollDepth) > 0 ? (
                          <div>
                            <div className="pdf-progress" style={{ marginBottom: '4px', width: '80px' }}>
                              <div
                                className="pdf-progress-bar"
                                style={{ width: `${Math.round(Number(assignment.scrollDepth))}%` }}
                              ></div>
                            </div>
                            <small style={{ color: 'var(--text-light)' }}>{Math.round(Number(assignment.scrollDepth))}%</small>
                          </div>
                        ) : (
                          <small style={{ color: 'var(--text-light)' }}>Not started</small>
                        )}
                      </td>
                      <td>
                        {assignment.deadline ? (
                          <span style={{ color: isOverdue ? 'var(--danger)' : 'var(--text)' }}>
                            {new Date(assignment.deadline).toLocaleDateString()}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
