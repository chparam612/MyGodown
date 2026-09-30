import React from 'react';
import { can } from '../utils/permissions.js';

export function RoleGate({ role, action, allowedRoles, fallback = null, children }) {
  if (!role) return fallback;

  if (action) {
    return can(role, action) ? <>{children}</> : fallback;
  }

  if (Array.isArray(allowedRoles)) {
    return allowedRoles.includes(role) ? <>{children}</> : fallback;
  }

  return <>{children}</>;
}
