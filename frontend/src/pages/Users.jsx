import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { DataGrid } from '@mui/x-data-grid';

import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import KeyIcon from '@mui/icons-material/Key';
import SearchIcon from '@mui/icons-material/Search';

import { usersApi } from '../api/users.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { ErrorAlert } from '../components/ErrorAlert.jsx';
import { FormDialog } from '../components/FormDialog.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/useAuth.js';
import { can } from '../utils/permissions.js';
import { formatDate, formatEnumLabel } from '../utils/formatters.js';
import { getFieldErrors } from '../utils/errors.js';
import { DEFAULT_PAGE_SIZE, USER_ROLES } from '../utils/constants.js';

export function Users() {
  const { user: currentUser } = useAuth();
  const canManageUsers = can(currentUser?.role, 'users:create'); // Admin only

  // Server-side query state
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  // Create User Modal (UC-04)
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createFieldErrors, setCreateFieldErrors] = useState({});
  const [createData, setCreateData] = useState({
    name: '',
    email: '',
    password: '',
    role: USER_ROLES.STAFF,
  });

  // Edit User Modal (UC-06)
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [editData, setEditData] = useState({
    id: null,
    name: '',
    email: '',
    role: USER_ROLES.STAFF,
    isActive: true,
  });

  // Admin Reset Password Modal (UC-P02)
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetFieldErrors, setResetFieldErrors] = useState({});

  // Deactivate User Modal (UC-06)
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);

  // Fetch Users (UC-05)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter;
      if (activeFilter !== '') params.isActive = activeFilter;

      const res = await usersApi.list(params);
      setRows(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, roleFilter, activeFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setCreateData({
      name: '',
      email: '',
      password: '',
      role: USER_ROLES.STAFF,
    });
    setCreateError(null);
    setCreateFieldErrors({});
    setCreateOpen(true);
  };

  // Submit Create User (UC-04)
  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    setCreateFieldErrors({});

    try {
      await usersApi.create({
        name: createData.name.trim(),
        email: createData.email.trim().toLowerCase(),
        password: createData.password,
        role: createData.role,
      });
      setCreateOpen(false);
      fetchUsers();
    } catch (err) {
      setCreateError(err);
      setCreateFieldErrors(getFieldErrors(err));
    } finally {
      setCreateLoading(false);
    }
  };

  // Open Edit Dialog (UC-06)
  const handleOpenEdit = (user) => {
    setEditData({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.isActive ?? user.is_active),
    });
    setEditError(null);
    setEditFieldErrors({});
    setEditOpen(true);
  };

  // Submit Edit User (UC-06)
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);
    setEditFieldErrors({});

    try {
      await usersApi.update(editData.id, {
        name: editData.name.trim(),
        email: editData.email.trim().toLowerCase(),
        role: editData.role,
        isActive: editData.isActive,
      });
      setEditOpen(false);
      fetchUsers();
    } catch (err) {
      setEditError(err);
      setEditFieldErrors(getFieldErrors(err));
    } finally {
      setEditLoading(false);
    }
  };

  // Open Reset Password Dialog (UC-P02)
  const handleOpenReset = (user) => {
    setResetTargetUser(user);
    setResetPasswordVal('');
    setResetError(null);
    setResetFieldErrors({});
    setResetOpen(true);
  };

  // Submit Reset Password (UC-P02)
  const handleSubmitReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetFieldErrors({});

    try {
      await usersApi.resetPassword(resetTargetUser.id, {
        password: resetPasswordVal,
      });
      setResetOpen(false);
    } catch (err) {
      setResetError(err);
      setResetFieldErrors(getFieldErrors(err));
    } finally {
      setResetLoading(false);
    }
  };

  // Open Deactivate Dialog (UC-06)
  const handleOpenDeactivate = (user) => {
    setDeactivateTarget(user);
    setDeactivateError(null);
    setDeactivateOpen(true);
  };

  // Confirm Deactivate (UC-06)
  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivateLoading(true);
    setDeactivateError(null);
    try {
      await usersApi.deactivate(deactivateTarget.id);
      setDeactivateOpen(false);
      fetchUsers();
    } catch (err) {
      setDeactivateError(err);
    } finally {
      setDeactivateLoading(false);
    }
  };

  // Role chip color mapping
  const getRoleChipColor = (role) => {
    switch (role) {
      case 'admin':
        return 'primary';
      case 'manager':
        return 'secondary';
      case 'staff':
        return 'default';
      default:
        return 'default';
    }
  };

  // DataGrid Columns
  const columns = [
    {
      field: 'name',
      headerName: 'Full Name',
      flex: 1.3,
      minWidth: 160,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {params.row.name}
          {currentUser?.id === params.row.id && (
            <Chip label="You" size="small" variant="outlined" color="primary" sx={{ ml: 1, height: 20 }} />
          )}
        </Typography>
      ),
    },
    {
      field: 'email',
      headerName: 'Email Address',
      flex: 1.5,
      minWidth: 180,
    },
    {
      field: 'role',
      headerName: 'System Role',
      width: 140,
      renderCell: (params) => (
        <Chip
          label={formatEnumLabel(params.row.role)}
          color={getRoleChipColor(params.row.role)}
          size="small"
          variant="filled"
        />
      ),
    },
    {
      field: 'isActive',
      headerName: 'Account Status',
      width: 140,
      renderCell: (params) => (
        <StatusChip status={params.row.isActive ?? params.row.is_active} type="active" />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Created Date',
      width: 140,
      valueFormatter: (value) => formatDate(value, 'MMM D, YYYY'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      renderCell: (params) => {
        const u = params.row;
        const isSelf = currentUser?.id === u.id;
        const isActive = Boolean(u.isActive ?? u.is_active);

        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Tooltip title="Edit User Account">
              <IconButton size="small" color="primary" onClick={() => handleOpenEdit(u)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Admin Password Reset (UC-P02)">
              <IconButton size="small" color="secondary" onClick={() => handleOpenReset(u)}>
                <KeyIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {isActive && (
              <Tooltip title={isSelf ? 'Cannot deactivate your own account' : 'Deactivate User Account'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={isSelf}
                    onClick={() => handleOpenDeactivate(u)}
                  >
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="User Administration"
        subtitle="Manage administrative accounts, role-based authorization, and user security policies"
        action={
          canManageUsers && (
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New User Account
            </Button>
          )
        }
      />

      {/* Filters Bar */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Search Name or Email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              sx={{ minWidth: 280 }}
            />

            <TextField
              select
              size="small"
              label="Role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All Roles</MenuItem>
              <MenuItem value={USER_ROLES.ADMIN}>Administrator</MenuItem>
              <MenuItem value={USER_ROLES.MANAGER}>Warehouse Manager</MenuItem>
              <MenuItem value={USER_ROLES.STAFF}>Inventory Staff</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Status"
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="true">Active Only</MenuItem>
              <MenuItem value="false">Inactive Only</MenuItem>
            </TextField>

            <Box sx={{ ml: 'auto' }}>
              <Typography variant="caption" color="text.secondary">
                Total Users: <strong>{meta.total}</strong>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}

      <Card variant="outlined">
        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            rowCount={meta.total}
            paginationMode="server"
            paginationModel={{
              page: Math.max(0, meta.page - 1),
              pageSize: meta.limit,
            }}
            onPaginationModelChange={(newModel) => {
              setMeta((prev) => ({
                ...prev,
                page: newModel.page + 1,
                limit: newModel.pageSize,
              }));
            }}
            pageSizeOptions={[10, 20, 50]}
            disableRowSelectionOnClick
            sx={{
              border: 'none',
              '& .MuiDataGrid-cell:focus': { outline: 'none' },
            }}
          />
        </Box>
      </Card>

      {/* ================================================================= */}
      {/* MODAL 1: CREATE USER (UC-04)                                      */}
      {/* ================================================================= */}
      <FormDialog
        open={createOpen}
        title="Create New User Account (UC-04)"
        subtitle="Provision access credentials and assign system role"
        submitText="Create User"
        loading={createLoading}
        error={createError}
        maxWidth="sm"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleSubmitCreate}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Full Name"
            value={createData.name}
            onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
            error={Boolean(createFieldErrors.name)}
            helperText={createFieldErrors.name}
            required
          />

          <TextField
            fullWidth
            type="email"
            label="Email Address"
            value={createData.email}
            onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
            error={Boolean(createFieldErrors.email)}
            helperText={createFieldErrors.email}
            required
          />

          <TextField
            fullWidth
            type="password"
            label="Initial Password"
            value={createData.password}
            onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
            error={Boolean(createFieldErrors.password)}
            helperText={createFieldErrors.password || 'Min 8 chars, 1 uppercase, 1 lowercase, 1 digit'}
            required
          />

          <TextField
            select
            fullWidth
            label="Role Assignment"
            value={createData.role}
            onChange={(e) => setCreateData({ ...createData, role: e.target.value })}
            required
          >
            <MenuItem value={USER_ROLES.ADMIN}>Administrator (Full system permissions)</MenuItem>
            <MenuItem value={USER_ROLES.MANAGER}>Warehouse Manager (Operations & cost views)</MenuItem>
            <MenuItem value={USER_ROLES.STAFF}>Inventory Staff (Warehouse ops, masked costs)</MenuItem>
          </TextField>
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* MODAL 2: EDIT USER (UC-06)                                        */}
      {/* ================================================================= */}
      <FormDialog
        open={editOpen}
        title={`Edit User: ${editData.name}`}
        subtitle="Update profile name, role authority, or account state"
        submitText="Save Changes"
        loading={editLoading}
        error={editError}
        maxWidth="sm"
        onClose={() => setEditOpen(false)}
        onSubmit={handleSubmitEdit}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Full Name"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            error={Boolean(editFieldErrors.name)}
            helperText={editFieldErrors.name}
            required
          />

          <TextField
            fullWidth
            type="email"
            label="Email Address"
            value={editData.email}
            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            error={Boolean(editFieldErrors.email)}
            helperText={editFieldErrors.email}
            required
          />

          <TextField
            select
            fullWidth
            label="Role Assignment"
            value={editData.role}
            onChange={(e) => setEditData({ ...editData, role: e.target.value })}
            required
          >
            <MenuItem value={USER_ROLES.ADMIN}>Administrator</MenuItem>
            <MenuItem value={USER_ROLES.MANAGER}>Warehouse Manager</MenuItem>
            <MenuItem value={USER_ROLES.STAFF}>Inventory Staff</MenuItem>
          </TextField>

          <FormControlLabel
            control={
              <Switch
                checked={editData.isActive}
                onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                color="primary"
                disabled={currentUser?.id === editData.id}
              />
            }
            label={editData.isActive ? 'Account Active' : 'Account Inactive / Disabled'}
          />
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* MODAL 3: ADMIN PASSWORD RESET (UC-P02)                            */}
      {/* ================================================================= */}
      <FormDialog
        open={resetOpen}
        title={`Reset Password for ${resetTargetUser?.name || 'User'}`}
        subtitle={`User email: ${resetTargetUser?.email || ''}`}
        submitText="Reset Password"
        loading={resetLoading}
        error={resetError}
        maxWidth="xs"
        onClose={() => setResetOpen(false)}
        onSubmit={handleSubmitReset}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            type="password"
            label="New Password"
            value={resetPasswordVal}
            onChange={(e) => setResetPasswordVal(e.target.value)}
            error={Boolean(resetFieldErrors.password)}
            helperText={resetFieldErrors.password || 'Min 8 chars, 1 uppercase, 1 lowercase, 1 digit'}
            required
          />
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* MODAL 4: CONFIRM DEACTIVATE (UC-06)                               */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate User Account"
        message={`Are you sure you want to deactivate ${deactivateTarget?.name} (${deactivateTarget?.email})? The user will immediately be barred from logging into the platform.`}
        confirmText="Deactivate Account"
        confirmColor="error"
        loading={deactivateLoading}
        error={deactivateError}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />
    </>
  );
}
