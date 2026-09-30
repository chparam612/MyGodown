import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';

import { warehousesApi } from '../api/warehouses.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { SearchToolbar } from '../components/SearchToolbar.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { ErrorAlert } from '../components/ErrorAlert.jsx';
import { FormDialog } from '../components/FormDialog.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/useAuth.js';
import { can } from '../utils/permissions.js';
import { getFieldErrors, getErrorCode, getErrorMessage } from '../utils/errors.js';
import { DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export function Warehouses() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'warehouses:create'); // Admin only

  // Server-side query state
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create'); // 'create' | 'edit'
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Deactivate confirm dialog
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);
  const [warehouseToDeactivate, setWarehouseToDeactivate] = useState(null);

  // Form values
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
  });

  // Fetch warehouses
  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (isActiveFilter !== '') params.isActive = isActiveFilter;

      const res = await warehousesApi.list(params);
      setRows(res.data || []);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, isActiveFilter]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedWarehouse(null);
    setFormData({
      code: '',
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'USA',
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (warehouse) => {
    setDialogMode('edit');
    setSelectedWarehouse(warehouse);
    setFormData({
      code: warehouse.code,
      name: warehouse.name,
      address: warehouse.address || '',
      city: warehouse.city || '',
      state: warehouse.state || '',
      postalCode: warehouse.postalCode || '',
      country: warehouse.country || 'USA',
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  // Submit Warehouse Create / Edit
  const handleSubmitWarehouse = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFieldErrors({});

    const errors = {};
    if (dialogMode === 'create' && !formData.code.trim()) errors.code = 'Facility code is required';
    if (!formData.name.trim()) errors.name = 'Warehouse name is required';
    if (!formData.address.trim()) errors.address = 'Street address is required';
    if (!formData.city.trim()) errors.city = 'City is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        country: formData.country.trim() || 'USA',
      };

      if (dialogMode === 'create') {
        payload.code = formData.code.trim().toUpperCase();
        await warehousesApi.create(payload);
      } else {
        await warehousesApi.update(selectedWarehouse.id, payload);
      }

      setDialogOpen(false);
      fetchWarehouses();
    } catch (err) {
      setFormError(err);
      const code = getErrorCode(err);
      const backendFields = getFieldErrors(err);

      if (code === 'DUPLICATE_RESOURCE' || code === 'CONFLICT') {
        backendFields.code = getErrorMessage(err);
      }
      setFieldErrors(backendFields);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Deactivation
  const handleOpenDeactivate = (warehouse) => {
    setWarehouseToDeactivate(warehouse);
    setDeactivateError(null);
    setDeactivateOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!warehouseToDeactivate) return;
    setDeactivateLoading(true);
    setDeactivateError(null);
    try {
      await warehousesApi.deactivate(warehouseToDeactivate.id);
      setDeactivateOpen(false);
      setWarehouseToDeactivate(null);
      fetchWarehouses();
    } catch (err) {
      // Backend 422: "Cannot deactivate warehouse holding active inventory"
      setDeactivateError(err);
    } finally {
      setDeactivateLoading(false);
    }
  };

  const columns = [
    { field: 'code', headerName: 'Code', width: 140, fontWeight: 600 },
    {
      field: 'name',
      headerName: 'Warehouse Name',
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'address',
      headerName: 'Location',
      flex: 1.4,
      minWidth: 200,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {`${params.row.address || ''}, ${params.row.city || ''} ${params.row.state || ''}`}
        </Typography>
      ),
    },
    {
      field: 'totalUnits',
      headerName: 'Stock Units',
      width: 120,
      type: 'number',
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600} fontVariantNumeric="tabular-nums">
          {(params.value ?? 0).toLocaleString()}
        </Typography>
      ),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => <StatusChip status={params.value} type="active" />,
    },
    ...(canManage
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 100,
            sortable: false,
            renderCell: (params) => (
              <Box>
                <Tooltip title="Edit Warehouse">
                  <IconButton size="small" onClick={() => handleOpenEdit(params.row)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {params.row.isActive && (
                  <Tooltip title="Deactivate Warehouse">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleOpenDeactivate(params.row)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            ),
          },
        ]
      : []),
  ];

  return (
    <Box>
      <PageHeader
        title="Warehouse Facilities"
        subtitle="Manage distribution facilities, operational capacity, and facility deactivation"
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New Warehouse
            </Button>
          )
        }
      />

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} sx={{ mb: 2 }} />}

      <SearchToolbar search={search} onSearchChange={setSearch} placeholder="Search by name, code or city...">
        <TextField
          select
          size="small"
          label="Status"
          value={isActiveFilter}
          onChange={(e) => setIsActiveFilter(e.target.value)}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          <MenuItem value="true">Active Only</MenuItem>
          <MenuItem value="false">Inactive Only</MenuItem>
        </TextField>
      </SearchToolbar>

      {/* Warehouses DataGrid */}
      <Box sx={{ height: 600, width: '100%', bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          paginationMode="server"
          rowCount={meta.total}
          paginationModel={{ page: meta.page - 1, pageSize: meta.limit }}
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
            border: '1px solid #e2e8f0',
            borderRadius: 2,
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600 },
          }}
        />
      </Box>

      {/* Create / Edit Warehouse Modal */}
      <FormDialog
        open={dialogOpen}
        title={dialogMode === 'create' ? 'Create Warehouse (UC-11)' : 'Edit Warehouse (UC-13)'}
        subtitle={
          dialogMode === 'create'
            ? 'Add an operational distribution facility. Facility code is immutable once created.'
            : `Editing warehouse ${selectedWarehouse?.code}. Code cannot be changed.`
        }
        submitText={dialogMode === 'create' ? 'Create Warehouse' : 'Save Changes'}
        loading={formLoading}
        error={formError}
        onSubmit={handleSubmitWarehouse}
        onClose={() => setDialogOpen(false)}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Facility Code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            disabled={dialogMode === 'edit'} // Immutable Code
            error={Boolean(fieldErrors.code)}
            helperText={
              fieldErrors.code ||
              (dialogMode === 'edit'
                ? 'Warehouse code is immutable after creation'
                : 'Unique facility identifier (e.g. WH-NORTH)')
            }
            required
          />

          <TextField
            fullWidth
            label="Warehouse Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name}
            required
          />

          <TextField
            fullWidth
            label="Street Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            error={Boolean(fieldErrors.address)}
            helperText={fieldErrors.address}
            required
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="City"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              error={Boolean(fieldErrors.city)}
              helperText={fieldErrors.city}
              required
            />

            <TextField
              fullWidth
              label="State / Province"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Postal / ZIP Code"
              value={formData.postalCode}
              onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
            />

            <TextField
              fullWidth
              label="Country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </Box>
        </Box>
      </FormDialog>

      {/* Deactivate Warehouse Confirmation (UC-13 / BR-08) */}
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate Warehouse Facility"
        content={
          warehouseToDeactivate
            ? `Are you sure you want to deactivate "${warehouseToDeactivate.name}" (${warehouseToDeactivate.code})? It must contain zero inventory stock or the operation will be rejected.`
            : ''
        }
        confirmText="Deactivate"
        confirmColor="error"
        loading={deactivateLoading}
        error={deactivateError}
        onConfirm={handleConfirmDeactivate}
        onClose={() => setDeactivateOpen(false)}
      />
    </Box>
  );
}
