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

import { suppliersApi } from '../api/suppliers.js';
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

export function Suppliers() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'suppliers:create'); // Admin, Manager

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
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Deactivate confirm dialog
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);
  const [supplierToDeactivate, setSupplierToDeactivate] = useState(null);

  // Form values
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
  });

  // Fetch suppliers with server pagination and filtering
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (isActiveFilter !== '') params.isActive = isActiveFilter;

      const res = await suppliersApi.list(params);
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
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedSupplier(null);
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
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
  const handleOpenEdit = (supplier) => {
    setDialogMode('edit');
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email,
      phone: supplier.phone || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
      postalCode: supplier.postalCode || '',
      country: supplier.country || 'USA',
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  // Submit Supplier Create / Edit
  const handleSubmitSupplier = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFieldErrors({});

    // Client-side quick checks
    // Note: Multiple suppliers CAN share the same name (no client-side name uniqueness check!)
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Supplier name is required';
    if (!formData.email.trim()) errors.email = 'Supplier email is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        contactPerson: formData.contactPerson.trim() || null,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        country: formData.country.trim() || 'USA',
      };

      if (dialogMode === 'create') {
        await suppliersApi.create(payload);
      } else {
        await suppliersApi.update(selectedSupplier.id, payload);
      }

      setDialogOpen(false);
      fetchSuppliers();
    } catch (err) {
      setFormError(err);
      const code = getErrorCode(err);
      const backendFields = getFieldErrors(err);

      if (code === 'DUPLICATE_RESOURCE' || code === 'CONFLICT') {
        backendFields.email = getErrorMessage(err);
      }
      setFieldErrors(backendFields);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Deactivation
  const handleOpenDeactivate = (supplier) => {
    setSupplierToDeactivate(supplier);
    setDeactivateError(null);
    setDeactivateOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!supplierToDeactivate) return;
    setDeactivateLoading(true);
    setDeactivateError(null);
    try {
      await suppliersApi.deactivate(supplierToDeactivate.id);
      setDeactivateOpen(false);
      setSupplierToDeactivate(null);
      fetchSuppliers();
    } catch (err) {
      // Backend 422: "Cannot deactivate supplier with open purchase orders"
      setDeactivateError(err);
    } finally {
      setDeactivateLoading(false);
    }
  };

  const columns = [
    {
      field: 'name',
      headerName: 'Supplier Name',
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          {params.value}
        </Typography>
      ),
    },
    { field: 'contactPerson', headerName: 'Contact Person', width: 160 },
    { field: 'email', headerName: 'Email Address', flex: 1.2, minWidth: 180 },
    { field: 'phone', headerName: 'Phone', width: 140 },
    {
      field: 'city',
      headerName: 'Location',
      width: 140,
      renderCell: (params) => `${params.row.city || ''}${params.row.state ? `, ${params.row.state}` : ''}`,
    },
    {
      field: 'productCount',
      headerName: 'Products',
      width: 100,
      type: 'number',
      renderCell: (params) => (
        <Typography variant="body2" fontVariantNumeric="tabular-nums">
          {params.value ?? 0}
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
                <Tooltip title="Edit Supplier">
                  <IconButton size="small" onClick={() => handleOpenEdit(params.row)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {params.row.isActive && (
                  <Tooltip title="Deactivate Supplier">
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
        title="Supplier Directory"
        subtitle="Manage active suppliers, contact information, catalog distribution, and vendor deactivations"
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New Supplier
            </Button>
          )
        }
      />

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} sx={{ mb: 2 }} />}

      <SearchToolbar search={search} onSearchChange={setSearch} placeholder="Search by supplier name or email...">
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

      {/* Suppliers DataGrid */}
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

      {/* Create / Edit Supplier Dialog (UC-21, UC-23) */}
      <FormDialog
        open={dialogOpen}
        title={dialogMode === 'create' ? 'Create Supplier (UC-21)' : 'Edit Supplier (UC-23)'}
        subtitle="Multiple suppliers can share the same business name; email must be unique."
        submitText={dialogMode === 'create' ? 'Create Supplier' : 'Save Changes'}
        loading={formLoading}
        error={formError}
        onSubmit={handleSubmitSupplier}
        onClose={() => setDialogOpen(false)}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Supplier Company Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name || 'Shared names allowed; multiple suppliers may share a name'}
            required
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Contact Person"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />

            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </Box>

          <TextField
            fullWidth
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email || 'Must be unique across all suppliers'}
            required
          />

          <TextField
            fullWidth
            label="Street Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="City"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
              label="Postal Code"
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

      {/* Deactivate Supplier Confirmation (UC-24 / BR-07) */}
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate Supplier"
        content={
          supplierToDeactivate
            ? `Are you sure you want to deactivate "${supplierToDeactivate.name}"? Operation will be rejected if the supplier has open purchase orders.`
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
