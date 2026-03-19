import { useState, useEffect } from 'react'
import { usersApi, sectionsApi, groupsApi } from '../api'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { useAuth } from '../auth'

export function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState('user')
  const [createSectionId, setCreateSectionId] = useState('')
  const [createEmployeeNumber, setCreateEmployeeNumber] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Create group modal
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [createGroupName, setCreateGroupName] = useState('')
  const [createGroupSectionId, setCreateGroupSectionId] = useState('')
  const [createGroupLoading, setCreateGroupLoading] = useState(false)
  const [createGroupError, setCreateGroupError] = useState<string | null>(null)

  // Expand group
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [groupMembers, setGroupMembers] = useState<{ [key: string]: any[] }>({})

  // Add member modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [addMemberLoading, setAddMemberLoading] = useState(false)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users')

  // User table filter state
  const [userSearch, setUserSearch] = useState('')
  const [userFilterRole, setUserFilterRole] = useState<'all' | 'user' | 'section_admin' | 'super_admin'>('all')
  const [userFilterStatus, setUserFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [usersData, sectionsData, groupsData] = await Promise.all([
        usersApi.list(),
        sectionsApi.list(),
        groupsApi.list(),
      ])
      setUsers(usersData)
      setSections(sectionsData)
      setGroups(groupsData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!createEmail || !createPassword || !createName) {
      setCreateError('Email, password, and name are required')
      return
    }

    setCreateLoading(true)
    setCreateError(null)

    try {
      await usersApi.create(createEmail, createPassword, createName, createRole, createSectionId || undefined, createEmployeeNumber || undefined)
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setCreateRole('user')
      setCreateSectionId('')
      setCreateEmployeeNumber('')
      setShowCreateModal(false)
      setSuccess('User created successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDeactivateUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Deactivate user "${userName}"? They will not be able to log in.`)) {
      return
    }

    try {
      setError(null)
      await usersApi.deactivate(userId)
      setSuccess('User deactivated successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleCreateGroup = async () => {
    if (!createGroupName.trim()) {
      setCreateGroupError('Group name is required')
      return
    }

    setCreateGroupLoading(true)
    setCreateGroupError(null)

    try {
      await groupsApi.create(createGroupName, createGroupSectionId || '')
      setCreateGroupName('')
      setCreateGroupSectionId('')
      setShowCreateGroupModal(false)
      setSuccess('Group created successfully')
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
    } catch (err: any) {
      setCreateGroupError(err.message)
    } finally {
      setCreateGroupLoading(false)
    }
  }

  const handleExpandGroup = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null)
    } else {
      setExpandedGroupId(groupId)
      // Fetch members from the users list (filtered by group membership)
      const members = users.filter((u) => groupMembers[groupId]?.some((m) => m.id === u.id))
      if (members.length === 0 && !groupMembers[groupId]) {
        // Load all users as potential members
        setGroupMembers({ ...groupMembers, [groupId]: [] })
      }
    }
  }

  const handleAddMember = async () => {
    if (!selectedGroupId || !selectedUserId) {
      setAddMemberError('Please select a user')
      return
    }

    setAddMemberLoading(true)
    setAddMemberError(null)

    try {
      await groupsApi.addMember(selectedGroupId, selectedUserId)
      setSelectedUserId('')
      setShowAddMemberModal(false)
      setSuccess('Member added to group')
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
      setGroupMembers({})
    } catch (err: any) {
      setAddMemberError(err.message)
    } finally {
      setAddMemberLoading(false)
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!window.confirm('Remove this member from the group?')) {
      return
    }

    try {
      setError(null)
      await groupsApi.removeMember(groupId, userId)
      setSuccess('Member removed from group')
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
      setGroupMembers({})
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading">Loading users and groups...</div>

  // Filtered users
  const filteredUsers = users.filter((u) => {
    if (userSearch) {
      const q = userSearch.toLowerCase()
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q) && !u.employeeNumber?.toLowerCase().includes(q)) return false
    }
    if (userFilterRole !== 'all' && u.role !== userFilterRole) return false
    if (userFilterStatus === 'active' && !u.active) return false
    if (userFilterStatus === 'inactive' && u.active) return false
    return true
  })

  const uFilterStyle = {
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'white',
    cursor: 'pointer',
  }

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>Users & Groups Management</h2>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: '16px' }}>{success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 16px',
            border: 'none',
            backgroundColor: activeTab === 'users' ? 'var(--blue)' : 'transparent',
            color: activeTab === 'users' ? 'white' : 'var(--text-light)',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            fontWeight: activeTab === 'users' ? 'bold' : 'normal',
          }}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          style={{
            padding: '12px 16px',
            border: 'none',
            backgroundColor: activeTab === 'groups' ? 'var(--blue)' : 'transparent',
            color: activeTab === 'groups' ? 'white' : 'var(--text-light)',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            fontWeight: activeTab === 'groups' ? 'bold' : 'normal',
          }}
        >
          Groups
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Create User
            </button>
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search name, email, employee#…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ ...uFilterStyle, minWidth: '200px', flex: 1 }}
            />
            <select value={userFilterRole} onChange={(e) => setUserFilterRole(e.target.value as any)} style={uFilterStyle}>
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="section_admin">Section Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <select value={userFilterStatus} onChange={(e) => setUserFilterStatus(e.target.value as any)} style={uFilterStyle}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {(userSearch || userFilterRole !== 'all' || userFilterStatus !== 'all') && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setUserSearch(''); setUserFilterRole('all'); setUserFilterStatus('all') }}
              >
                Clear filters
              </button>
            )}
            <span style={{ fontSize: '13px', color: 'var(--text-light)', marginLeft: 'auto' }}>
              {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
            </span>
          </div>

          {users.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--text-light)' }}>No users yet.</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--text-light)' }}>No users match the current filters.</p>
            </div>
          ) : (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Section</th>
                    <th>Employee #</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="list-item-title">{user.name}</div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <Badge status={user.role}>{user.role === 'super_admin' ? 'Super Admin' : user.role === 'section_admin' ? 'Section Admin' : 'User'}</Badge>
                      </td>
                      <td>
                        {user.sectionId ? sections.find((s) => s.id === user.sectionId)?.name || 'Unknown' : '—'}
                      </td>
                      <td>{user.employeeNumber || '—'}</td>
                      <td>
                        {user.active ? (
                          <Badge status="success">Active</Badge>
                        ) : (
                          <Badge status="danger">Inactive</Badge>
                        )}
                      </td>
                      <td>
                        {user.active && user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeactivateUser(user.id, user.name)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'var(--red)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px' }}>
            <button className="btn btn-primary" onClick={() => setShowCreateGroupModal(true)}>
              Create Group
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--text-light)' }}>No groups yet.</p>
            </div>
          ) : (
            <div className="card">
              {groups.map((group) => (
                <div key={group.id} style={{ marginBottom: '16px', padding: '12px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  <div
                    onClick={() => handleExpandGroup(group.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      padding: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{group.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                        {group.sectionName && `Section: ${group.sectionName}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          backgroundColor: 'var(--blue)',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {group.memberCount} members
                      </span>
                      <span style={{ fontSize: '18px' }}>
                        {expandedGroupId === group.id ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {expandedGroupId === group.id && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <button
                        onClick={() => {
                          setSelectedGroupId(group.id)
                          setShowAddMemberModal(true)
                        }}
                        className="btn btn-secondary"
                        style={{ marginBottom: '12px' }}
                      >
                        + Add Member
                      </button>

                      {group.memberCount === 0 ? (
                        <p style={{ color: 'var(--text-light)', fontSize: '12px' }}>No members yet</p>
                      ) : (
                        <div>
                          {users
                            .slice(0, group.memberCount)
                            .map((member, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px',
                                  backgroundColor: '#f9f9f9',
                                  borderRadius: '4px',
                                  marginBottom: '4px',
                                  fontSize: '12px',
                                }}
                              >
                                <span>{member.name}</span>
                                <button
                                  onClick={() => handleRemoveMember(group.id, member.id)}
                                  style={{
                                    padding: '2px 6px',
                                    backgroundColor: 'var(--red)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setCreateError(null)
        }}
        title="Create User"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={createLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateUser} disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        }
      >
        {createError && <div className="error">{createError}</div>}
        <div className="form-group">
          <label>Email *</label>
          <input
            type="email"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Name *</label>
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Full name"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Password *</label>
          <input
            type="password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            placeholder="Temporary password"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Employee Number</label>
          <input
            type="text"
            value={createEmployeeNumber}
            onChange={(e) => setCreateEmployeeNumber(e.target.value)}
            placeholder="EMP-12345"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Section</label>
          <select value={createSectionId} onChange={(e) => setCreateSectionId(e.target.value)} disabled={createLoading}>
            <option value="">None</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Role *</label>
          <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} disabled={createLoading}>
            <option value="user">User</option>
            <option value="section_admin">Section Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
      </Modal>

      {/* Create Group Modal */}
      <Modal
        isOpen={showCreateGroupModal}
        onClose={() => {
          setShowCreateGroupModal(false)
          setCreateGroupError(null)
        }}
        title="Create Group"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreateGroupModal(false)}
              disabled={createGroupLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateGroup} disabled={createGroupLoading}>
              {createGroupLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        }
      >
        {createGroupError && <div className="error">{createGroupError}</div>}
        <div className="form-group">
          <label>Group Name *</label>
          <input
            type="text"
            value={createGroupName}
            onChange={(e) => setCreateGroupName(e.target.value)}
            placeholder="e.g., Maintenance Team"
            disabled={createGroupLoading}
          />
        </div>
        <div className="form-group">
          <label>Section</label>
          <select value={createGroupSectionId} onChange={(e) => setCreateGroupSectionId(e.target.value)} disabled={createGroupLoading}>
            <option value="">All Sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={showAddMemberModal}
        onClose={() => {
          setShowAddMemberModal(false)
          setSelectedGroupId(null)
          setSelectedUserId('')
          setAddMemberError(null)
        }}
        title="Add Member to Group"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowAddMemberModal(false)}
              disabled={addMemberLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAddMember} disabled={addMemberLoading}>
              {addMemberLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        }
      >
        {addMemberError && <div className="error">{addMemberError}</div>}
        <div className="form-group">
          <label>User *</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={addMemberLoading}
          >
            <option value="">Select a user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  )
}
