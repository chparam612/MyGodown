import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { ErrorAlert } from './ErrorAlert.jsx';

export function FormDialog({
  open,
  title,
  subtitle,
  children,
  submitText = 'Save',
  cancelText = 'Cancel',
  loading = false,
  error = null,
  maxWidth = 'sm',
  onSubmit,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth={maxWidth} fullWidth>
      <form onSubmit={onSubmit}>
        <DialogTitle sx={{ pb: subtitle ? 0.5 : 2 }}>
          {title}
          {subtitle && (
            <div style={{ fontSize: '0.85rem', fontWeight: 400, color: '#64748b', marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
          {children}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            {cancelText}
          </Button>
          <Button
            type="submit"
            disabled={loading}
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {loading ? 'Submitting...' : submitText}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
