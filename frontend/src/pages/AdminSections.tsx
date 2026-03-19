import { useState, useEffect } from 'react'
import { sectionsApi, usersApi, organisationsApi, documentOptionsApi } from '../api'

export function AdminSections() {
  const [sections, setSections] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Add section
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSection, setAddingSection] = useState(false)

  // Edit section
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Org branding
  const [orgName, setOrgName] = useState('')
  const [orgSubtitle, setOrgSubtitle] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)

  // Document option lists
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; value: string }>>([])
  const [issuerOptions, setIssuerOptions] = useState<Array<{ id: string; value: string }>>([])
  const [newCategory, setNewCategory] = useState('')
  const [newIssuer, setNewIssuer] = useState('')
  const [optionsSaving, setOptionsSaving] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [sectionsData, usersData, orgData, catOpts, issOpts] = await Promise.all([
          sectionsApi.list(),
          usersApi.list(),
          organisationsApi.getCurrent(),
          documentOptionsApi.list('category'),
          documentOptionsApi.list('issuer'),
        ])
        setSections(sectionsData)
        setUsers(usersData)
        setOrgName(orgData.name)
        setOrgSubtitle(orgData.subtitle ?? '')
        setCategoryOptions(catOpts.map((o) => ({ id: o.id, value: o.value })))
        setIssuerOptions(issOpts.map((o) => ({ id: o.id, value: o.value })))
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const getSectionUserCount = (sectionId: string) => {
    return users.filter((u) => u.sectionId === sectionId).length
  }

  // ── Org branding ──────────────────────────────────────────────────────────

  const handleSaveOrg = async () => {
    if (!orgName.trim()) {
      setOrgError('Organisation name is required')
      return
    }
    setOrgSaving(true)
    setOrgError(null)
    setOrgSuccess(false)
    try {
      await organisationsApi.updateCurrent({ name: orgName.trim(), subtitle: orgSubtitle.trim() })
      setOrgSuccess(true)
      setTimeout(() => setOrgSuccess(false), 3000)
    } catch (err: any) {
      setOrgError(err.message)
    } finally {
      setOrgSaving(false)
    }
  }

  // ── Document option lists ─────────────────────────────────────────────────

  const handleAddCategory = async () => {
    const val = newCategory.trim()
    if (!val) return
    if (categoryOptions.some((c) => c.value.toLowerCase() === val.toLowerCase())) {
      setOptionsError('Category already exists')
      return
    }
    setOptionsSaving(true)
    setOptionsError(null)
    try {
      const created = await documentOptionsApi.create('category', val)
      setCategoryOptions((prev) => [...prev, { id: created.id, value: created.value }].sort((a, b) => a.value.localeCompare(b.value)))
      setNewCategory('')
    } catch (err: any) {
      setOptionsError(err.message)
    } finally {
      setOptionsSaving(false)
    }
  }

  const handleAddIssuer = async () => {
    const val = newIssuer.trim()
    if (!val) return
    if (issuerOptions.some((i) => i.value.toLowerCase() === val.toLowerCase())) {
      setOptionsError('Issuer already exists')
      return
    }
    setOptionsSaving(true)
    setOptionsError(null)
    try {
      const created = await documentOptionsApi.create('issuer', val)
      setIssuerOptions((prev) => [...prev, { id: created.id, value: created.value }].sort((a, b) => a.value.localeCompare(b.value)))
      setNewIssuer('')
    } catch (err: any) {
      setOptionsError(err.message)
    } finally {
      setOptionsSaving(false)
    }
  }

  const handleDeleteOption = async (type: 'category' | 'issuer', id: string) => {
    setOptionsError(null)
    try {
      await documentOptionsApi.delete(id)
      if (type === 'category') {
        setCategoryOptions((prev) => prev.filter((c) => c.id !== id))
      } else {
        setIssuerOptions((prev) => prev.filter((i) => i.id !== id))
      }
    } catch (err: any) {
      setOptionsError(err.message)
    }
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newSectionName.trim()) {
      setError('Section name is required')
      return
    }

    try {
      setError(null)
      setAddingSection(true)
      const newSection = await sectionsApi.create(newSectionName)
      setSections([...sections, newSection])
      setNewSectionName('')
      setSuccess('Section created successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAddingSection(false)
    }
  }

  const handleStartEdit = (section: any) => {
    setEditingId(section.id)
    setEditingName(section.name)
  }

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      setError('Section name is required')
      return
    }

    try {
      setError(null)
      await sectionsApi.update(editingId!, editingName)
      setSections(sections.map((s) => (s.id === editingId ? { ...s, name: editingName } : s)))
      setEditingId(null)
      setEditingName('')
      setSuccess('Section updated successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleDeleteSection = async (sectionId: string, sectionName: string) => {
    const userCount = getSectionUserCount(sectionId)

    if (userCount > 0) {
      setError(`Cannot delete section "${sectionName}" with ${userCount} active users. Please reassign or deactivate users first.`)
      return
    }

    if (!window.confirm(`Are you sure you want to delete section "${sectionName}"? This cannot be undone.`)) {
      return
    }

    try {
      setError(null)
      await sectionsApi.delete(sectionId)
      setSections(sections.filter((s) => s.id !== sectionId))
      setSuccess('Section deleted successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  const tagStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: '20px', padding: '4px 10px 4px 12px',
    fontSize: '13px', color: 'var(--text)',
  }

  const tagDeleteBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '0 2px',
    fontWeight: 600,
  }

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>Organisation Settings</h2>

      {/* ── Organisation Branding ── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Organisation Identity</h3>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
          The name and subtitle displayed in the sidebar and header across the entire application.
        </p>
        {orgError && <div className="error" style={{ marginBottom: '12px' }}>{orgError}</div>}
        {orgSuccess && <div className="success" style={{ marginBottom: '12px' }}>✓ Organisation details saved</div>}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
            <label style={{ fontSize: '13px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>
              Organisation Name *
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Demo Aviation GH"
              disabled={orgSaving}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
            <label style={{ fontSize: '13px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>
              Subtitle <span style={{ fontWeight: 400 }}>(shown in header &amp; sidebar)</span>
            </label>
            <input
              type="text"
              value={orgSubtitle}
              onChange={(e) => setOrgSubtitle(e.target.value)}
              placeholder="e.g. Vienna Airport · Ground Handling"
              disabled={orgSaving}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSaveOrg}
            disabled={orgSaving}
            style={{ flexShrink: 0 }}
          >
            {orgSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Document Option Lists ── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '4px' }}>Document Lists</h3>
        <p style={{ marginTop: 0, marginBottom: '20px', fontSize: '14px', color: 'var(--text-light)' }}>
          Manage the dropdown options for document categories and issuers. These appear as suggestions when creating or editing documents.
        </p>
        {optionsError && <div className="error" style={{ marginBottom: '12px' }}>{optionsError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Categories */}
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Categories</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category…"
                disabled={optionsSaving}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-sm btn-primary" onClick={handleAddCategory} disabled={optionsSaving || !newCategory.trim()}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categoryOptions.length === 0 && (
                <span style={{ fontSize: '13px', color: 'var(--text-light)' }}>No categories yet.</span>
              )}
              {categoryOptions.map((c) => (
                <span key={c.id} style={tagStyle}>
                  {c.value}
                  <button
                    style={tagDeleteBtn}
                    title={`Remove "${c.value}"`}
                    onClick={() => handleDeleteOption('category', c.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Issuers */}
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Issuers</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={newIssuer}
                onChange={(e) => setNewIssuer(e.target.value)}
                placeholder="New issuer…"
                disabled={optionsSaving}
                onKeyDown={(e) => e.key === 'Enter' && handleAddIssuer()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-sm btn-primary" onClick={handleAddIssuer} disabled={optionsSaving || !newIssuer.trim()}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {issuerOptions.length === 0 && (
                <span style={{ fontSize: '13px', color: 'var(--text-light)' }}>No issuers yet.</span>
              )}
              {issuerOptions.map((i) => (
                <span key={i.id} style={tagStyle}>
                  {i.value}
                  <button
                    style={tagDeleteBtn}
                    title={`Remove "${i.value}"`}
                    onClick={() => handleDeleteOption('issuer', i.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: '16px' }}>{success}</div>}

      {/* ── Add Section Form ── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Add New Section</h3>
        <form
          onSubmit={handleAddSection}
          style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}
        >
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-light)' }}>
              Section Name
            </label>
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="e.g., Operations, Maintenance"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={addingSection}>
            {addingSection ? 'Adding...' : 'Add Section'}
          </button>
        </form>
      </div>

      {/* ── Sections Table ── */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Sections</h3>
        {sections.length === 0 ? (
          <p style={{ color: 'var(--text-light)' }}>No sections yet. Create your first section above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Section Name</th>
                <th>Users</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id}>
                  <td>
                    {editingId === section.id ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          style={{
                            padding: '4px 8px',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            fontSize: '14px',
                          }}
                        />
                      </div>
                    ) : (
                      <div className="list-item-title">{section.name}</div>
                    )}
                  </td>
                  <td>
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
                      {getSectionUserCount(section.id)}
                    </span>
                  </td>
                  <td>
                    <small style={{ color: 'var(--text-light)' }}>
                      {new Date(section.createdAt).toLocaleDateString()}
                    </small>
                  </td>
                  <td>
                    {editingId === section.id ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleSaveEdit}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: 'var(--green)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: 'var(--gray)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleStartEdit(section)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--blue)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSection(section.id, section.name)}
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
                          🗑️ Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
