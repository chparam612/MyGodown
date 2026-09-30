import React from 'react';
import Chip from '@mui/material/Chip';
import { formatEnumLabel } from '../utils/formatters.js';

export function StatusChip({ status, type = 'status', label, size = 'small' }) {
  if (status === null || status === undefined) return null;

  const rawVal = String(status).toLowerCase();
  const displayLabel = label || formatEnumLabel(rawVal);

  let color = 'default';
  let variant = 'filled';

  if (type === 'active') {
    return (
      <Chip
        label={status ? 'Active' : 'Inactive'}
        color={status ? 'success' : 'default'}
        size={size}
        variant="outlined"
      />
    );
  }

  switch (rawVal) {
    // Terminal success states
    case 'received':
    case 'fulfilled':
    case 'active':
    case 'in':
      color = 'success';
      break;

    // Active in-progress states
    case 'ordered':
    case 'confirmed':
    case 'adjustment':
      color = 'info';
      break;

    // Terminal cancelled / deactivated / out
    case 'cancelled':
    case 'inactive':
    case 'error':
      color = 'error';
      break;

    case 'out':
      color = 'warning';
      break;

    case 'transfer':
      color = 'secondary';
      break;

    case 'purchase_order':
      color = 'primary';
      break;

    case 'sales_order':
      color = 'success';
      variant = 'outlined';
      break;

    case 'draft':
    case 'manual':
    default:
      color = 'default';
      break;
  }

  return <Chip label={displayLabel} color={color} size={size} variant={variant} />;
}
