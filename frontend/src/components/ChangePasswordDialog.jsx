import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import { FormDialog } from './FormDialog.jsx';
import { authApi } from '../api/auth.js';
import { getFieldErrors } from '../utils/errors.js';

export function ChangePasswordDialog({ open, onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientErrors, setClientErrors] = useState({});

  const handleReset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setClientErrors({});
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setClientErrors({});

    // Client-side quick validations
    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required';
    if (!newPassword) {
      errors.newPassword = 'New password is required';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters long';
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      handleReset();
      if (onSuccess) onSuccess('Password updated successfully');
    } catch (err) {
      setError(err);
      const backendFields = getFieldErrors(err);
      if (Object.keys(backendFields).length > 0) {
        setClientErrors(backendFields);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title="Change Own Password (UC-03)"
      subtitle="Enter your current password and a new secure password (minimum 8 characters)."
      submitText="Update Password"
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      onClose={handleReset}
    >
      <TextField
        fullWidth
        label="Current Password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={Boolean(clientErrors.currentPassword)}
        helperText={clientErrors.currentPassword}
        margin="normal"
        autoFocus
        required
      />
      <TextField
        fullWidth
        label="New Password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={Boolean(clientErrors.newPassword)}
        helperText={clientErrors.newPassword}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Confirm New Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={Boolean(clientErrors.confirmPassword)}
        helperText={clientErrors.confirmPassword}
        margin="normal"
        required
      />
    </FormDialog>
  );
}
