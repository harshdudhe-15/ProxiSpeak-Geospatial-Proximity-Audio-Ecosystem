import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export function AudioStatusToast({ message, type = 'warning', onDismiss }) {
  if (!message) return null;

  return (
    <div className={`toast-notice ${type}`} role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center'
        }}
        title="Dismiss notice"
      >
        <X size={14} />
      </button>
    </div>
  );
}
