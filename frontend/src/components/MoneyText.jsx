import React from 'react';
import Typography from '@mui/material/Typography';
import { formatCurrency } from '../utils/formatters.js';

export function MoneyText({ amount, variant = 'body2', fontWeight = 500, color = 'inherit' }) {
  return (
    <Typography
      variant={variant}
      component="span"
      sx={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight,
        color,
      }}
    >
      {formatCurrency(amount)}
    </Typography>
  );
}
