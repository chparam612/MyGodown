import React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getErrorMessage, getErrorCode } from '../utils/errors.js';

export function ErrorAlert({ error, onRetry, title, sx }) {
  if (!error) return null;

  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const details = error?.response?.data?.error?.details || error?.error?.details || error?.details;

  return (
    <Alert
      severity="error"
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry} startIcon={<RefreshIcon />}>
            Retry
          </Button>
        )
      }
      sx={{ mb: 2, ...sx }}
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {code ? `[${code}] ${message}` : message}
      </Typography>

      {Array.isArray(details) && details.length > 0 && (
        <Box component="ul" sx={{ pl: 2, mt: 1, mb: 0, fontSize: '0.85rem' }}>
          {details.map((detail, index) => (
            <li key={index}>
              {detail.field ? <strong>{detail.field}: </strong> : null}
              {detail.message || JSON.stringify(detail)}
            </li>
          ))}
        </Box>
      )}
    </Alert>
  );
}
