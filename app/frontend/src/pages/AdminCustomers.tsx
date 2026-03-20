import { useState, useEffect } from 'react'
import { customersApi, reportsApi } from '../api'
import { Modal } from '../components/Modal'
import { useAuth } from '../auth'

export function AdminCustomers() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<any>(null)   // null = create
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Report generation
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await customersApi.list()
      setCustomers(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditCustomer(null)
    setFormName('')
    setFormEmail('')
    setFormNotes('')
    setSaveError(null)
    setShowModal(true)
  }

  const openEdit = (c: any) => {
    setEditCustomer(c)
    setFormName(c.name)
    setFormEmail(c.contactEmail || '')
    setFormNotes(c.notes || '')
    setSaveError(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) { setSaveError('Name is required'); return }
    setSaving(true)
    setSaveError(null)
    try {
      if (editCustomer) {
        await customersApi.update(editCustomer.id, {
          name: formName.trim(),
          contactEmail: formEmail.trim() || undefined,
          notes: formNotes.trim() || undefined,
        })
      } else {
        await customersApi.create(
          formName.trim(),
          formEmail.trim() || undefined,
          formNotes.trim() || undefined,
        )
      }
      setShowModal(false)
      await load()
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await customersApi.delete(deleteTarget.id)
      setShowDeleteModal(false)
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleDownloadReport = async (customer: any) => {
    setGeneratingReport(customer.id)
    setReportError(null)
    try {
      const blob = await reportsApi.downloadCustomerReport(customer.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `customer-report-${customer.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contactEmail || '').toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) return <div className="loading">Loading customers…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Customers</h2>
        <button className="btn btn-primary" onClick={openCreate}>Add Customer</button>
      </div>

      {error && <div className="error">{error}</div>}
      {reportError && <div className="error" style={{ marginBottom: '12px' }}>{reportError}</div>}

      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', width: '280px' }}
        />
      </div>

      {customers.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)', margin: 0 }}>
            No customers yet. Click <strong>Add Customer</strong> to create one, then link documents to them from the Documents page.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)', margin: 0 }}>No customers match your search.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Customer Name</th>
                <th style={{ width: '25%' }}>Contact Email</th>
                <th style={{ width: '22%' }}>Notes</th>
                <th style={{ width: '8%', textAlign: 'center' }}>Docs</th>
                <th style={{ width: '17%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.name}</div>
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-light)' }}>
                    {c.contactEmail ? (
                      <a href={`mailto:${c.contactEmail}`} style={{ color: 'var(--primary)' }}>{c.contactEmail}</a>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-light)' }}>
                    {c.notes ? (
                      <span title={c.notes}>
                        {c.notes.length > 40 ? c.notes.slice(0, 40) + '…' : c.notes}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      background: c.documentCount > 0 ? '#e8f0fe' : '#f1f5f9',
                      color: c.documentCount > 0 ? '#1B3A5C' : '#94a3b8',
                      borderRadius: '12px',
                      padding: '2px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {c.documentCount}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleDownloadReport(c)}
                        disabled={generatingReport === c.id || c.documentCount === 0}
                        title={c.documentCount === 0 ? 'No documents linked to this customer' : 'Download compliance report'}
                      >
                        {generatingReport === c.id ? 'Generating…' : '📊 Report'}
                      </button>
                      {isSuperAdmin && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            setDeleteTarget(c)
                            setDeleteError(null)
                            setShowDeleteModal(true)
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setSaveError(null) }}
        title={editCustomer ? `Edit Customer: ${editCustomer.name}` : 'Add Customer'}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        }
      >
        {saveError && <div className="error">{saveError}</div>}
        <div className="form-group">
          <label>Customer Name <span style={{ color: 'red' }}>*</span></label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Lufthansa AG"
            disabled={saving}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
        <div className="form-group">
          <label>Contact Email</label>
          <input
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="contact@customer.com"
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Optional notes about this customer…"
            rows={3}
            disabled={saving}
            style={{ resize: 'vertical' }}
          />
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteError(null) }}
        title={`Delete Customer: ${deleteTarget?.name}`}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Customer'}
            </button>
          </div>
        }
      >
        {deleteError && <div className="error">{deleteError}</div>}
        <p>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <p style={{ color: 'var(--text-light)', fontSize: '14px', margin: 0 }}>
          This will only remove the customer record. Documents linked to this customer will be unlinked (their content is preserved).
        </p>
      </Modal>
    </div>
  )
}
