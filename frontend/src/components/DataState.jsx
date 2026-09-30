import React from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { ErrorAlert } from './ErrorAlert.jsx';

export function DataState({
  loading = false,
  error = null,
  isEmpty = false,
  emptyMessage = 'No records found.',
  emptyAction = null,
  onRetry = null,
  children,
  minHeight = 200,
}) {
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight,
          p: 4,
        }}
      >
        <CircularProgress size={40} thickness={4} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading data...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <ErrorAlert error={error} onRetry={onRetry} />
      </Box>
    );
  }

  if (isEmpty) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight,
          p: 4,
          textAlign: 'center',
        }}
      >
        <InboxOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
        <Typography variant="subtitle1" color="text.primary" fontWeight={600}>
          {emptyMessage}
        </Typography>
        {emptyAction && <Box sx={{ mt: 2 }}>{emptyAction}</Box>}
      </Box>
    );
  }

  return <>{children}</>;
}
