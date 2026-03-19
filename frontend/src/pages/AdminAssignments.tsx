import { useState, useEffect } from 'react'
import { assignmentsApi, documentsApi, usersApi, groupsApi } from '../api'
import { Badge } from '../components/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  read: 'Read',
  signed: 'Signed',
  overdue: 'Overdue',
}

export function AdminAssignments() {
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [assignTarget, setAssignTarget] = useState<'users' | 'groups'>('users')
  const [createSearch, setCreateSearch] = useState('')
  const [deadline, setDeadline] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // Row actions
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      setLoading(true)
      setError(null)
      const [assignData, docData, userData, groupData] = await Promise.all([
        assignmentsApi.list(),
        documentsApi.list(),
        usersApi.list(),
        groupsApi.list(),
      ])
      setAssignments(assignData)
      setDocuments(docData.filter((d: any) => d.latestVersionId))
      setUsers(userData.filter((u: any) => u.role === 'user' || u.role === 'section_admin'))
      setGroups(groupData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetCreateForm = () => {
    setSelectedVersionId('')
    setSelectedUsers([])
    setSelectedGroups([])
    setAssignTarget('users')
    setCreateSearch('')
    setDeadline('')
    setCreateError(null)
    setCreateSuccess(null)
  }

  const handleCreateAssignment = async () => {
    if (!selectedVersionId) {
      setCreateError('Please select a document')
      return
    }
    if (assignTarget === 'users' && selectedUsers.length === 0) {
      setCreateError('Select at least one user')
      return
    }
    if (assignTarget === 'groups' && selectedGroups.length === 0) {
      setCreateError('Select at least one group')
      return
    }

    setCreateLoading(true)
    setCreateError(null)
    setCreateSuccess(null)
    try {
      const result = await assignmentsApi.create(
        selectedVersionId,
        assignTarget === 'users' ? selectedUsers : [],
        assignTarget === 'groups' ? selectedGroups : [],
        deadline || undefined,
      )
      setCreateSuccess(`Created ${result.created} assignment(s) successfully`)
      setTimeout(() => {
        setShowCreateModal(false)
        resetCreateForm()
        loadAll()
      }, 1200)
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleRemind = async (assignmentId: string) => {
    setRemindingId(assignmentId)
    try {
      await assignmentsApi.remind(assignmentId)
      alert('Reminder sent to user')
    } catch (err: any) {
      alert(`Failed to send reminder: ${err.message}`)
    } finally {
      setRemindingId(null)
    }
  }

  const handleDelete = async (assignmentId: string) => {
    if (!window.confirm('Remove this assignment? This cannot be undone.')) return
    setDeletingId(assignmentId)
    try {
      await assignmentsApi.delete(assignmentId)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
    } catch (err: any) {
      alert(`Failed to remove assignment: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = assignments.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      return (
        a.documentTitle?.toLowerCase().includes(q) ||
        a.assignedTo?.toLowerCase().includes(q) ||
        a.documentNumber?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const statusCounts = {
    total: assignments.length,
    pending: assignments.filter((a) => a.status === 'pending').length,
    signed: assignments.filter((a) => a.status === 'signed').length,
    overdue: assignments.filter((a) => a.status === 'overdue').length,
  }

  // Precompute modal derived values
  const isUsers = assignTarget === 'users'
  const cq = createSearch.toLowerCase()
  const filteredUsers = users.filter((u: any) =>
    !cq || u.name.toLowerCase().includes(cq) || u.email.toLowerCase().includes(cq)
  )
  const filteredGroups = groups.filter((g: any) =>
    !cq || g.name.toLowerCase().includes(cq)
  )
  const allUsersSelected = filteredUsers.length > 0 && filteredUsers.every((u: any) => selectedUsers.includes(u.id))
  const allGroupsSelected = filteredGroups.length > 0 && filteredGroups.every((g: any) => selectedGroups.includes(g.id))
  const selCount = isUsers ? selectedUsers.length : selectedGroups.length
  const canSubmit = !createLoading && !createSuccess && !!selectedVersionId && selCount > 0

  if (loading) return <div className="loading">Loading assignments…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Assignments</h2>
        <button
          className="btn btn-primary"
          onClick={() => { resetCreateForm(); setShowCreateModal(true) }}
        >
          + Create Assignment
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Stats */}
      <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{statusCounts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{statusCounts.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Signed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{statusCounts.signed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{statusCounts.overdue}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search document or user…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: '160px' }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ flex: '0 0 160px' }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="read">Read</option>
            <option value="signed">Signed</option>
            <option value="overdue">Overdue</option>
          </select>
          {(filterSearch || filterStatus) && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => { setFilterSearch(''); setFilterStatus('') }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '24px' }}>
            {assignments.length === 0
              ? 'No assignments yet. Click "+ Create Assignment" to get started.'
              : 'No assignments match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Deadline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((assignment) => {
                const isOverdue =
                  assignment.deadline &&
                  new Date(assignment.deadline) < new Date() &&
                  assignment.status !== 'signed'
                return (
                  <tr key={assignment.id} style={{ backgroundColor: isOverdue ? '#fff5f5' : undefined }}>
                    <td>
                      <div className="list-item-title">{assignment.documentTitle}</div>
                      <div className="list-item-subtitle">
                        {assignment.documentNumber}
                        {assignment.versionNumber ? ` · v${assignment.versionNumber}` : ''}
                      </div>
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
                      {assignment.scrollDepth != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '3px', width: '60px' }}>
                            <div
                              style={{
                                background: 'var(--primary)',
                                height: '100%',
                                width: `${Math.round(assignment.scrollDepth)}%`,
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                          <small style={{ color: 'var(--text-light)' }}>{Math.round(assignment.scrollDepth)}%</small>
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
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {assignment.status !== 'signed' && (
                          <button
                            className="btn btn-xs btn-secondary"
                            onClick={() => handleRemind(assignment.id)}
                            disabled={remindingId === assignment.id}
                            title="Send reminder"
                          >
                            {remindingId === assignment.id ? '…' : 'Remind'}
                          </button>
                        )}
                        <button
                          className="btn btn-xs btn-danger"
                          onClick={() => handleDelete(assignment.id)}
                          disabled={deletingId === assignment.id}
                        >
                          {deletingId === assignment.id ? '…' : '✕'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-light)' }}>
            Showing {filtered.length} of {assignments.length} assignments
          </div>
        </div>
      )}

      {/* ── Create Assignment Modal ── */}
      {showCreateModal && (
        <div className="modal" onClick={() => { setShowCreateModal(false); resetCreateForm() }}>
          <div
            className="modal-content"
            style={{ maxWidth: '600px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Create Assignment</h2>
                <button className="modal-close" onClick={() => { setShowCreateModal(false); resetCreateForm() }}>×</button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {createError && <div className="error" style={{ marginBottom: '14px' }}>{createError}</div>}
              {createSuccess && <div className="success" style={{ marginBottom: '14px' }}>{createSuccess}</div>}

              {/* Document selector */}
              <div className="form-group">
                <label>Document <span style={{ color: 'var(--danger)' }}>*</span></label>
                {documents.length === 0 ? (
                  <p style={{ color: 'var(--text-light)', fontSize: '14px', margin: '4px 0' }}>
                    No published documents available. Publish a document version first.
                  </p>
                ) : (
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    disabled={createLoading}
                  >
                    <option value="">Select a document…</option>
                    {documents.map((doc: any) => (
                      <option key={doc.latestVersionId} value={doc.latestVersionId}>
                        {doc.title}{doc.docNumber ? ` [${doc.docNumber}]` : ''} — v{doc.latestVersion}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Segmented control: Users / Groups */}
              <div className="form-group">
                <label>Assign to</label>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => { setAssignTarget('users'); setSelectedGroups([]); setCreateSearch('') }}
                    style={{
                      padding: '8px 20px', border: 'none', borderRight: '1px solid var(--border)',
                      cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit',
                      background: isUsers ? 'var(--primary)' : 'var(--surface)',
                      color: isUsers ? '#fff' : 'var(--text)',
                      fontWeight: isUsers ? 700 : 400,
                    }}
                  >
                    Users{users.length > 0 ? ` (${users.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAssignTarget('groups'); setSelectedUsers([]); setCreateSearch('') }}
                    style={{
                      padding: '8px 20px', border: 'none',
                      cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit',
                      background: !isUsers ? 'var(--primary)' : 'var(--surface)',
                      color: !isUsers ? '#fff' : 'var(--text)',
                      fontWeight: !isUsers ? 700 : 400,
                    }}
                  >
                    Groups{groups.length > 0 ? ` (${groups.length})` : ''}
                  </button>
                </div>
              </div>

              {/* Search + Select all */}
              <div className="form-group">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder={isUsers ? 'Search by name or email…' : 'Search groups…'}
                    value={createSearch}
                    onChange={(e) => setCreateSearch(e.target.value)}
                    style={{ flex: 1 }}
                    disabled={createLoading}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    disabled={createLoading}
                    onClick={() => {
                      if (isUsers) {
                        if (allUsersSelected) {
                          const removing = new Set(filteredUsers.map((u: any) => u.id))
                          setSelectedUsers(selectedUsers.filter((id) => !removing.has(id)))
                        } else {
                          const adding = filteredUsers.map((u: any) => u.id).filter((id: string) => !selectedUsers.includes(id))
                          setSelectedUsers([...selectedUsers, ...adding])
                        }
                      } else {
                        if (allGroupsSelected) {
                          const removing = new Set(filteredGroups.map((g: any) => g.id))
                          setSelectedGroups(selectedGroups.filter((id) => !removing.has(id)))
                        } else {
                          const adding = filteredGroups.map((g: any) => g.id).filter((id: string) => !selectedGroups.includes(id))
                          setSelectedGroups([...selectedGroups, ...adding])
                        }
                      }
                    }}
                  >
                    {isUsers
                      ? (allUsersSelected ? 'Deselect all' : 'Select all')
                      : (allGroupsSelected ? 'Deselect all' : 'Select all')}
                  </button>
                </div>
                {selCount > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                    {selCount} {isUsers ? `user${selCount !== 1 ? 's' : ''}` : `group${selCount !== 1 ? 's' : ''}`} selected
                  </div>
                )}
              </div>

              {/* Scrollable list */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: '260px', overflowY: 'auto' }}>
                {isUsers ? (
                  filteredUsers.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)', fontSize: '13px' }}>
                      {createSearch ? 'No users match your search.' : 'No users available.'}
                    </div>
                  ) : filteredUsers.map((u: any) => {
                    const checked = selectedUsers.includes(u.id)
                    return (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          background: checked ? 'var(--primary-xlight)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={createLoading}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUsers([...selectedUsers, u.id])
                            else setSelectedUsers(selectedUsers.filter((id) => id !== u.id))
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text)' }}>{u.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                            {u.email}{u.sectionName ? ` · ${u.sectionName}` : ''}
                          </div>
                        </div>
                      </label>
                    )
                  })
                ) : (
                  filteredGroups.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)', fontSize: '13px' }}>
                      {createSearch ? 'No groups match your search.' : 'No groups available.'}
                    </div>
                  ) : filteredGroups.map((g: any) => {
                    const checked = selectedGroups.includes(g.id)
                    return (
                      <label
                        key={g.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          background: checked ? 'var(--primary-xlight)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={createLoading}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedGroups([...selectedGroups, g.id])
                            else setSelectedGroups(selectedGroups.filter((id) => id !== g.id))
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text)' }}>{g.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                            {g.memberCount ?? 0} member{(g.memberCount ?? 0) !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>

              {/* Deadline */}
              <div className="form-group" style={{ marginTop: '18px' }}>
                <label>
                  Deadline{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>(optional)</span>
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={createLoading}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, background: 'var(--bg)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowCreateModal(false); resetCreateForm() }}
                disabled={createLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateAssignment}
                disabled={!canSubmit}
              >
                {createLoading
                  ? 'Creating…'
                  : selCount > 0
                    ? `Assign to ${selCount} ${isUsers ? `User${selCount !== 1 ? 's' : ''}` : `Group${selCount !== 1 ? 's' : ''}`}`
                    : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
