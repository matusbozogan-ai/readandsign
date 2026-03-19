import React from 'react'

interface BadgeProps {
  status: string
  children: React.ReactNode
}

export function Badge({ status, children }: BadgeProps) {
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'signed':
      case 'completed':
      case 'success':
        return 'badge-success'
      case 'pending':
        return 'badge-pending'
      case 'secondary':
      case 'draft':
        return 'badge-secondary'
      case 'in_progress':
      case 'in progress':
        return 'badge-primary'
      case 'read':
      case 'primary':
        return 'badge-primary'
      case 'overdue':
      case 'danger':
      case 'error':
        return 'badge-danger'
      case 'warning':
        return 'badge-warning'
      default:
        return 'badge-primary'
    }
  }

  return <span className={`badge ${getStatusClass(status)}`}>{children}</span>
}
