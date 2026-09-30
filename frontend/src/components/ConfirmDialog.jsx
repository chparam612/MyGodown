import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { ErrorAlert } from './ErrorAlert.jsx';

export function ConfirmDialog({
  open,
  title = 'Confirm Action',
  content,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'primary',
  loading = false,
  error = null,
  onConfirm,
  onClose,
  onCancel,
}) {
  const handleClose = onClose || onCancel;
  const dialogText = content || message;

  return (
    <Dialog open={open} onClose={loading ? undefined : handleClose} maxWidth="xs" fullWidth>
      <DialogTitle fontWeight={600}>{title}</DialogTitle>
      <DialogContent>
        {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
        {typeof dialogText === 'string' ? (
          <DialogContentText color="text.secondary">{dialogText}</DialogContentText>
        ) : (
          dialogText
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} disabled={loading} color="inherit">
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          color={confirmColor}
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
