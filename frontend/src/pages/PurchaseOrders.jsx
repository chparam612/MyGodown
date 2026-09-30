import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { DataGrid } from '@mui/x-data-grid';

import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';

import { purchaseOrdersApi } from '../api/purchaseOrders.js';
import { suppliersApi } from '../api/suppliers.js';
import { warehousesApi } from '../api/warehouses.js';
import { productsApi } from '../api/products.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { ErrorAlert } from '../components/ErrorAlert.jsx';
import { FormDialog } from '../components/FormDialog.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { MoneyText } from '../components/MoneyText.jsx';
import { useAuth } from '../context/useAuth.js';
import { can } from '../utils/permissions.js';
import { formatDate } from '../utils/formatters.js';
import { getFieldErrors } from '../utils/errors.js';
import { DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export function PurchaseOrders() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'purchase_orders:create'); // Admin, Manager

  // Server-side query state
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Dropdown master lists
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);

  // Detail View Modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Create / Edit Form Modal
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    id: null,
    supplierId: '',
    warehouseId: '',
    expectedDeliveryDate: '',
    notes: '',
    status: 'draft',
    items: [{ productId: '', quantity: 1, unitCost: '' }],
  });

  // Action Dialogs (Confirm receive, confirm cancel)
  const [receiveConfirmOpen, setReceiveConfirmOpen] = useState(false);
  const [receiveTargetId, setReceiveTargetId] = useState(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveError, setReceiveError] = useState(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Load master dropdown options
  const loadMasterData = useCallback(async () => {
    try {
      const [supRes, whRes, prodRes] = await Promise.all([
        suppliersApi.list({ isActive: 'true', limit: 100 }),
        warehousesApi.list({ isActive: 'true', limit: 100 }),
        productsApi.list({ isActive: 'true', limit: 200 }),
      ]);
      setSuppliers(supRes.data || []);
      setWarehouses(whRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      console.error('[PurchaseOrders] Failed to load master dropdown data', err);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  // Fetch PO List
  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (warehouseFilter) params.warehouseId = warehouseFilter;

      const res = await purchaseOrdersApi.list(params);
      setRows(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, statusFilter, supplierFilter, warehouseFilter]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  // View Details (UC-26)
  const handleOpenDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await purchaseOrdersApi.getById(id);
      setSelectedPO(res.data);
    } catch (err) {
      setDetailError(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Create Modal (UC-25)
  const handleOpenCreate = () => {
    setFormMode('create');
    setFormData({
      id: null,
      supplierId: suppliers[0]?.id ? String(suppliers[0].id) : '',
      warehouseId: warehouses[0]?.id ? String(warehouses[0].id) : '',
      expectedDeliveryDate: '',
      notes: '',
      status: 'draft',
      items: [{ productId: products[0]?.id ? String(products[0].id) : '', quantity: 1, unitCost: products[0]?.costPrice ?? '' }],
    });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  };

  // Open Edit Modal (UC-P08)
  const handleOpenEdit = async (po) => {
    try {
      setFormLoading(true);
      const res = await purchaseOrdersApi.getById(po.id);
      const fullPO = res.data;
      setFormMode('edit');
      setFormData({
        id: fullPO.id,
        supplierId: String(fullPO.supplierId),
        warehouseId: String(fullPO.warehouseId),
        expectedDeliveryDate: fullPO.expectedDeliveryDate ? fullPO.expectedDeliveryDate.substring(0, 10) : '',
        notes: fullPO.notes || '',
        status: fullPO.status,
        items: fullPO.items?.map((it) => ({
          productId: String(it.productId),
          quantity: it.quantity,
          unitCost: it.unitCost,
        })) || [{ productId: '', quantity: 1, unitCost: '' }],
      });
      setFieldErrors({});
      setFormError(null);
      setFormOpen(true);
    } catch (err) {
      setError(err);
    } finally {
      setFormLoading(false);
    }
  };

  // Line Item Handlers
  const handleAddItem = () => {
    const firstProd = products[0];
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productId: firstProd ? String(firstProd.id) : '', quantity: 1, unitCost: firstProd?.costPrice ?? '' },
      ],
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      updated.splice(index, 1);
      return { ...prev, items: updated };
    });
  };

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };

      // Pre-fill unitCost if product changes
      if (field === 'productId') {
        const prod = products.find((p) => String(p.id) === String(value));
        if (prod && prod.costPrice !== undefined) {
          updated[index].unitCost = prod.costPrice;
        }
      }
      return { ...prev, items: updated };
    });
  };

  // Compute live total
  const computedTotal = formData.items.reduce((acc, it) => {
    const q = Number(it.quantity) || 0;
    const c = Number(it.unitCost) || 0;
    return acc + q * c;
  }, 0);

  // Submit PO (Create or Edit Draft)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFieldErrors({});

    // Validate line items
    if (formData.items.length === 0) {
      setFormError(new Error('At least one line item is required'));
      setFormLoading(false);
      return;
    }

    const payload = {
      supplierId: Number(formData.supplierId),
      warehouseId: Number(formData.warehouseId),
      notes: formData.notes.trim() || undefined,
      expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
      items: formData.items.map((it) => ({
        productId: Number(it.productId),
        quantity: parseInt(it.quantity, 10),
        unitCost: it.unitCost !== '' ? parseFloat(it.unitCost) : undefined,
      })),
    };

    try {
      if (formMode === 'create') {
        await purchaseOrdersApi.create({ ...payload, status: formData.status });
      } else {
        await purchaseOrdersApi.updateDraft(formData.id, payload);
      }
      setFormOpen(false);
      fetchPurchaseOrders();
      if (detailOpen && selectedPO?.id === formData.id) {
        handleOpenDetail(formData.id);
      }
    } catch (err) {
      setFormError(err);
      setFieldErrors(getFieldErrors(err));
    } finally {
      setFormLoading(false);
    }
  };

  // Transition to Ordered (UC-27)
  const handleMarkOrdered = async (id) => {
    try {
      await purchaseOrdersApi.markOrdered(id);
      fetchPurchaseOrders();
      if (detailOpen && selectedPO?.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      setError(err);
    }
  };

  // Receive Goods (UC-27)
  const handleConfirmReceive = async () => {
    if (!receiveTargetId) return;
    setReceiveLoading(true);
    setReceiveError(null);
    try {
      await purchaseOrdersApi.receive(receiveTargetId);
      setReceiveConfirmOpen(false);
      fetchPurchaseOrders();
      if (detailOpen && selectedPO?.id === receiveTargetId) {
        handleOpenDetail(receiveTargetId);
      }
    } catch (err) {
      setReceiveError(err);
    } finally {
      setReceiveLoading(false);
    }
  };

  // Cancel PO (UC-27)
  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      await purchaseOrdersApi.cancel(cancelTargetId);
      setCancelConfirmOpen(false);
      fetchPurchaseOrders();
      if (detailOpen && selectedPO?.id === cancelTargetId) {
        handleOpenDetail(cancelTargetId);
      }
    } catch (err) {
      setCancelError(err);
    } finally {
      setCancelLoading(false);
    }
  };

  // DataGrid Columns
  const columns = [
    {
      field: 'poNumber',
      headerName: 'PO Number',
      width: 170,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, fontFamily: 'monospace', color: 'primary.main', cursor: 'pointer' }}
          onClick={() => handleOpenDetail(params.row.id)}
        >
          {params.row.poNumber}
        </Typography>
      ),
    },
    { field: 'supplierName', headerName: 'Supplier', flex: 1.3, minWidth: 160 },
    {
      field: 'warehouseName',
      headerName: 'Destination Warehouse',
      flex: 1.2,
      minWidth: 150,
      renderCell: (params) => (
        <span>{params.row.warehouseName} ({params.row.warehouseCode})</span>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => <StatusChip status={params.row.status} />,
    },
    {
      field: 'totalAmount',
      headerName: 'Total Cost',
      width: 130,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => <MoneyText value={params.row.totalAmount} />,
    },
    {
      field: 'expectedDeliveryDate',
      headerName: 'Expected Delivery',
      width: 150,
      valueFormatter: (value) => formatDate(value, 'MMM D, YYYY'),
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 130,
      valueFormatter: (value) => formatDate(value, 'MMM D, YYYY'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      renderCell: (params) => {
        const po = params.row;
        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Tooltip title="View Order Details">
              <IconButton size="small" color="primary" onClick={() => handleOpenDetail(po.id)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {canManage && po.status === 'draft' && (
              <>
                <Tooltip title="Edit Draft PO (UC-P08)">
                  <IconButton size="small" color="secondary" onClick={() => handleOpenEdit(po)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Mark as Ordered">
                  <IconButton size="small" color="info" onClick={() => handleMarkOrdered(po.id)}>
                    <LocalShippingIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}

            {canManage && po.status === 'ordered' && (
              <Tooltip title="Receive Goods into Inventory (UC-27)">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => {
                    setReceiveTargetId(po.id);
                    setReceiveError(null);
                    setReceiveConfirmOpen(true);
                  }}
                >
                  <CheckCircleOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {canManage && po.status !== 'received' && po.status !== 'cancelled' && (
              <Tooltip title="Cancel Purchase Order">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    setCancelTargetId(po.id);
                    setCancelError(null);
                    setCancelConfirmOpen(true);
                  }}
                >
                  <CancelOutlinedIcon fontSize="small" />
                </IconButton>
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
        title="Purchase Orders"
        subtitle="Manage inbound supplier procurement, draft orders, goods receipt, and cost tracking"
        action={
          canManage && (
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New Purchase Order
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
              label="Search PO Number / Notes"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              sx={{ minWidth: 260 }}
            />

            <TextField
              select
              size="small"
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="ordered">Ordered</MenuItem>
              <MenuItem value="received">Received</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Supplier"
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All Suppliers</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Warehouse"
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setMeta((prev) => ({ ...prev, page: 1 }));
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All Warehouses</MenuItem>
              {warehouses.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ ml: 'auto' }}>
              <Typography variant="caption" color="text.secondary">
                Total Orders: <strong>{meta.total}</strong>
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
      {/* MODAL 1: CREATE / EDIT PO (UC-25, UC-P08)                         */}
      {/* ================================================================= */}
      <FormDialog
        open={formOpen}
        title={formMode === 'create' ? 'Create Purchase Order (UC-25)' : `Edit Draft PO: ${selectedPO?.poNumber || ''}`}
        subtitle="Specify procurement source, destination warehouse, and line items"
        submitText={formMode === 'create' ? 'Create Order' : 'Update Draft'}
        loading={formLoading}
        error={formError}
        maxWidth="md"
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmitForm}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Supplier"
                value={formData.supplierId}
                onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                error={Boolean(fieldErrors.supplierId)}
                helperText={fieldErrors.supplierId}
                required
              >
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Destination Warehouse"
                value={formData.warehouseId}
                onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                error={Boolean(fieldErrors.warehouseId)}
                helperText={fieldErrors.warehouseId}
                required
              >
                {warehouses.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Expected Delivery Date"
                value={formData.expectedDeliveryDate}
                onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {formMode === 'create' && (
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label="Initial Order Status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <MenuItem value="draft">Draft (Work in progress)</MenuItem>
                  <MenuItem value="ordered">Ordered (Committed to supplier)</MenuItem>
                </TextField>
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes / Instructions"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g., Deliver to Loading Dock 3, Net-30 payment terms"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 1 }} />

          {/* Line items table */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Order Line Items
            </Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={handleAddItem}>
              Add Product Line
            </Button>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 220 }}>Product</TableCell>
                  <TableCell width={120}>Quantity</TableCell>
                  <TableCell width={140}>Unit Cost ($)</TableCell>
                  <TableCell width={120} align="right">Line Subtotal</TableCell>
                  <TableCell width={60} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {formData.items.map((it, idx) => {
                  const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitCost) || 0);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <TextField
                          select
                          fullWidth
                          size="small"
                          value={it.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          required
                        >
                          {products.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          type="number"
                          size="small"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          inputProps={{ min: 1 }}
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          type="number"
                          size="small"
                          value={it.unitCost}
                          onChange={(e) => handleItemChange(idx, 'unitCost', e.target.value)}
                          inputProps={{ min: 0, step: '0.01' }}
                          placeholder="Catalog cost"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        <MoneyText value={lineTotal} />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={formData.items.length === 1}
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 1 }}>
            <Typography variant="subtitle1">
              Estimated Total Order Value: <strong><MoneyText value={computedTotal} /></strong>
            </Typography>
          </Box>
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* MODAL 2: DETAIL VIEW (UC-26)                                      */}
      {/* ================================================================= */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {selectedPO?.poNumber || 'Loading...'}
            </Typography>
            {selectedPO && <StatusChip status={selectedPO.status} />}
          </Box>
          {selectedPO && (
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>
              <MoneyText value={selectedPO.totalAmount} />
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {detailError && <ErrorAlert error={detailError} sx={{ mb: 2 }} />}

          {selectedPO && !detailLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Supplier</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{selectedPO.supplierName}</Typography>
                  <Typography variant="body2" color="text.secondary">{selectedPO.supplierEmail || ''}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Destination Warehouse</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {selectedPO.warehouseName} ({selectedPO.warehouseCode})
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Expected Delivery Date</Typography>
                  <Typography variant="body2">{formatDate(selectedPO.expectedDeliveryDate, 'MMM D, YYYY')}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Created By / Date</Typography>
                  <Typography variant="body2">{selectedPO.createdByName || `User #${selectedPO.createdBy}`} on {formatDate(selectedPO.createdAt)}</Typography>
                </Grid>
                {selectedPO.notes && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography variant="body2">{selectedPO.notes}</Typography>
                  </Grid>
                )}
              </Grid>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Order Line Items ({selectedPO.items?.length || 0})
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit Cost</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedPO.items?.map((it) => (
                      <TableRow key={it.id || it.productId}>
                        <TableCell sx={{ fontWeight: 600 }}>{it.productName}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{it.productSku || it.sku}</TableCell>
                        <TableCell align="right">{it.quantity}</TableCell>
                        <TableCell align="right"><MoneyText value={it.unitCost} /></TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}><MoneyText value={it.subtotal || it.quantity * it.unitCost} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {canManage && selectedPO?.status === 'draft' && (
            <>
              <Button color="secondary" onClick={() => { setDetailOpen(false); handleOpenEdit(selectedPO); }}>
                Edit Draft
              </Button>
              <Button color="info" variant="outlined" onClick={() => handleMarkOrdered(selectedPO.id)}>
                Mark Ordered
              </Button>
            </>
          )}

          {canManage && selectedPO?.status === 'ordered' && (
            <Button
              color="success"
              variant="contained"
              startIcon={<CheckCircleOutlinedIcon />}
              onClick={() => {
                setReceiveTargetId(selectedPO.id);
                setReceiveError(null);
                setReceiveConfirmOpen(true);
              }}
            >
              Receive Goods
            </Button>
          )}

          {canManage && selectedPO?.status !== 'received' && selectedPO?.status !== 'cancelled' && (
            <Button
              color="error"
              onClick={() => {
                setCancelTargetId(selectedPO.id);
                setCancelError(null);
                setCancelConfirmOpen(true);
              }}
            >
              Cancel PO
            </Button>
          )}

          <Button onClick={() => setDetailOpen(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================= */}
      {/* DIALOG 3: CONFIRM GOODS RECEIPT (UC-27)                           */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={receiveConfirmOpen}
        title="Receive Purchase Order Goods (UC-27)"
        message={`Are you sure you want to receive this order? This adds stock to ${
          rows.find((r) => r.id === receiveTargetId)?.warehouseName ||
          selectedPO?.warehouseName ||
          'the destination warehouse'
        } and cannot be undone.`}
        confirmText="Confirm Receipt & Restock"
        confirmColor="success"
        loading={receiveLoading}
        error={receiveError}
        onConfirm={handleConfirmReceive}
        onCancel={() => setReceiveConfirmOpen(false)}
      />

      {/* ================================================================= */}
      {/* DIALOG 4: CONFIRM CANCEL PO (UC-27)                               */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel Purchase Order"
        message="Are you sure you want to cancel this purchase order? This action is terminal and will prevent goods from being received."
        confirmText="Cancel Purchase Order"
        confirmColor="error"
        loading={cancelLoading}
        error={cancelError}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </>
  );
}
