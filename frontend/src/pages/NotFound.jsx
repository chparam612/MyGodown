import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import { useNavigate } from 'react-router-dom';

export function NotFound() {
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
        <ErrorOutlinedIcon sx={{ fontSize: 56, color: 'warning.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Page Not Found (404)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          The requested URL path does not exist in the Retail Inventory Management System.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Return to Dashboard
        </Button>
      </Paper>
    </Box>
  );
}
