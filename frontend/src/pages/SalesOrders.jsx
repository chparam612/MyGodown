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
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';

import { salesOrdersApi } from '../api/salesOrders.js';
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

export function SalesOrders() {
  const { user } = useAuth();

  // Role permissions
  const canCreate = can(user?.role, 'sales_orders:create');   // All roles (including staff)
  const canConfirm = can(user?.role, 'sales_orders:confirm'); // All roles
  const canFulfill = can(user?.role, 'sales_orders:fulfill'); // All roles
  const canCancel = can(user?.role, 'sales_orders:cancel');   // Admin, Manager (Staff forbidden 403)

  // Server-side query state
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Dropdown master lists
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);

  // Detail View Modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSO, setSelectedSO] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Create SO Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    customerName: '',
    warehouseId: '',
    notes: '',
    items: [{ productId: '', quantity: 1, unitPrice: '' }],
  });

  // Action Dialogs
  const [fulfillConfirmOpen, setFulfillConfirmOpen] = useState(false);
  const [fulfillTargetId, setFulfillTargetId] = useState(null);
  const [fulfillLoading, setFulfillLoading] = useState(false);
  const [fulfillError, setFulfillError] = useState(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Load master dropdown options
  const loadMasterData = useCallback(async () => {
    try {
      const [whRes, prodRes] = await Promise.all([
        warehousesApi.list({ isActive: 'true', limit: 100 }),
        productsApi.list({ isActive: 'true', limit: 200 }),
      ]);
      setWarehouses(whRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      console.error('[SalesOrders] Failed to load warehouses or products', err);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  // Fetch SO List
  const fetchSalesOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (warehouseFilter) params.warehouseId = warehouseFilter;

      const res = await salesOrdersApi.list(params);
      setRows(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, statusFilter, warehouseFilter]);

  useEffect(() => {
    fetchSalesOrders();
  }, [fetchSalesOrders]);

  // View Details (UC-29)
  const handleOpenDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await salesOrdersApi.getById(id);
      setSelectedSO(res.data);
    } catch (err) {
      setDetailError(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Create Modal (UC-28)
  const handleOpenCreate = () => {
    setFormData({
      customerName: '',
      warehouseId: warehouses[0]?.id ? String(warehouses[0].id) : '',
      notes: '',
      items: [{ productId: products[0]?.id ? String(products[0].id) : '', quantity: 1, unitPrice: products[0]?.unitPrice ?? '' }],
    });
    setFieldErrors({});
    setCreateError(null);
    setCreateOpen(true);
  };

  // Line Item Handlers
  const handleAddItem = () => {
    const firstProd = products[0];
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productId: firstProd ? String(firstProd.id) : '', quantity: 1, unitPrice: firstProd?.unitPrice ?? '' },
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

      if (field === 'productId') {
        const prod = products.find((p) => String(p.id) === String(value));
        if (prod && prod.unitPrice !== undefined) {
          updated[index].unitPrice = prod.unitPrice;
        }
      }
      return { ...prev, items: updated };
    });
  };

  // Computed total
  const computedTotal = formData.items.reduce((acc, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unitPrice) || 0;
    return acc + q * p;
  }, 0);

  // Submit Create SO
  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    setFieldErrors({});

    if (!formData.customerName.trim()) {
      setFieldErrors({ customerName: 'Customer name is required' });
      setCreateLoading(false);
      return;
    }

    if (formData.items.length === 0) {
      setCreateError(new Error('At least one order line item is required'));
      setCreateLoading(false);
      return;
    }

    const payload = {
      customerName: formData.customerName.trim(),
      warehouseId: Number(formData.warehouseId),
      notes: formData.notes.trim() || undefined,
      items: formData.items.map((it) => ({
        productId: Number(it.productId),
        quantity: parseInt(it.quantity, 10),
        unitPrice: it.unitPrice !== '' ? parseFloat(it.unitPrice) : undefined,
      })),
    };

    try {
      await salesOrdersApi.create(payload);
      setCreateOpen(false);
      fetchSalesOrders();
    } catch (err) {
      setCreateError(err);
      setFieldErrors(getFieldErrors(err));
    } finally {
      setCreateLoading(false);
    }
  };

  // Confirm SO (UC-30)
  const handleConfirmOrder = async (id) => {
    try {
      await salesOrdersApi.confirm(id);
      fetchSalesOrders();
      if (detailOpen && selectedSO?.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      setError(err);
    }
  };

  // Fulfill SO (UC-30: Atomic stock decrement + shortage 422 guard)
  const handleConfirmFulfill = async () => {
    if (!fulfillTargetId) return;
    setFulfillLoading(true);
    setFulfillError(null);
    try {
      await salesOrdersApi.fulfill(fulfillTargetId);
      setFulfillConfirmOpen(false);
      fetchSalesOrders();
      if (detailOpen && selectedSO?.id === fulfillTargetId) {
        handleOpenDetail(fulfillTargetId);
      }
    } catch (err) {
      setFulfillError(err);
    } finally {
      setFulfillLoading(false);
    }
  };

  // Cancel SO (UC-30: Admin & Manager only)
  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      await salesOrdersApi.cancel(cancelTargetId);
      setCancelConfirmOpen(false);
      fetchSalesOrders();
      if (detailOpen && selectedSO?.id === cancelTargetId) {
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
      field: 'soNumber',
      headerName: 'SO Number',
      width: 170,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, fontFamily: 'monospace', color: 'primary.main', cursor: 'pointer' }}
          onClick={() => handleOpenDetail(params.row.id)}
        >
          {params.row.soNumber}
        </Typography>
      ),
    },
    { field: 'customerName', headerName: 'Customer', flex: 1.4, minWidth: 160 },
    {
      field: 'warehouseName',
      headerName: 'Origin Warehouse',
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
      headerName: 'Total Value',
      width: 130,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => <MoneyText value={params.row.totalAmount} />,
    },
    {
      field: 'createdAt',
      headerName: 'Order Date',
      width: 140,
      valueFormatter: (value) => formatDate(value, 'MMM D, YYYY'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      sortable: false,
      renderCell: (params) => {
        const so = params.row;
        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Tooltip title="View Order Details">
              <IconButton size="small" color="primary" onClick={() => handleOpenDetail(so.id)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {canConfirm && so.status === 'draft' && (
              <Tooltip title="Confirm Sales Order">
                <IconButton size="small" color="info" onClick={() => handleConfirmOrder(so.id)}>
                  <CheckCircleOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {canFulfill && so.status === 'confirmed' && (
              <Tooltip title="Fulfill Order & Deduct Stock (UC-30)">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => {
                    setFulfillTargetId(so.id);
                    setFulfillError(null);
                    setFulfillConfirmOpen(true);
                  }}
                >
                  <DoneAllIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {canCancel && so.status !== 'fulfilled' && so.status !== 'cancelled' && (
              <Tooltip title="Cancel Sales Order">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    setCancelTargetId(so.id);
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
        title="Sales Orders"
        subtitle="Manage customer orders, draft allocations, outbound fulfillment, and dispatch tracking"
        action={
          canCreate && (
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              New Sales Order
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
              label="Search SO Number / Customer / Notes"
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
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="fulfilled">Fulfilled</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
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
              sx={{ minWidth: 200 }}
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
      {/* MODAL 1: CREATE SALES ORDER (UC-28)                               */}
      {/* ================================================================= */}
      <FormDialog
        open={createOpen}
        title="Create Sales Order (UC-28)"
        subtitle="Record draft customer order and specify origin fulfillment warehouse"
        submitText="Create Sales Order"
        loading={createLoading}
        error={createError}
        maxWidth="md"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleSubmitCreate}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Customer / Client Name"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                error={Boolean(fieldErrors.customerName)}
                helperText={fieldErrors.customerName}
                placeholder="e.g., Acme Retail Chain"
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Fulfillment Warehouse"
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

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes / Dispatch Remarks"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g., Expedited priority shipping, customer account #8812"
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
                  <TableCell width={140}>Unit Price ($)</TableCell>
                  <TableCell width={120} align="right">Line Subtotal</TableCell>
                  <TableCell width={60} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {formData.items.map((it, idx) => {
                  const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
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
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                          inputProps={{ min: 0, step: '0.01' }}
                          placeholder="Catalog price"
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
      {/* MODAL 2: DETAIL VIEW (UC-29)                                      */}
      {/* ================================================================= */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {selectedSO?.soNumber || 'Loading...'}
            </Typography>
            {selectedSO && <StatusChip status={selectedSO.status} />}
          </Box>
          {selectedSO && (
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>
              <MoneyText value={selectedSO.totalAmount} />
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

          {selectedSO && !detailLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Customer Name</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{selectedSO.customerName}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Fulfillment Warehouse</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {selectedSO.warehouseName} ({selectedSO.warehouseCode})
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Order Placed Date</Typography>
                  <Typography variant="body2">{formatDate(selectedSO.createdAt, 'MMM D, YYYY HH:mm')}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Created By</Typography>
                  <Typography variant="body2">{selectedSO.createdByName || `User #${selectedSO.createdBy}`}</Typography>
                </Grid>
                {selectedSO.notes && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Notes / Remarks</Typography>
                    <Typography variant="body2">{selectedSO.notes}</Typography>
                  </Grid>
                )}
              </Grid>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Order Line Items ({selectedSO.items?.length || 0})
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit Selling Price</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSO.items?.map((it) => (
                      <TableRow key={it.id || it.productId}>
                        <TableCell sx={{ fontWeight: 600 }}>{it.productName}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{it.productSku || it.sku}</TableCell>
                        <TableCell align="right">{it.quantity}</TableCell>
                        <TableCell align="right"><MoneyText value={it.unitPrice} /></TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}><MoneyText value={it.subtotal || it.quantity * it.unitPrice} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {canConfirm && selectedSO?.status === 'draft' && (
            <Button
              color="info"
              variant="outlined"
              onClick={() => handleConfirmOrder(selectedSO.id)}
            >
              Confirm Order
            </Button>
          )}

          {canFulfill && selectedSO?.status === 'confirmed' && (
            <Button
              color="success"
              variant="contained"
              startIcon={<DoneAllIcon />}
              onClick={() => {
                setFulfillTargetId(selectedSO.id);
                setFulfillError(null);
                setFulfillConfirmOpen(true);
              }}
            >
              Fulfill Order
            </Button>
          )}

          {canCancel && selectedSO?.status !== 'fulfilled' && selectedSO?.status !== 'cancelled' && (
            <Button
              color="error"
              onClick={() => {
                setCancelTargetId(selectedSO.id);
                setCancelError(null);
                setCancelConfirmOpen(true);
              }}
            >
              Cancel Order
            </Button>
          )}

          <Button onClick={() => setDetailOpen(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================= */}
      {/* DIALOG 3: CONFIRM FULFILLMENT (UC-30)                             */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={fulfillConfirmOpen}
        title="Fulfill Sales Order (UC-30)"
        message="Are you sure you want to fulfill this order? Warehouse inventory will be atomically decremented for each line item. If any item has insufficient physical stock, the operation will be rejected with an Insufficient Stock error."
        confirmText="Confirm & Deduct Stock"
        confirmColor="success"
        loading={fulfillLoading}
        error={fulfillError}
        onConfirm={handleConfirmFulfill}
        onCancel={() => setFulfillConfirmOpen(false)}
      />

      {/* ================================================================= */}
      {/* DIALOG 4: CONFIRM CANCEL SO (UC-30)                               */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel Sales Order"
        message="Are you sure you want to cancel this sales order? Stock will remain untouched. (Admin and Manager only)."
        confirmText="Cancel Order"
        confirmColor="error"
        loading={cancelLoading}
        error={cancelError}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </>
  );
}
