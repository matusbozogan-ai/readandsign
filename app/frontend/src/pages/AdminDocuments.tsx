import { useState, useEffect, Fragment } from 'react'
import { documentsApi, assignmentsApi, usersApi, groupsApi, customersApi, documentOptionsApi } from '../api'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { VersionDiff } from '../components/VersionDiff'
import { DocumentPreviewModal } from '../components/DocumentPreviewModal'
import { useAuth } from '../auth'

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: '📄',
  pptx: '📊',
  docx: '📝',
  xlsx: '📈',
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  pptx: 'PowerPoint',
  docx: 'Word',
  xlsx: 'Excel',
}

export function AdminDocuments() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [versionsByDocId, setVersionsByDocId] = useState<{ [key: string]: any[] }>({})
  const [loadingVersions, setLoadingVersions] = useState<{ [key: string]: boolean }>({})

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDocNumber, setCreateDocNumber] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createIssuer, setCreateIssuer] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [showNewVersionModal, setShowNewVersionModal] = useState(false)
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<any>(null)
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [versionRevision, setVersionRevision] = useState('')
  const [versionEffectiveDate, setVersionEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [versionPropagate, setVersionPropagate] = useState(true)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionError, setVersionError] = useState<string | null>(null)

  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishVersion, setPublishVersion] = useState<any>(null)
  const [publishPropagate, setPublishPropagate] = useState(true)
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false)
  const [assignmentVersion, setAssignmentVersion] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const [remindingAssignments, setRemindingAssignments] = useState(false)

  const [showDiffModal, setShowDiffModal] = useState(false)
  const [diffDoc, setDiffDoc] = useState<any>(null)

  // Delete state (super_admin only)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState<any>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Document Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{ id: string; title: string; versionNumber: number; fileType: string } | null>(null)

  // Document table filter state
  const [docSearch, setDocSearch] = useState('')
  const [docFilterStatus, setDocFilterStatus] = useState<'all' | 'draft' | 'published'>('all')
  const [docFilterSigned, setDocFilterSigned] = useState<'all' | 'none' | 'partial' | 'complete'>('all')
  const [docFilterCustomer, setDocFilterCustomer] = useState<string>('all')

  // Customers
  const [customers, setCustomers] = useState<any[]>([])

  // Managed category/issuer lists
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [issuerOptions, setIssuerOptions] = useState<string[]>([])

  // Assign customer to document state
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerDoc, setCustomerDoc] = useState<any>(null)
  const [customerDocSelected, setCustomerDocSelected] = useState<string>('')
  const [customerSaving, setCustomerSaving] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)

  // Signing Conditions state
  const [showConditionsModal, setShowConditionsModal] = useState(false)
  const [conditionsDoc, setConditionsDoc] = useState<any>(null)
  const [conditionType, setConditionType] = useState<'none' | 'time' | 'download' | 'time_and_download'>('time')
  const [conditionSeconds, setConditionSeconds] = useState(10)
  const [conditionsLoading, setConditionsLoading] = useState(false)
  const [conditionsError, setConditionsError] = useState<string | null>(null)
  const [conditionsSuccess, setConditionsSuccess] = useState(false)

  // Quick Assign state
  const [showQuickAssignModal, setShowQuickAssignModal] = useState(false)
  const [quickAssignDoc, setQuickAssignDoc] = useState<any>(null)
  const [qaUsers, setQaUsers] = useState<any[]>([])
  const [qaGroups, setQaGroups] = useState<any[]>([])
  const [qaSelectedUsers, setQaSelectedUsers] = useState<string[]>([])
  const [qaSelectedGroups, setQaSelectedGroups] = useState<string[]>([])
  const [qaAssignTarget, setQaAssignTarget] = useState<'users' | 'groups'>('users')
  const [qaDeadline, setQaDeadline] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [qaError, setQaError] = useState<string | null>(null)
  const [qaSuccess, setQaSuccess] = useState<string | null>(null)
  const [qaSearch, setQaSearch] = useState('')

  useEffect(() => {
    loadDocuments()
    customersApi.list().then(setCustomers).catch(() => {})
    documentOptionsApi.list('category')
      .then((opts) => setCategoryOptions(opts.map((o) => o.value)))
      .catch(() => {})
    documentOptionsApi.list('issuer')
      .then((opts) => setIssuerOptions(opts.map((o) => o.value)))
      .catch(() => {})
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const data = await documentsApi.list()
      setDocuments(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpandDocument = async (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null)
    } else {
      setExpandedDocId(docId)
      // Load versions if not cached
      if (!versionsByDocId[docId]) {
        await loadVersions(docId)
      }
    }
  }

  const loadVersions = async (docId: string) => {
    try {
      setLoadingVersions({ ...loadingVersions, [docId]: true })
      const data = await documentsApi.getVersions(docId)
      setVersionsByDocId({ ...versionsByDocId, [docId]: data })
    } catch (err: any) {
      console.error('Failed to load versions:', err)
    } finally {
      setLoadingVersions({ ...loadingVersions, [docId]: false })
    }
  }

  const handleCreateDocument = async () => {
    if (!createTitle) {
      setCreateError('Title is required')
      return
    }

    setCreateLoading(true)
    setCreateError(null)

    try {
      await documentsApi.create(createTitle, createDocNumber, createCategory, createIssuer)

      // Auto-save new category/issuer values to the managed lists
      if (createCategory && !categoryOptions.includes(createCategory)) {
        documentOptionsApi.create('category', createCategory)
          .then(() => setCategoryOptions((prev) => [...prev, createCategory].sort()))
          .catch(() => {})
      }
      if (createIssuer && !issuerOptions.includes(createIssuer)) {
        documentOptionsApi.create('issuer', createIssuer)
          .then(() => setIssuerOptions((prev) => [...prev, createIssuer].sort()))
          .catch(() => {})
      }

      setCreateTitle('')
      setCreateDocNumber('')
      setCreateCategory('')
      setCreateIssuer('')
      setShowCreateModal(false)
      await loadDocuments()
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreateLoading(false)
    }
  }

  const handlePublishVersion = async () => {
    if (!publishVersion) return

    setPublishLoading(true)
    setPublishError(null)

    try {
      await documentsApi.publish(publishVersion.documentId, publishVersion.versionNumber, publishPropagate)
      setTimeout(() => {
        setShowPublishModal(false)
        setPublishVersion(null)
        loadDocuments()
        if (expandedDocId === publishVersion.documentId) {
          loadVersions(publishVersion.documentId)
        }
      }, 1500)
    } catch (err: any) {
      setPublishError(err.message)
    } finally {
      setPublishLoading(false)
    }
  }

  const handleUploadAndPublish = async () => {
    if (!versionFile || !selectedDocForVersion) {
      setVersionError('File is required')
      return
    }

    setVersionLoading(true)
    setVersionError(null)

    try {
      // First upload to get version number
      const uploadResult = await documentsApi.upload(selectedDocForVersion.id, versionFile)

      // Then publish with propagation
      await documentsApi.publish(selectedDocForVersion.id, uploadResult.versionNumber, versionPropagate)

      setVersionFile(null)
      setVersionRevision('')
      setVersionEffectiveDate(new Date().toISOString().split('T')[0])
      setVersionPropagate(true)
      setShowNewVersionModal(false)
      setSelectedDocForVersion(null)

      await loadDocuments()
      if (expandedDocId === selectedDocForVersion.id) {
        await loadVersions(selectedDocForVersion.id)
      }
    } catch (err: any) {
      setVersionError(err.message)
    } finally {
      setVersionLoading(false)
    }
  }

  const handleLoadAssignments = async (version: any) => {
    try {
      setAssignmentsLoading(true)
      setAssignmentsError(null)
      const data = await documentsApi.getVersionAssignments(version.id)
      setAssignmentVersion(version)
      setAssignments(data)
      setShowAssignmentsModal(true)
    } catch (err: any) {
      setAssignmentsError(err.message)
    } finally {
      setAssignmentsLoading(false)
    }
  }

  const handleRemindPending = async () => {
    if (!assignmentVersion) return

    try {
      setRemindingAssignments(true)
      await assignmentsApi.remindPending(assignmentVersion.id)
      alert('Reminders sent successfully!')
    } catch (err: any) {
      setAssignmentsError(err.message)
    } finally {
      setRemindingAssignments(false)
    }
  }

  const handleDeleteDocument = async () => {
    if (!deleteDoc) return
    if (deleteConfirmText !== deleteDoc.title) {
      setDeleteError('Document title does not match. Please type it exactly.')
      return
    }
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await documentsApi.delete(deleteDoc.id)
      const deletedId = deleteDoc.id
      setShowDeleteModal(false)
      setDeleteDoc(null)
      setDeleteConfirmText('')
      // Remove document from local state immediately
      setDocuments((prev) => prev.filter((d) => d.id !== deletedId))
      // Clear expanded state if this doc was expanded
      if (expandedDocId === deletedId) setExpandedDocId(null)
      // Clear cached version data for the deleted document
      setVersionsByDocId((prev) => {
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
    } catch (err: any) {
      setDeleteError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleSaveCustomer = async () => {
    if (!customerDoc) return
    setCustomerSaving(true)
    setCustomerError(null)
    try {
      await documentsApi.update(customerDoc.id, { customerId: customerDocSelected || null })
      const chosen = customers.find((c) => c.id === customerDocSelected)
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === customerDoc.id
            ? { ...d, customerId: customerDocSelected || null, customerName: chosen?.name || null }
            : d,
        ),
      )
      setShowCustomerModal(false)
    } catch (err: any) {
      setCustomerError(err.message)
    } finally {
      setCustomerSaving(false)
    }
  }

  const openConditionsModal = (doc: any) => {
    setConditionsDoc(doc)
    setConditionType(doc.signingCondition || 'time')
    setConditionSeconds(doc.signingConditionSeconds ?? 10)
    setConditionsError(null)
    setConditionsSuccess(false)
    setShowConditionsModal(true)
  }

  const handleSaveConditions = async () => {
    if (!conditionsDoc) return
    setConditionsLoading(true)
    setConditionsError(null)
    setConditionsSuccess(false)
    try {
      await documentsApi.update(conditionsDoc.id, {
        signingCondition: conditionType,
        signingConditionSeconds: conditionSeconds,
      })
      setConditionsSuccess(true)
      // Update local state so table reflects change immediately
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === conditionsDoc.id
            ? { ...d, signingCondition: conditionType, signingConditionSeconds: conditionSeconds }
            : d,
        ),
      )
      setTimeout(() => {
        setShowConditionsModal(false)
        setConditionsDoc(null)
        setConditionsSuccess(false)
      }, 1200)
    } catch (err: any) {
      setConditionsError(err.message)
    } finally {
      setConditionsLoading(false)
    }
  }

  const openQuickAssign = async (doc: any) => {
    setQuickAssignDoc(doc)
    setQaSelectedUsers([])
    setQaSelectedGroups([])
    setQaAssignTarget('users')
    setQaDeadline('')
    setQaError(null)
    setQaSuccess(null)
    setQaSearch('')
    setQaLoading(true)
    try {
      const [userData, groupData] = await Promise.all([usersApi.list(), groupsApi.list()])
      setQaUsers(userData.filter((u: any) => u.role === 'user' || u.role === 'section_admin'))
      setQaGroups(groupData)
    } catch (err: any) {
      setQaError(err.message)
    } finally {
      setQaLoading(false)
    }
    setShowQuickAssignModal(true)
  }

  const handleQuickAssign = async () => {
    if (!quickAssignDoc?.latestVersionId) {
      setQaError('No published version to assign')
      return
    }
    if (qaAssignTarget === 'users' && qaSelectedUsers.length === 0) {
      setQaError('Select at least one user')
      return
    }
    if (qaAssignTarget === 'groups' && qaSelectedGroups.length === 0) {
      setQaError('Select at least one group')
      return
    }
    setQaLoading(true)
    setQaError(null)
    setQaSuccess(null)
    try {
      const result = await assignmentsApi.create(
        quickAssignDoc.latestVersionId,
        qaAssignTarget === 'users' ? qaSelectedUsers : [],
        qaAssignTarget === 'groups' ? qaSelectedGroups : [],
        qaDeadline || undefined,
      )
      setQaSuccess(`Created ${result.created} assignment(s) successfully`)
      const assignedDocId = quickAssignDoc?.id
      setTimeout(() => {
        setShowQuickAssignModal(false)
        setQuickAssignDoc(null)
        // Evict cached version data for this doc so assignment counts are fresh
        if (assignedDocId) {
          setVersionsByDocId(prev => {
            const next = { ...prev }
            delete next[assignedDocId]
            return next
          })
        }
        loadDocuments()
      }, 1200)
    } catch (err: any) {
      setQaError(err.message)
    } finally {
      setQaLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading documents...</div>

  // Precompute assign modal derived values (avoids IIFE pattern in JSX)
  const qaIsUsers = qaAssignTarget === 'users'
  const qaQ = qaSearch.toLowerCase()
  const qaFilteredUsers = qaUsers.filter((u: any) =>
    !qaQ || u.name.toLowerCase().includes(qaQ) || u.email.toLowerCase().includes(qaQ)
  )
  const qaFilteredGroups = qaGroups.filter((g: any) =>
    !qaQ || g.name.toLowerCase().includes(qaQ)
  )
  const qaAllUsersSelected = qaFilteredUsers.length > 0 && qaFilteredUsers.every((u: any) => qaSelectedUsers.includes(u.id))
  const qaAllGroupsSelected = qaFilteredGroups.length > 0 && qaFilteredGroups.every((g: any) => qaSelectedGroups.includes(g.id))
  const qaSelCount = qaIsUsers ? qaSelectedUsers.length : qaSelectedGroups.length
  const qaCanSubmit = !qaLoading && !qaSuccess && qaSelCount > 0

  // Filtered documents for table
  const filteredDocuments = documents.filter((doc) => {
    if (docSearch) {
      const q = docSearch.toLowerCase()
      if (
        !doc.title?.toLowerCase().includes(q) &&
        !doc.docNumber?.toLowerCase().includes(q) &&
        !doc.category?.toLowerCase().includes(q) &&
        !doc.issuer?.toLowerCase().includes(q)
      ) return false
    }
    if (docFilterStatus !== 'all' && doc.latestStatus !== docFilterStatus) return false
    if (docFilterSigned === 'none' && doc.signedPercent !== 0) return false
    if (docFilterSigned === 'partial' && (doc.signedPercent === 0 || doc.signedPercent === 100)) return false
    if (docFilterSigned === 'complete' && doc.signedPercent !== 100) return false
    if (docFilterCustomer === '__none__' && doc.customerId) return false
    if (docFilterCustomer !== 'all' && docFilterCustomer !== '__none__' && doc.customerId !== docFilterCustomer) return false
    return true
  })

  const filterSelectStyle = {
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'white',
    cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>Documents</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          Create Document
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search title, doc#, category, issuer…"
          value={docSearch}
          onChange={(e) => setDocSearch(e.target.value)}
          style={{ ...filterSelectStyle, minWidth: '220px', flex: 1 }}
        />
        <select value={docFilterStatus} onChange={(e) => setDocFilterStatus(e.target.value as any)} style={filterSelectStyle}>
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select value={docFilterSigned} onChange={(e) => setDocFilterSigned(e.target.value as any)} style={filterSelectStyle}>
          <option value="all">Any signed %</option>
          <option value="none">Not started (0%)</option>
          <option value="partial">Partially signed</option>
          <option value="complete">Fully signed (100%)</option>
        </select>
        <select value={docFilterCustomer} onChange={(e) => setDocFilterCustomer(e.target.value)} style={filterSelectStyle}>
          <option value="all">All customers</option>
          <option value="__none__">No customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(docSearch || docFilterStatus !== 'all' || docFilterSigned !== 'all' || docFilterCustomer !== 'all') && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setDocSearch(''); setDocFilterStatus('all'); setDocFilterSigned('all'); setDocFilterCustomer('all') }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: '13px', color: 'var(--text-light)', marginLeft: 'auto' }}>
          {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {documents.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)' }}>No documents yet.</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-light)' }}>No documents match the current filters.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Title</th>
                <th style={{ width: '8%' }}>Doc#</th>
                <th style={{ width: '9%' }}>Issuer</th>
                <th style={{ width: '9%' }}>Category</th>
                <th style={{ width: '10%' }}>Customer</th>
                <th style={{ width: '5%' }}>Ver.</th>
                <th style={{ width: '9%' }}>Status</th>
                <th style={{ width: '9%' }}>Signed %</th>
                <th style={{ width: '19%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <Fragment key={doc.id}>
                  <tr>
                    <td>
                      <div className="list-item-title">{doc.title}</div>
                    </td>
                    <td>{doc.docNumber || '—'}</td>
                    <td>{doc.issuer || '—'}</td>
                    <td>{doc.category || '—'}</td>
                    <td>
                      {doc.customerName ? (
                        <span style={{ display: 'inline-block', background: '#e8f0fe', color: '#1B3A5C', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', fontWeight: 500 }}>
                          {doc.customerName}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-light)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>{doc.latestVersion || 0}</td>
                    <td>
                      <Badge
                        status={
                          doc.latestStatus === 'published'
                            ? 'success'
                            : doc.latestStatus === 'draft'
                              ? 'secondary'
                              : 'primary'
                        }
                      >
                        {doc.latestStatus}
                      </Badge>
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{doc.signedPercent}%</span>
                        <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '3px', width: '60px', minWidth: '60px' }}>
                          <div
                            style={{
                              background: 'var(--success)',
                              height: '100%',
                              width: `${doc.signedPercent}%`,
                              borderRadius: '3px',
                              transition: 'width 0.2s',
                            }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => toggleExpandDocument(doc.id)}
                        >
                          {expandedDocId === doc.id ? 'Hide' : 'Details'}
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setSelectedDocForVersion(doc)
                            setShowNewVersionModal(true)
                          }}
                        >
                          New Version
                        </button>
                        {doc.latestVersionId && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => openQuickAssign(doc)}
                            title="Assign this document to users or groups"
                          >
                            Assign
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openConditionsModal(doc)}
                          title="Configure signing conditions for this document"
                        >
                          ⚙ Conditions
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            setCustomerDoc(doc)
                            setCustomerDocSelected(doc.customerId || '')
                            setCustomerError(null)
                            setShowCustomerModal(true)
                          }}
                          title="Assign this document to a customer"
                        >
                          🏢 Customer
                        </button>
                        {isSuperAdmin && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setDeleteDoc(doc)
                              setDeleteConfirmText('')
                              setDeleteError(null)
                              setShowDeleteModal(true)
                            }}
                            title="Permanently delete this document and all versions"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandedDocId === doc.id && (
                    <tr style={{ background: '#f9fafb' }}>
                      <td colSpan={8} style={{ padding: '16px' }}>
                        {loadingVersions[doc.id] ? (
                          <div style={{ color: 'var(--text-light)' }}>Loading versions...</div>
                        ) : versionsByDocId[doc.id]?.length === 0 ? (
                          <div style={{ color: 'var(--text-light)' }}>No versions yet.</div>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <h4 style={{ margin: 0 }}>Version History</h4>
                              {versionsByDocId[doc.id]?.filter((v: any) => v.status === 'published').length >= 2 && (
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => {
                                    setDiffDoc(doc)
                                    setShowDiffModal(true)
                                  }}
                                >
                                  ⇄ Compare Versions
                                </button>
                              )}
                            </div>
                            <table className="table" style={{ fontSize: '0.9em' }}>
                              <thead>
                                <tr>
                                  <th>Ver#</th>
                                  <th>Type</th>
                                  <th>Revision</th>
                                  <th>Effective Date</th>
                                  <th>Status</th>
                                  <th>Assigned</th>
                                  <th>Signed</th>
                                  <th>% Complete</th>
                                  <th>Published At</th>
                                  <th>File Hash</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {versionsByDocId[doc.id]?.map((v: any) => (
                                  <tr key={v.id}>
                                    <td>{v.versionNumber}</td>
                                    <td>
                                      <span title={FILE_TYPE_LABELS[v.fileType || 'pdf'] || (v.fileType || 'pdf').toUpperCase()}>
                                        {FILE_TYPE_ICONS[v.fileType || 'pdf'] || '📄'}{' '}
                                        <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                                          {(v.fileType || 'pdf').toUpperCase()}
                                        </span>
                                      </span>
                                    </td>
                                    <td>{v.revision || '—'}</td>
                                    <td>{v.effectiveDate ? new Date(v.effectiveDate).toLocaleDateString() : '—'}</td>
                                    <td>
                                      <Badge status={v.status === 'published' ? 'success' : 'secondary'}>
                                        {v.status}
                                      </Badge>
                                    </td>
                                    <td>{v.assignmentCount}</td>
                                    <td>{v.signedCount}</td>
                                    <td>
                                      <div
                                        style={{
                                          background: '#e2e8f0',
                                          height: '6px',
                                          borderRadius: '3px',
                                          width: '80px',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        <div
                                          style={{
                                            background: 'var(--success)',
                                            height: '100%',
                                            width: `${
                                              v.assignmentCount > 0
                                                ? Math.round((v.signedCount / v.assignmentCount) * 100)
                                                : 0
                                            }%`,
                                          }}
                                        ></div>
                                      </div>
                                    </td>
                                    <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '—'}</td>
                                    <td>
                                      <code
                                        style={{
                                          fontSize: '0.8em',
                                          background: '#f0f0f0',
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                        }}
                                        title={v.fileHash ?? 'No hash'}
                                        onClick={() => {
                                          navigator.clipboard.writeText(v.fileHash ?? '')
                                        }}
                                      >
                                        {v.fileHash?.substring(0, 8)}...
                                      </code>
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        <button
                                          className="btn btn-xs btn-secondary"
                                          title="Preview document"
                                          onClick={() => {
                                            setPreviewDoc({
                                              id: doc.id,
                                              title: doc.title,
                                              versionNumber: v.versionNumber,
                                              fileType: v.fileType || 'pdf',
                                            })
                                            setShowPreviewModal(true)
                                          }}
                                        >
                                          👁 View
                                        </button>
                                        {v.status === 'draft' ? (
                                          <button
                                            className="btn btn-xs btn-primary"
                                            onClick={() => {
                                              setPublishVersion({ ...v, documentId: doc.id })
                                              setPublishPropagate(v.versionNumber > 1)
                                              setShowPublishModal(true)
                                            }}
                                          >
                                            Publish
                                          </button>
                                        ) : (
                                          <button
                                            className="btn btn-xs btn-secondary"
                                            onClick={() => handleLoadAssignments(v)}
                                          >
                                            Assignments
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Document Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setCreateError(null)
        }}
        title="Create Document"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={createLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateDocument} disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        }
      >
        {createError && <div className="error">{createError}</div>}
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder="Document title"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Document Number</label>
          <input
            type="text"
            value={createDocNumber}
            onChange={(e) => setCreateDocNumber(e.target.value)}
            placeholder="e.g. DOC-001"
            disabled={createLoading}
          />
        </div>
        <div className="form-group">
          <label>Category</label>
          <input
            type="text"
            list="categoryList"
            value={createCategory}
            onChange={(e) => setCreateCategory(e.target.value)}
            placeholder="Select or type a category…"
            disabled={createLoading}
          />
          <datalist id="categoryList">
            {categoryOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="form-group">
          <label>Issuer</label>
          <input
            type="text"
            list="issuerList"
            value={createIssuer}
            onChange={(e) => setCreateIssuer(e.target.value)}
            placeholder="Select or type an issuer…"
            disabled={createLoading}
          />
          <datalist id="issuerList">
            {issuerOptions.map((i) => <option key={i} value={i} />)}
          </datalist>
        </div>
      </Modal>

      {/* Signing Conditions Modal */}
      <Modal
        isOpen={showConditionsModal}
        onClose={() => {
          setShowConditionsModal(false)
          setConditionsDoc(null)
          setConditionsError(null)
          setConditionsSuccess(false)
        }}
        title={`Signing Conditions: ${conditionsDoc?.title}`}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowConditionsModal(false)}
              disabled={conditionsLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveConditions} disabled={conditionsLoading || conditionsSuccess}>
              {conditionsLoading ? 'Saving...' : conditionsSuccess ? '✓ Saved' : 'Save Conditions'}
            </button>
          </div>
        }
      >
        {conditionsError && <div className="error">{conditionsError}</div>}
        {conditionsSuccess && <div className="success">✓ Signing conditions updated successfully</div>}
        <p style={{ marginTop: 0, color: 'var(--text-light)', fontSize: '14px' }}>
          Choose what users must do before they can sign this document.
        </p>
        <div className="form-group">
          <label>Signing condition</label>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as any)}
            disabled={conditionsLoading}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }}
          >
            <option value="none">No conditions — sign immediately</option>
            <option value="time">Minimum reading time (seconds)</option>
            <option value="download">Must download / open the file</option>
            <option value="time_and_download">Minimum reading time AND must download</option>
          </select>
        </div>
        {(conditionType === 'time' || conditionType === 'time_and_download') && (
          <div className="form-group">
            <label>Required reading time (seconds)</label>
            <input
              type="number"
              min={1}
              max={600}
              value={conditionSeconds}
              onChange={(e) => setConditionSeconds(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={conditionsLoading}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
              Users must spend at least {conditionSeconds}s on the document before the Sign button activates.
            </div>
          </div>
        )}
        {(conditionType === 'download' || conditionType === 'time_and_download') && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '12px', marginTop: '8px', fontSize: '13px' }}>
            <strong>📥 Download required</strong>
            <p style={{ margin: '6px 0 0', color: 'var(--text-light)' }}>
              Users must click the Download button on the document viewer before they can sign.
            </p>
          </div>
        )}
      </Modal>

      {/* Assign Customer Modal */}
      <Modal
        isOpen={showCustomerModal}
        onClose={() => { setShowCustomerModal(false); setCustomerError(null) }}
        title={`Assign Customer: ${customerDoc?.title}`}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setShowCustomerModal(false)} disabled={customerSaving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveCustomer} disabled={customerSaving}>
              {customerSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        {customerError && <div className="error">{customerError}</div>}
        <p style={{ marginTop: 0, color: 'var(--text-light)', fontSize: '14px' }}>
          Link this document to a customer. This lets you filter documents by customer and generate a Customer Compliance Report.
        </p>
        <div className="form-group">
          <label>Customer</label>
          <select
            value={customerDocSelected}
            onChange={(e) => setCustomerDocSelected(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }}
          >
            <option value="">— No customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {customers.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '8px' }}>
            No customers defined yet. Go to <strong>Management → Customers</strong> to add one.
          </div>
        )}
      </Modal>

      {/* New Version Modal */}
      <Modal
        isOpen={showNewVersionModal}
        onClose={() => {
          setShowNewVersionModal(false)
          setVersionFile(null)
          setVersionRevision('')
          setVersionEffectiveDate(new Date().toISOString().split('T')[0])
          setVersionPropagate(true)
          setVersionError(null)
          setSelectedDocForVersion(null)
        }}
        title={`New Version: ${selectedDocForVersion?.title}`}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowNewVersionModal(false)}
              disabled={versionLoading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUploadAndPublish}
              disabled={versionLoading || !versionFile}
            >
              {versionLoading ? 'Publishing...' : 'Upload & Publish'}
            </button>
          </div>
        }
      >
        {versionError && <div className="error">{versionError}</div>}
        <div className="form-group">
          <label>Document File *</label>
          <input
            type="file"
            accept=".pdf,.pptx,.docx,.xlsx"
            onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
            disabled={versionLoading}
          />
          <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
            Supported: PDF, PowerPoint (.pptx), Word (.docx), Excel (.xlsx)
          </div>
          {versionFile && (
            <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text)' }}>
              {FILE_TYPE_ICONS[versionFile.name.split('.').pop()?.toLowerCase() || 'pdf'] || '📄'}{' '}
              <strong>{versionFile.name}</strong>{' '}
              <span style={{ color: 'var(--text-light)' }}>
                ({FILE_TYPE_LABELS[versionFile.name.split('.').pop()?.toLowerCase() || ''] || versionFile.name.split('.').pop()?.toUpperCase()})
              </span>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Revision</label>
          <input
            type="text"
            value={versionRevision}
            onChange={(e) => setVersionRevision(e.target.value)}
            placeholder="e.g. 1.1"
            disabled={versionLoading}
          />
        </div>
        <div className="form-group">
          <label>Effective Date</label>
          <input
            type="date"
            value={versionEffectiveDate}
            onChange={(e) => setVersionEffectiveDate(e.target.value)}
            disabled={versionLoading}
          />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={versionPropagate}
              onChange={(e) => setVersionPropagate(e.target.checked)}
              disabled={versionLoading}
            />
            Reassign to all previous version assignees
          </label>
        </div>
      </Modal>

      {/* Publish Modal */}
      <Modal
        isOpen={showPublishModal}
        onClose={() => {
          setShowPublishModal(false)
          setPublishVersion(null)
          setPublishError(null)
        }}
        title="Publish Version"
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowPublishModal(false)}
              disabled={publishLoading}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handlePublishVersion} disabled={publishLoading}>
              {publishLoading ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        }
      >
        {publishError && <div className="error">{publishError}</div>}

        <div style={{ marginBottom: '16px' }}>
          <p>
            You are about to publish <strong>version {publishVersion?.versionNumber}</strong> of{' '}
            <strong>{documents.find((d) => d.id === publishVersion?.documentId)?.title}</strong>
          </p>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={publishPropagate}
              onChange={(e) => setPublishPropagate(e.target.checked)}
              disabled={publishLoading}
            />
            Reassign to all previous version assignees
          </label>
        </div>

        {publishPropagate && (
          <div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '12px', marginBottom: '16px', fontSize: '0.9em' }}>
            This will create assignments for all users who were assigned the previous published version.
          </div>
        )}
      </Modal>

      {/* Assignments Modal */}
      <Modal
        isOpen={showAssignmentsModal}
        onClose={() => {
          setShowAssignmentsModal(false)
          setAssignmentVersion(null)
          setAssignments([])
          setAssignmentsError(null)
        }}
        title={`Assignments: Version ${assignmentVersion?.versionNumber}`}
        footer={
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowAssignmentsModal(false)
                setAssignmentVersion(null)
                setAssignments([])
              }}
            >
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={handleRemindPending}
              disabled={remindingAssignments || assignments.filter((a) => !a.signedAt).length === 0}
            >
              {remindingAssignments ? 'Sending...' : 'Send Reminder to Pending'}
            </button>
          </div>
        }
      >
        {assignmentsError && <div className="error">{assignmentsError}</div>}

        {assignmentsLoading ? (
          <div style={{ color: 'var(--text-light)' }}>Loading assignments...</div>
        ) : (
          <>
            <div style={{ marginBottom: '16px', fontWeight: '500' }}>
              {assignments.filter((a) => a.signedAt).length} of {assignments.length} signed (
              {assignments.length > 0
                ? Math.round(
                    (assignments.filter((a) => a.signedAt).length / assignments.length) * 100
                  )
                : 0}
              %)
            </div>

            {assignments.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>No assignments for this version.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '0.9em' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Employee#</th>
                      <th>Status</th>
                      <th>Read %</th>
                      <th>Signed At</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a: any) => (
                      <tr key={a.id}>
                        <td>{a.userName}</td>
                        <td>{a.employeeNumber || '—'}</td>
                        <td>
                          <Badge
                            status={
                              a.signedAt
                                ? 'success'
                                : a.status === 'overdue'
                                  ? 'danger'
                                  : a.status === 'read'
                                    ? 'primary'
                                    : 'secondary'
                            }
                          >
                            {a.signedAt ? 'Signed' : a.status}
                          </Badge>
                        </td>
                        <td>{a.scrollDepth || 0}%</td>
                        <td>{a.signedAt ? new Date(a.signedAt).toLocaleDateString() : 'Pending'}</td>
                        <td>{a.signingMethod || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Version Diff Modal */}
      {diffDoc && (
        <VersionDiff
          isOpen={showDiffModal}
          onClose={() => {
            setShowDiffModal(false)
            setDiffDoc(null)
          }}
          documentId={diffDoc.id}
          documentTitle={diffDoc.title}
          versions={versionsByDocId[diffDoc.id] || []}
        />
      )}

      {/* Quick Assign Modal */}
      {showQuickAssignModal && quickAssignDoc && (
        <div className="modal" onClick={() => { setShowQuickAssignModal(false); setQaSearch('') }}>
          <div
            className="modal-content"
            style={{ maxWidth: '600px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 700 }}>Assign Document</h2>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-light)' }}>
                    {quickAssignDoc.title}
                    {quickAssignDoc.docNumber ? ` · ${quickAssignDoc.docNumber}` : ''}
                    {' · '}Version {quickAssignDoc.latestVersion}
                  </p>
                </div>
                <button className="modal-close" onClick={() => { setShowQuickAssignModal(false); setQaSearch('') }}>×</button>
              </div>
            </div>

            {/* ── Scrollable Body ── */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {qaError && <div className="error" style={{ marginBottom: '14px' }}>{qaError}</div>}
              {qaSuccess && <div className="success" style={{ marginBottom: '14px' }}>{qaSuccess}</div>}

              {/* Segmented control: Users / Groups */}
              <div className="form-group">
                <label>Assign to</label>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => { setQaAssignTarget('users'); setQaSelectedGroups([]); setQaSearch('') }}
                    style={{
                      padding: '8px 20px', border: 'none', borderRight: '1px solid var(--border)',
                      cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit',
                      background: qaIsUsers ? 'var(--primary)' : 'var(--surface)',
                      color: qaIsUsers ? '#fff' : 'var(--text)',
                      fontWeight: qaIsUsers ? 700 : 400,
                    }}
                  >
                    Users{qaUsers.length > 0 ? ` (${qaUsers.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQaAssignTarget('groups'); setQaSelectedUsers([]); setQaSearch('') }}
                    style={{
                      padding: '8px 20px', border: 'none',
                      cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit',
                      background: !qaIsUsers ? 'var(--primary)' : 'var(--surface)',
                      color: !qaIsUsers ? '#fff' : 'var(--text)',
                      fontWeight: !qaIsUsers ? 700 : 400,
                    }}
                  >
                    Groups{qaGroups.length > 0 ? ` (${qaGroups.length})` : ''}
                  </button>
                </div>
              </div>

              {qaLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-light)' }}>Loading…</div>
              ) : (
                <>
                  {/* Search + Select All */}
                  <div className="form-group">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={qaIsUsers ? 'Search by name or email…' : 'Search groups…'}
                        value={qaSearch}
                        onChange={(e) => setQaSearch(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                        onClick={() => {
                          if (qaIsUsers) {
                            if (qaAllUsersSelected) {
                              const removing = new Set(qaFilteredUsers.map((u: any) => u.id))
                              setQaSelectedUsers(qaSelectedUsers.filter((id) => !removing.has(id)))
                            } else {
                              const adding = qaFilteredUsers.map((u: any) => u.id).filter((id: string) => !qaSelectedUsers.includes(id))
                              setQaSelectedUsers([...qaSelectedUsers, ...adding])
                            }
                          } else {
                            if (qaAllGroupsSelected) {
                              const removing = new Set(qaFilteredGroups.map((g: any) => g.id))
                              setQaSelectedGroups(qaSelectedGroups.filter((id) => !removing.has(id)))
                            } else {
                              const adding = qaFilteredGroups.map((g: any) => g.id).filter((id: string) => !qaSelectedGroups.includes(id))
                              setQaSelectedGroups([...qaSelectedGroups, ...adding])
                            }
                          }
                        }}
                      >
                        {qaIsUsers
                          ? (qaAllUsersSelected ? 'Deselect all' : 'Select all')
                          : (qaAllGroupsSelected ? 'Deselect all' : 'Select all')}
                      </button>
                    </div>
                    {qaSelCount > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                        {qaSelCount} {qaIsUsers
                          ? `user${qaSelCount !== 1 ? 's' : ''}`
                          : `group${qaSelCount !== 1 ? 's' : ''}`} selected
                      </div>
                    )}
                  </div>

                  {/* Scrollable list */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: '280px', overflowY: 'auto' }}>
                    {qaIsUsers ? (
                      qaFilteredUsers.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)', fontSize: '13px' }}>
                          {qaSearch ? 'No users match your search.' : 'No users available.'}
                        </div>
                      ) : qaFilteredUsers.map((u: any) => {
                        const checked = qaSelectedUsers.includes(u.id)
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
                              onChange={(e) => {
                                if (e.target.checked) setQaSelectedUsers([...qaSelectedUsers, u.id])
                                else setQaSelectedUsers(qaSelectedUsers.filter((id) => id !== u.id))
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
                      qaFilteredGroups.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)', fontSize: '13px' }}>
                          {qaSearch ? 'No groups match your search.' : 'No groups available.'}
                        </div>
                      ) : qaFilteredGroups.map((g: any) => {
                        const checked = qaSelectedGroups.includes(g.id)
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
                              onChange={(e) => {
                                if (e.target.checked) setQaSelectedGroups([...qaSelectedGroups, g.id])
                                else setQaSelectedGroups(qaSelectedGroups.filter((id) => id !== g.id))
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
                </>
              )}

              {/* Deadline */}
              <div className="form-group" style={{ marginTop: '18px' }}>
                <label>
                  Deadline{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>(optional)</span>
                </label>
                <input
                  type="date"
                  value={qaDeadline}
                  onChange={(e) => setQaDeadline(e.target.value)}
                  disabled={qaLoading}
                />
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, background: 'var(--bg)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowQuickAssignModal(false); setQaSearch('') }}
                disabled={qaLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleQuickAssign}
                disabled={!qaCanSubmit}
              >
                {qaLoading
                  ? 'Assigning…'
                  : qaSelCount > 0
                    ? `Assign to ${qaSelCount} ${qaIsUsers ? `User${qaSelCount !== 1 ? 's' : ''}` : `Group${qaSelCount !== 1 ? 's' : ''}`}`
                    : 'Select recipients first'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Document Modal (super_admin only) */}
      {isSuperAdmin && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            if (!deleteLoading) {
              setShowDeleteModal(false)
              setDeleteDoc(null)
              setDeleteConfirmText('')
              setDeleteError(null)
            }
          }}
          title="Delete Document"
          footer={
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteDoc(null)
                  setDeleteConfirmText('')
                  setDeleteError(null)
                }}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteDocument}
                disabled={deleteLoading || deleteConfirmText !== deleteDoc?.title}
              >
                {deleteLoading ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          }
        >
          {deleteError && <div className="error" style={{ marginBottom: '12px' }}>{deleteError}</div>}

          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 'var(--radius)', padding: '14px', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--danger)' }}>⚠ This action cannot be undone</p>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)' }}>
              Deleting <strong>{deleteDoc?.title}</strong> will permanently remove all versions, file uploads, assignments,
              signing records, and audit history associated with this document.
            </p>
          </div>

          {deleteDoc && (
            <div style={{ marginBottom: '6px', fontSize: '13px', color: 'var(--text-light)' }}>
              Versions: <strong>{deleteDoc.latestVersion || 0}</strong> &nbsp;·&nbsp;
              Assignments: <strong>{deleteDoc.totalAssignments || 0}</strong> &nbsp;·&nbsp;
              Signed: <strong>{deleteDoc.totalSigned || 0}</strong>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>
              Type the document title to confirm:{' '}
              <strong style={{ fontFamily: 'monospace' }}>{deleteDoc?.title}</strong>
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type document title here"
              disabled={deleteLoading}
              style={{ borderColor: deleteConfirmText && deleteConfirmText !== deleteDoc?.title ? 'var(--danger)' : undefined }}
            />
          </div>
        </Modal>
      )}

      {/* ── Document Preview Modal ── */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false)
            setPreviewDoc(null)
          }}
          documentId={previewDoc.id}
          documentTitle={previewDoc.title}
          versionNumber={previewDoc.versionNumber}
          fileType={previewDoc.fileType}
        />
      )}
    </div>
  )
}
