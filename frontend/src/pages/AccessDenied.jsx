import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';

export function AccessDenied() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 5,
          maxWidth: 450,
          textAlign: 'center',
          border: '1px solid #e2e8f0',
          borderRadius: 2,
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 56, color: 'error.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You do not have the required role permissions to view or perform operations on this page.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Return to Dashboard
        </Button>
      </Paper>
    </Box>
  );
}
