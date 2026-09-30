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

import { productsApi } from '../api/products.js';
import { suppliersApi } from '../api/suppliers.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { SearchToolbar } from '../components/SearchToolbar.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { ErrorAlert } from '../components/ErrorAlert.jsx';
import { FormDialog } from '../components/FormDialog.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { MoneyText } from '../components/MoneyText.jsx';
import { useAuth } from '../context/useAuth.js';
import { can } from '../utils/permissions.js';
import { getFieldErrors, getErrorCode, getErrorMessage } from '../utils/errors.js';
import { DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export function Products() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'products:create');
  const canSeeCost = can(user?.role, 'products:view_cost');

  // Server-side query state
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [sortModel, setSortModel] = useState([]);

  // Suppliers for picker dropdown
  const [suppliers, setSuppliers] = useState([]);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create'); // 'create' | 'edit'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Deactivate confirm dialog
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);
  const [productToDeactivate, setProductToDeactivate] = useState(null);

  // Form values
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category: '',
    unitPrice: '',
    costPrice: '',
    reorderLevel: 10,
    supplierId: '',
  });

  // Fetch products with server pagination and filtering
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (isActiveFilter !== '') params.isActive = isActiveFilter;

      if (sortModel.length > 0) {
        params.sortBy = sortModel[0].field;
        params.sortOrder = sortModel[0].sort.toUpperCase();
      }

      const res = await productsApi.list(params);
      setRows(res.data || []);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, category, isActiveFilter, sortModel]);

  // Load suppliers for dropdown selection
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await suppliersApi.list({ isActive: 'true', limit: 100 });
      setSuppliers(res.data || []);
    } catch (err) {
      console.error('[Products] Failed to load active suppliers', err);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (canManage) {
      fetchSuppliers();
    }
  }, [canManage, fetchSuppliers]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedProduct(null);
    setFormData({
      sku: '',
      name: '',
      description: '',
      category: '',
      unitPrice: '',
      costPrice: '',
      reorderLevel: 10,
      supplierId: suppliers[0]?.id || '',
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (product) => {
    setDialogMode('edit');
    setSelectedProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      category: product.category,
      unitPrice: product.unitPrice,
      costPrice: product.costPrice !== undefined ? product.costPrice : '',
      reorderLevel: product.reorderLevel,
      supplierId: product.supplierId,
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  // Submit Product Create / Edit
  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFieldErrors({});

    // Client-side quick checks
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (dialogMode === 'create' && !formData.sku.trim()) errors.sku = 'SKU code is required';
    if (!formData.category.trim()) errors.category = 'Category is required';
    if (formData.unitPrice === '' || Number(formData.unitPrice) < 0) {
      errors.unitPrice = 'Unit selling price must be 0 or greater';
    }
    if (canSeeCost && (formData.costPrice === '' || Number(formData.costPrice) < 0)) {
      errors.costPrice = 'Unit cost price must be 0 or greater';
    }
    if (formData.reorderLevel === '' || Number(formData.reorderLevel) < 0) {
      errors.reorderLevel = 'Reorder level cannot be negative';
    }
    if (!formData.supplierId) errors.supplierId = 'Supplier is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        unitPrice: Number(formData.unitPrice),
        costPrice: canSeeCost && formData.costPrice !== '' ? Number(formData.costPrice) : undefined,
        reorderLevel: Number(formData.reorderLevel),
        supplierId: Number(formData.supplierId),
      };

      if (dialogMode === 'create') {
        payload.sku = formData.sku.trim().toUpperCase();
        await productsApi.create(payload);
      } else {
        await productsApi.update(selectedProduct.id, payload);
      }

      setDialogOpen(false);
      fetchProducts();
    } catch (err) {
      setFormError(err);
      const code = getErrorCode(err);
      const backendFieldErrors = getFieldErrors(err);

      // Handle duplicate SKU 409
      if (code === 'DUPLICATE_RESOURCE' || code === 'CONFLICT') {
        backendFieldErrors.sku = getErrorMessage(err);
      }
      setFieldErrors(backendFieldErrors);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Deactivation
  const handleOpenDeactivate = (product) => {
    setProductToDeactivate(product);
    setDeactivateError(null);
    setDeactivateOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!productToDeactivate) return;
    setDeactivateLoading(true);
    setDeactivateError(null);
    try {
      await productsApi.deactivate(productToDeactivate.id);
      setDeactivateOpen(false);
      setProductToDeactivate(null);
      fetchProducts();
    } catch (err) {
      setDeactivateError(err);
    } finally {
      setDeactivateLoading(false);
    }
  };

  // DataGrid Columns definition
  const columns = [
    { field: 'sku', headerName: 'SKU', width: 140, fontWeight: 600 },
    {
      field: 'name',
      headerName: 'Product Name',
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight={600} noWrap>
            {params.row.name}
          </Typography>
          {params.row.description && (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {params.row.description}
            </Typography>
          )}
        </Box>
      ),
    },
    { field: 'category', headerName: 'Category', width: 130 },
    {
      field: 'unitPrice',
      headerName: 'Selling Price',
      width: 120,
      type: 'number',
      renderCell: (params) => <MoneyText amount={params.value} />,
    },
    // BR-05: costPrice column rendered only if authorized (Admin / Manager)
    ...(canSeeCost
      ? [
          {
            field: 'costPrice',
            headerName: 'Cost Price',
            width: 120,
            type: 'number',
            renderCell: (params) => <MoneyText amount={params.value} color="text.secondary" />,
          },
        ]
      : []),
    {
      field: 'totalStock',
      headerName: 'On Hand',
      width: 100,
      type: 'number',
      renderCell: (params) => (
        <Typography
          variant="body2"
          fontWeight={600}
          color={params.value <= params.row.reorderLevel ? 'warning.main' : 'text.primary'}
        >
          {params.value ?? 0}
        </Typography>
      ),
    },
    { field: 'reorderLevel', headerName: 'Reorder At', width: 100, type: 'number' },
    { field: 'supplierName', headerName: 'Supplier', width: 160 },
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
                <Tooltip title="Edit Product">
                  <IconButton size="small" onClick={() => handleOpenEdit(params.row)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {params.row.isActive && (
                  <Tooltip title="Deactivate Product">
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
        title="Product Catalog"
        subtitle="Manage SKU catalog, selling prices, reorder thresholds, and active suppliers"
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New Product
            </Button>
          )
        }
      />

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} sx={{ mb: 2 }} />}

      {/* Filter and Search Bar */}
      <SearchToolbar search={search} onSearchChange={setSearch} placeholder="Search by name or SKU...">
        <TextField
          select
          size="small"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All Categories</MenuItem>
          <MenuItem value="Electronics">Electronics</MenuItem>
          <MenuItem value="Home Goods">Home Goods</MenuItem>
          <MenuItem value="Apparel">Apparel</MenuItem>
          <MenuItem value="Hardware">Hardware</MenuItem>
        </TextField>

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

      {/* Server-side DataGrid */}
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
          sortingMode="server"
          onSortModelChange={(newModel) => setSortModel(newModel)}
          pageSizeOptions={[10, 20, 50]}
          disableRowSelectionOnClick
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: 2,
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600 },
          }}
        />
      </Box>

      {/* Create / Edit Form Dialog */}
      <FormDialog
        open={dialogOpen}
        title={dialogMode === 'create' ? 'Create New Product (UC-07)' : 'Edit Product (UC-09)'}
        subtitle={
          dialogMode === 'create'
            ? 'Fill in required catalog details. SKU is immutable once created.'
            : `Editing product ${selectedProduct?.sku}. SKU cannot be changed.`
        }
        submitText={dialogMode === 'create' ? 'Create Product' : 'Save Changes'}
        loading={formLoading}
        error={formError}
        onSubmit={handleSubmitProduct}
        onClose={() => setDialogOpen(false)}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="SKU Code"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            disabled={dialogMode === 'edit'} // Immutable SKU (BR-04)
            error={Boolean(fieldErrors.sku)}
            helperText={
              fieldErrors.sku ||
              (dialogMode === 'edit' ? 'SKU cannot be modified after creation' : 'Unique SKU identifier (e.g. PROD-ELEC-001)')
            }
            required
          />

          <TextField
            fullWidth
            label="Product Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name}
            required
          />

          <TextField
            fullWidth
            label="Description"
            multiline
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              error={Boolean(fieldErrors.category)}
              helperText={fieldErrors.category}
              required
            />

            <TextField
              fullWidth
              select
              label="Supplier"
              value={formData.supplierId}
              onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
              error={Boolean(fieldErrors.supplierId)}
              helperText={fieldErrors.supplierId}
              required
            >
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.contactPerson || 'Vendor'})
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Selling Unit Price ($)"
              type="number"
              inputProps={{ min: 0, step: 0.01 }}
              value={formData.unitPrice}
              onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
              error={Boolean(fieldErrors.unitPrice)}
              helperText={fieldErrors.unitPrice}
              required
            />

            {canSeeCost && (
              <TextField
                fullWidth
                label="Cost Price ($)"
                type="number"
                inputProps={{ min: 0, step: 0.01 }}
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                error={Boolean(fieldErrors.costPrice)}
                helperText={fieldErrors.costPrice || 'Internal procurement cost'}
                required
              />
            )}
          </Box>

          <TextField
            fullWidth
            label="Reorder Threshold Quantity"
            type="number"
            inputProps={{ min: 0 }}
            value={formData.reorderLevel}
            onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
            error={Boolean(fieldErrors.reorderLevel)}
            helperText={fieldErrors.reorderLevel || 'Trigger alert when inventory falls to this amount'}
            required
          />
        </Box>
      </FormDialog>

      {/* Deactivate Product Confirmation Dialog (UC-10) */}
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate Product"
        content={
          productToDeactivate
            ? `Are you sure you want to deactivate "${productToDeactivate.name}" (${productToDeactivate.sku})? It will be hidden from staff and cannot be added to new orders.`
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
