import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { DataGrid } from '@mui/x-data-grid';

import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';

import { inventoryApi } from '../api/inventory.js';
import { productsApi } from '../api/products.js';
import { warehousesApi } from '../api/warehouses.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { ErrorAlert } from '../components/ErrorAlert.jsx';
import { FormDialog } from '../components/FormDialog.jsx';
import { MoneyText } from '../components/MoneyText.jsx';
import { useAuth } from '../context/useAuth.js';
import { can } from '../utils/permissions.js';
import { formatDate } from '../utils/formatters.js';
import { getFieldErrors } from '../utils/errors.js';
import { DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export function Inventory() {
  const { user } = useAuth();

  // Role permissions
  const canSeeCost = can(user?.role, 'inventory:view_cost'); // Admin, Manager
  const canAdjust = can(user?.role, 'inventory:adjust');       // Admin, Manager
  const canTransfer = can(user?.role, 'inventory:transfer');   // Admin, Manager
  const canRecord = can(user?.role, 'inventory:record_movement'); // Admin, Manager, Staff

  // Active Tab: 0 = Stock Levels, 1 = Movement Ledger, 2 = Low Stock Alerts
  const [activeTab, setActiveTab] = useState(0);

  // Master lookups for modal pickers
  const [allProducts, setAllProducts] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);

  // =========================================================================
  // TAB 0: Stock Levels State
  // =========================================================================
  const [stockRows, setStockRows] = useState([]);
  const [stockMeta, setStockMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState(null);
  const [stockSearch, setStockSearch] = useState('');
  const [stockWarehouseFilter, setStockWarehouseFilter] = useState('');
  const [stockProductFilter, setStockProductFilter] = useState('');
  const [stockLowOnly, setStockLowOnly] = useState(false);

  // =========================================================================
  // TAB 1: Movement Ledger State
  // =========================================================================
  const [movementRows, setMovementRows] = useState([]);
  const [movementMeta, setMovementMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementError, setMovementError] = useState(null);
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState('');
  const [movementProductFilter, setMovementProductFilter] = useState('');
  const [movementStartDate, setMovementStartDate] = useState('');
  const [movementEndDate, setMovementEndDate] = useState('');

  // =========================================================================
  // TAB 2: Low Stock Monitor State
  // =========================================================================
  const [lowRows, setLowRows] = useState([]);
  const [lowMeta, setLowMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 });
  const [lowLoading, setLowLoading] = useState(false);
  const [lowError, setLowError] = useState(null);
  const [lowWarehouseFilter, setLowWarehouseFilter] = useState('');

  // =========================================================================
  // MODALS STATE
  // =========================================================================
  // 1. Availability Check Modal (UC-15)
  const [availOpen, setAvailOpen] = useState(false);
  const [availProduct, setAvailProduct] = useState('');
  const [availWarehouse, setAvailWarehouse] = useState('');
  const [availQuantity, setAvailQuantity] = useState('');
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState(null);
  const [availResult, setAvailResult] = useState(null);

  // 2. Record Movement Modal (UC-16)
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState(null);
  const [moveFieldErrors, setMoveFieldErrors] = useState({});
  const [moveData, setMoveData] = useState({
    productId: '',
    warehouseId: '',
    movementType: 'in',
    quantity: '',
    reference: '',
  });

  // 3. Adjust Stock Modal (UC-17)
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState(null);
  const [adjFieldErrors, setAdjFieldErrors] = useState({});
  const [adjData, setAdjData] = useState({
    productId: '',
    warehouseId: '',
    countedQuantity: '',
    reason: '',
  });

  // 4. Transfer Stock Modal (UC-18)
  const [transOpen, setTransOpen] = useState(false);
  const [transLoading, setTransLoading] = useState(false);
  const [transError, setTransError] = useState(null);
  const [transFieldErrors, setTransFieldErrors] = useState({});
  const [transData, setTransData] = useState({
    productId: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    quantity: '',
    reason: '',
  });

  // =========================================================================
  // LOAD MASTER PRODUCTS & WAREHOUSES
  // =========================================================================
  const loadMasterData = useCallback(async () => {
    try {
      const [prodRes, whRes] = await Promise.all([
        productsApi.list({ isActive: 'true', limit: 200 }),
        warehousesApi.list({ isActive: 'true', limit: 100 }),
      ]);
      setAllProducts(prodRes.data || []);
      setAllWarehouses(whRes.data || []);
    } catch (err) {
      console.error('[Inventory] Failed to load products or warehouses for pickers', err);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  // =========================================================================
  // FETCH STOCK LEVELS (UC-14)
  // =========================================================================
  const fetchStock = useCallback(async () => {
    setStockLoading(true);
    setStockError(null);
    try {
      const params = {
        page: stockMeta.page,
        limit: stockMeta.limit,
      };
      if (stockSearch.trim()) params.search = stockSearch.trim();
      if (stockWarehouseFilter) params.warehouseId = stockWarehouseFilter;
      if (stockProductFilter) params.productId = stockProductFilter;
      if (stockLowOnly) params.lowStock = 'true';

      const res = await inventoryApi.listStock(params);
      setStockRows(res.data || []);
      if (res.meta) setStockMeta(res.meta);
    } catch (err) {
      setStockError(err);
    } finally {
      setStockLoading(false);
    }
  }, [stockMeta.page, stockMeta.limit, stockSearch, stockWarehouseFilter, stockProductFilter, stockLowOnly]);

  // =========================================================================
  // FETCH MOVEMENT LEDGER (UC-19)
  // =========================================================================
  const fetchMovements = useCallback(async () => {
    setMovementLoading(true);
    setMovementError(null);
    try {
      const params = {
        page: movementMeta.page,
        limit: movementMeta.limit,
      };
      if (movementSearch.trim()) params.search = movementSearch.trim();
      if (movementTypeFilter) params.type = movementTypeFilter;
      if (movementWarehouseFilter) params.warehouseId = movementWarehouseFilter;
      if (movementProductFilter) params.productId = movementProductFilter;
      if (movementStartDate) params.startDate = movementStartDate;
      if (movementEndDate) params.endDate = movementEndDate;

      const res = await inventoryApi.listMovements(params);
      setMovementRows(res.data || []);
      if (res.meta) setMovementMeta(res.meta);
    } catch (err) {
      setMovementError(err);
    } finally {
      setMovementLoading(false);
    }
  }, [movementMeta.page, movementMeta.limit, movementSearch, movementTypeFilter, movementWarehouseFilter, movementProductFilter, movementStartDate, movementEndDate]);

  // =========================================================================
  // FETCH LOW STOCK ALERTS (UC-20)
  // =========================================================================
  const fetchLowStock = useCallback(async () => {
    setLowLoading(true);
    setLowError(null);
    try {
      const params = {
        page: lowMeta.page,
        limit: lowMeta.limit,
      };
      if (lowWarehouseFilter) params.warehouseId = lowWarehouseFilter;

      const res = await inventoryApi.listLowStock(params);
      setLowRows(res.data || []);
      if (res.meta) setLowMeta(res.meta);
    } catch (err) {
      setLowError(err);
    } finally {
      setLowLoading(false);
    }
  }, [lowMeta.page, lowMeta.limit, lowWarehouseFilter]);

  // Isolated tab triggers (prevent cross-tab effect execution)
  useEffect(() => {
    if (activeTab === 0) fetchStock();
  }, [activeTab, fetchStock]);

  useEffect(() => {
    if (activeTab === 1) fetchMovements();
  }, [activeTab, fetchMovements]);

  useEffect(() => {
    if (activeTab === 2) fetchLowStock();
  }, [activeTab, fetchLowStock]);

  // =========================================================================
  // HANDLERS: Availability Check (UC-15)
  // =========================================================================
  const handleOpenAvail = (prefillProductId = '') => {
    setAvailProduct(prefillProductId ? String(prefillProductId) : (allProducts[0]?.id ? String(allProducts[0].id) : ''));
    setAvailWarehouse('');
    setAvailQuantity('');
    setAvailResult(null);
    setAvailError(null);
    setAvailOpen(true);
  };

  const handleCheckAvail = async (e) => {
    e.preventDefault();
    if (!availProduct) return;
    setAvailLoading(true);
    setAvailError(null);
    setAvailResult(null);
    try {
      const params = { productId: availProduct };
      if (availWarehouse) params.warehouseId = availWarehouse;
      if (availQuantity && Number(availQuantity) > 0) params.quantity = availQuantity;

      const res = await inventoryApi.checkAvailability(params);
      setAvailResult(res.data);
    } catch (err) {
      setAvailError(err);
    } finally {
      setAvailLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: Record Movement (UC-16)
  // =========================================================================
  const handleOpenMove = (prefill = {}) => {
    setMoveData({
      productId: prefill.productId ? String(prefill.productId) : (allProducts[0]?.id ? String(allProducts[0].id) : ''),
      warehouseId: prefill.warehouseId ? String(prefill.warehouseId) : (allWarehouses[0]?.id ? String(allWarehouses[0].id) : ''),
      movementType: 'in',
      quantity: '',
      reference: '',
    });
    setMoveError(null);
    setMoveFieldErrors({});
    setMoveOpen(true);
  };

  const handleSubmitMove = async (e) => {
    e.preventDefault();
    setMoveLoading(true);
    setMoveError(null);
    setMoveFieldErrors({});

    const qty = parseInt(moveData.quantity, 10);
    if (!qty || qty <= 0) {
      setMoveFieldErrors({ quantity: 'Movement quantity must be greater than zero' });
      setMoveLoading(false);
      return;
    }

    try {
      await inventoryApi.recordMovement({
        productId: Number(moveData.productId),
        warehouseId: Number(moveData.warehouseId),
        movementType: moveData.movementType,
        quantity: qty,
        reference: moveData.reference.trim() || undefined,
      });
      setMoveOpen(false);
      fetchStock();
      if (activeTab === 1) fetchMovements();
    } catch (err) {
      setMoveError(err);
      setMoveFieldErrors(getFieldErrors(err));
    } finally {
      setMoveLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: Adjust Stock (UC-17)
  // =========================================================================
  const handleOpenAdjust = (prefill = {}) => {
    setAdjData({
      productId: prefill.productId ? String(prefill.productId) : (allProducts[0]?.id ? String(allProducts[0].id) : ''),
      warehouseId: prefill.warehouseId ? String(prefill.warehouseId) : (allWarehouses[0]?.id ? String(allWarehouses[0].id) : ''),
      countedQuantity: prefill.quantity !== undefined ? String(prefill.quantity) : '',
      reason: '',
    });
    setAdjError(null);
    setAdjFieldErrors({});
    setAdjOpen(true);
  };

  const handleSubmitAdjust = async (e) => {
    e.preventDefault();
    setAdjLoading(true);
    setAdjError(null);
    setAdjFieldErrors({});

    const countQty = parseInt(adjData.countedQuantity, 10);
    if (isNaN(countQty) || countQty < 0) {
      setAdjFieldErrors({ countedQuantity: 'Counted quantity cannot be negative' });
      setAdjLoading(false);
      return;
    }
    if (!adjData.reason.trim() || adjData.reason.trim().length < 3) {
      setAdjFieldErrors({ reason: 'Audit adjustment reason is required (min 3 characters)' });
      setAdjLoading(false);
      return;
    }

    try {
      await inventoryApi.adjustStock({
        productId: Number(adjData.productId),
        warehouseId: Number(adjData.warehouseId),
        countedQuantity: countQty,
        reason: adjData.reason.trim(),
      });
      setAdjOpen(false);
      fetchStock();
      if (activeTab === 1) fetchMovements();
      if (activeTab === 2) fetchLowStock();
    } catch (err) {
      setAdjError(err);
      setAdjFieldErrors(getFieldErrors(err));
    } finally {
      setAdjLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: Transfer Stock (UC-18)
  // =========================================================================
  const handleOpenTransfer = (prefill = {}) => {
    const srcId = prefill.warehouseId ? String(prefill.warehouseId) : (allWarehouses[0]?.id ? String(allWarehouses[0].id) : '');
    const dstCandidate = allWarehouses.find((w) => String(w.id) !== srcId);
    setTransData({
      productId: prefill.productId ? String(prefill.productId) : (allProducts[0]?.id ? String(allProducts[0].id) : ''),
      sourceWarehouseId: srcId,
      destinationWarehouseId: dstCandidate ? String(dstCandidate.id) : '',
      quantity: '',
      reason: '',
    });
    setTransError(null);
    setTransFieldErrors({});
    setTransOpen(true);
  };

  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    setTransLoading(true);
    setTransError(null);
    setTransFieldErrors({});

    if (transData.sourceWarehouseId === transData.destinationWarehouseId) {
      setTransFieldErrors({ destinationWarehouseId: 'Destination warehouse must differ from source warehouse' });
      setTransLoading(false);
      return;
    }

    const qty = parseInt(transData.quantity, 10);
    if (!qty || qty <= 0) {
      setTransFieldErrors({ quantity: 'Transfer quantity must be greater than zero' });
      setTransLoading(false);
      return;
    }

    try {
      await inventoryApi.transferStock({
        productId: Number(transData.productId),
        sourceWarehouseId: Number(transData.sourceWarehouseId),
        destinationWarehouseId: Number(transData.destinationWarehouseId),
        quantity: qty,
        reason: transData.reason.trim() || undefined,
      });
      setTransOpen(false);
      fetchStock();
      if (activeTab === 1) fetchMovements();
    } catch (err) {
      setTransError(err);
      setTransFieldErrors(getFieldErrors(err));
    } finally {
      setTransLoading(false);
    }
  };

  // =========================================================================
  // DATAGRID COLUMN DEFINITIONS
  // =========================================================================
  // 1. Stock Levels Columns
  const stockColumns = [
    {
      field: 'productName',
      headerName: 'Product',
      flex: 1.5,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {params.row.productName}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
            {params.row.sku}
          </Typography>
        </Box>
      ),
    },
    { field: 'category', headerName: 'Category', width: 140 },
    {
      field: 'warehouseName',
      headerName: 'Warehouse',
      flex: 1.2,
      minWidth: 150,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <span>{params.row.warehouseName}</span>
          <Chip label={params.row.warehouseCode} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
        </Box>
      ),
    },
    {
      field: 'quantity',
      headerName: 'Quantity',
      width: 120,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => {
        const isLow = params.row.quantity <= params.row.reorderLevel;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, width: '100%' }}>
            {isLow && <WarningAmberIcon fontSize="small" color="warning" />}
            <Typography variant="body2" sx={{ fontWeight: isLow ? 700 : 500, color: isLow ? 'warning.dark' : 'text.primary' }}>
              {params.row.quantity.toLocaleString()}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'reorderLevel',
      headerName: 'Reorder Level',
      width: 120,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
    },
    {
      field: 'status',
      headerName: 'Stock Status',
      width: 130,
      renderCell: (params) => {
        const isLow = params.row.quantity <= params.row.reorderLevel;
        return isLow ? (
          <Chip label="Low Stock" color="warning" size="small" variant="filled" />
        ) : (
          <Chip label="Optimal" color="success" size="small" variant="outlined" />
        );
      },
    },
    {
      field: 'unitPrice',
      headerName: 'Selling Price',
      width: 120,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => <MoneyText value={params.row.unitPrice} />,
    },
    ...(canSeeCost
      ? [
          {
            field: 'costPrice',
            headerName: 'Cost Price',
            width: 120,
            headerAlign: 'right',
            align: 'right',
            renderCell: (params) => <MoneyText value={params.row.costPrice} />,
          },
        ]
      : []),
    {
      field: 'updatedAt',
      headerName: 'Updated',
      width: 140,
      valueFormatter: (value) => formatDate(value, 'MMM D, YYYY'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {canAdjust && (
            <Tooltip title="Cycle Count / Adjust Stock">
              <IconButton size="small" color="primary" onClick={() => handleOpenAdjust(params.row)}>
                <TuneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canTransfer && (
            <Tooltip title="Transfer Stock to Warehouse">
              <IconButton size="small" color="secondary" onClick={() => handleOpenTransfer(params.row)}>
                <SwapHorizIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Check Availability">
            <IconButton size="small" color="info" onClick={() => handleOpenAvail(params.row.productId)}>
              <CheckCircleOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  // 2. Movement Ledger Columns
  const movementColumns = [
    {
      field: 'createdAt',
      headerName: 'Timestamp',
      width: 160,
      valueFormatter: (value) => formatDate(value, 'YYYY-MM-DD HH:mm'),
    },
    {
      field: 'productName',
      headerName: 'Product',
      flex: 1.5,
      minWidth: 170,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.row.productName}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{params.row.productSku}</Typography>
        </Box>
      ),
    },
    {
      field: 'warehouseName',
      headerName: 'Warehouse',
      flex: 1.2,
      minWidth: 140,
      renderCell: (params) => (
        <span>{params.row.warehouseName} ({params.row.warehouseCode})</span>
      ),
    },
    {
      field: 'movementType',
      headerName: 'Type',
      width: 140,
      renderCell: (params) => <StatusChip status={params.row.movementType} />,
    },
    {
      field: 'quantity',
      headerName: 'Delta / Qty',
      width: 120,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => {
        const t = params.row.movementType;
        const sign = t === 'in' || t === 'purchase_order' ? '+' : (t === 'out' || t === 'sales_order' ? '-' : '');
        const color = sign === '+' ? 'success.main' : (sign === '-' ? 'error.main' : 'text.primary');
        return (
          <Typography variant="body2" sx={{ fontWeight: 700, color }}>
            {sign}{params.row.quantity.toLocaleString()}
          </Typography>
        );
      },
    },
    {
      field: 'referenceType',
      headerName: 'Reference Type',
      width: 150,
      renderCell: (params) => <StatusChip status={params.row.referenceType} />,
    },
    {
      field: 'reference',
      headerName: 'Reference / Reason',
      flex: 1.5,
      minWidth: 160,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontStyle: params.row.reference ? 'normal' : 'italic', color: params.row.reference ? 'text.primary' : 'text.disabled' }}>
          {params.row.reference || (params.row.referenceId ? `Ref #${params.row.referenceId}` : 'No audit note')}
        </Typography>
      ),
    },
    {
      field: 'userName',
      headerName: 'Operator',
      width: 130,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {params.row.userName || `User #${params.row.userId}`}
        </Typography>
      ),
    },
  ];

  // 3. Low Stock Monitor Columns
  const lowColumns = [
    {
      field: 'productName',
      headerName: 'Product',
      flex: 1.5,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {params.row.productName}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
            {params.row.sku}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'warehouseName',
      headerName: 'Warehouse',
      flex: 1.2,
      minWidth: 140,
      renderCell: (params) => `${params.row.warehouseName} (${params.row.warehouseCode})`,
    },
    {
      field: 'quantity',
      headerName: 'Current Stock',
      width: 120,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
          {params.row.quantity}
        </Typography>
      ),
    },
    {
      field: 'reorderLevel',
      headerName: 'Reorder Level',
      width: 120,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
    },
    {
      field: 'deficit',
      headerName: 'Deficit Needed',
      width: 130,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Chip
          label={`-${params.row.deficit} units`}
          color="error"
          size="small"
          sx={{ fontWeight: 700 }}
        />
      ),
    },
    {
      field: 'supplierName',
      headerName: 'Primary Supplier',
      flex: 1.2,
      minWidth: 150,
      renderCell: (params) => params.row.supplierName || '—',
    },
    ...(canSeeCost
      ? [
          {
            field: 'costPrice',
            headerName: 'Cost Price',
            width: 120,
            headerAlign: 'right',
            align: 'right',
            renderCell: (params) => <MoneyText value={params.row.costPrice} />,
          },
        ]
      : []),
    {
      field: 'actions',
      headerName: 'Restock Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Inbound Restock Movement">
            <IconButton size="small" color="primary" onClick={() => handleOpenMove(params.row)}>
              <MoveToInboxIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {canTransfer && (
            <Tooltip title="Transfer Stock In">
              <IconButton size="small" color="secondary" onClick={() => handleOpenTransfer(params.row)}>
                <SwapHorizIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory Operations"
        subtitle="Manage warehouse stock balances, cycle count adjustments, transfers, and movement audit logs"
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              color="info"
              startIcon={<CheckCircleOutlinedIcon />}
              onClick={() => handleOpenAvail()}
            >
              Check Availability
            </Button>
            {canRecord && (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<MoveToInboxIcon />}
                onClick={() => handleOpenMove()}
              >
                Record Movement
              </Button>
            )}
            {canAdjust && (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<TuneIcon />}
                onClick={() => handleOpenAdjust()}
              >
                Adjust Stock
              </Button>
            )}
            {canTransfer && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<SwapHorizIcon />}
                onClick={() => handleOpenTransfer()}
              >
                Transfer Stock
              </Button>
            )}
          </Box>
        }
      />

      {/* Tabs navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab icon={<Inventory2OutlinedIcon />} iconPosition="start" label="Stock Balances (UC-14)" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Movement Ledger (UC-19)" />
          <Tab
            icon={<WarningAmberIcon />}
            iconPosition="start"
            label="Low Stock Alerts (UC-20)"
            sx={{ color: lowMeta.total > 0 ? 'warning.main' : 'inherit' }}
          />
        </Tabs>
      </Box>

      {/* ================================================================= */}
      {/* TAB 0: STOCK LEVELS                                               */}
      {/* ================================================================= */}
      {activeTab === 0 && (
        <Box>
          {/* Filters Bar */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                  size="small"
                  label="Search product or SKU"
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  InputProps={{
                    startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                  sx={{ minWidth: 260 }}
                />

                <TextField
                  select
                  size="small"
                  label="Warehouse"
                  value={stockWarehouseFilter}
                  onChange={(e) => {
                    setStockWarehouseFilter(e.target.value);
                    setStockMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All Warehouses</MenuItem>
                  {allWarehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Product"
                  value={stockProductFilter}
                  onChange={(e) => {
                    setStockProductFilter(e.target.value);
                    setStockMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">All Products</MenuItem>
                  {allProducts.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </MenuItem>
                  ))}
                </TextField>

                <FormControlLabel
                  control={
                    <Switch
                      checked={stockLowOnly}
                      onChange={(e) => {
                        setStockLowOnly(e.target.checked);
                        setStockMeta((prev) => ({ ...prev, page: 1 }));
                      }}
                      color="warning"
                    />
                  }
                  label="Show Low Stock Only"
                />

                <Box sx={{ ml: 'auto' }}>
                  <Typography variant="caption" color="text.secondary">
                    Total stock records: <strong>{stockMeta.total}</strong>
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {stockError && <ErrorAlert error={stockError} sx={{ mb: 2 }} />}

          <Card variant="outlined">
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={stockRows}
                columns={stockColumns}
                loading={stockLoading}
                rowCount={stockMeta.total}
                paginationMode="server"
                paginationModel={{
                  page: Math.max(0, stockMeta.page - 1),
                  pageSize: stockMeta.limit,
                }}
                onPaginationModelChange={(newModel) => {
                  setStockMeta((prev) => ({
                    ...prev,
                    page: newModel.page + 1,
                    limit: newModel.pageSize,
                  }));
                }}
                pageSizeOptions={[10, 20, 50]}
                disableRowSelectionOnClick
                getRowClassName={(params) =>
                  params.row.quantity <= params.row.reorderLevel ? 'inventory-row-low' : ''
                }
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-cell:focus': { outline: 'none' },
                  '& .inventory-row-low': {
                    bgcolor: 'rgba(237, 108, 2, 0.08)',
                    '&:hover': { bgcolor: 'rgba(237, 108, 2, 0.16)' },
                  },
                }}
              />
            </Box>
          </Card>
        </Box>
      )}

      {/* ================================================================= */}
      {/* TAB 1: MOVEMENT LEDGER (UC-19)                                    */}
      {/* ================================================================= */}
      {activeTab === 1 && (
        <Box>
          {/* Movement Filters Bar */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                  size="small"
                  label="Search Reference / Notes"
                  value={movementSearch}
                  onChange={(e) => {
                    setMovementSearch(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  InputProps={{
                    startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                  sx={{ minWidth: 220 }}
                />

                <TextField
                  select
                  size="small"
                  label="Product"
                  value={movementProductFilter}
                  onChange={(e) => {
                    setMovementProductFilter(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All Products</MenuItem>
                  {allProducts.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Warehouse"
                  value={movementWarehouseFilter}
                  onChange={(e) => {
                    setMovementWarehouseFilter(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">All Warehouses</MenuItem>
                  {allWarehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Movement Type"
                  value={movementTypeFilter}
                  onChange={(e) => {
                    setMovementTypeFilter(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="">All Movement Types</MenuItem>
                  <MenuItem value="in">Inbound (in)</MenuItem>
                  <MenuItem value="out">Outbound (out)</MenuItem>
                  <MenuItem value="adjustment">Cycle Adjustment</MenuItem>
                </TextField>

                <TextField
                  size="small"
                  type="date"
                  label="Start Date"
                  value={movementStartDate}
                  onChange={(e) => {
                    setMovementStartDate(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 145 }}
                />

                <TextField
                  size="small"
                  type="date"
                  label="End Date"
                  value={movementEndDate}
                  onChange={(e) => {
                    setMovementEndDate(e.target.value);
                    setMovementMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 145 }}
                />

                <Box sx={{ ml: 'auto' }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Movements: <strong>{movementMeta.total}</strong>
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {movementError && <ErrorAlert error={movementError} sx={{ mb: 2 }} />}

          <Card variant="outlined">
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={movementRows}
                columns={movementColumns}
                loading={movementLoading}
                rowCount={movementMeta.total}
                paginationMode="server"
                paginationModel={{
                  page: Math.max(0, movementMeta.page - 1),
                  pageSize: movementMeta.limit,
                }}
                onPaginationModelChange={(newModel) => {
                  setMovementMeta((prev) => ({
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
        </Box>
      )}

      {/* ================================================================= */}
      {/* TAB 2: LOW STOCK ALERTS (UC-20)                                   */}
      {/* ================================================================= */}
      {activeTab === 2 && (
        <Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Low Stock Inventory Watchlist</AlertTitle>
            Products listed here have reached or fallen below their safety reorder thresholds. Order replenishment or initiate inter-warehouse transfers to prevent stockouts.
          </Alert>

          {/* Filter Bar */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  select
                  size="small"
                  label="Filter by Warehouse"
                  value={lowWarehouseFilter}
                  onChange={(e) => {
                    setLowWarehouseFilter(e.target.value);
                    setLowMeta((prev) => ({ ...prev, page: 1 }));
                  }}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">All Warehouses</MenuItem>
                  {allWarehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>

                <Box sx={{ ml: 'auto' }}>
                  <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 600 }}>
                    {lowMeta.total} SKU-warehouse pairs requiring replenishment
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {lowError && <ErrorAlert error={lowError} sx={{ mb: 2 }} />}

          <Card variant="outlined">
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={lowRows}
                columns={lowColumns}
                loading={lowLoading}
                rowCount={lowMeta.total}
                paginationMode="server"
                paginationModel={{
                  page: Math.max(0, lowMeta.page - 1),
                  pageSize: lowMeta.limit,
                }}
                onPaginationModelChange={(newModel) => {
                  setLowMeta((prev) => ({
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
        </Box>
      )}

      {/* ================================================================= */}
      {/* DIALOG 1: CHECK AVAILABILITY (UC-15)                             */}
      {/* ================================================================= */}
      <FormDialog
        open={availOpen}
        title="Check Stock Availability (UC-15)"
        subtitle="Lookup available inventory quantities across all distribution centers"
        submitText="Query Stock"
        loading={availLoading}
        error={availError}
        maxWidth="sm"
        onClose={() => setAvailOpen(false)}
        onSubmit={handleCheckAvail}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            fullWidth
            label="Product"
            value={availProduct}
            onChange={(e) => setAvailProduct(e.target.value)}
            required
          >
            {allProducts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Specific Warehouse (Optional)"
            value={availWarehouse}
            onChange={(e) => setAvailWarehouse(e.target.value)}
            helperText="Leave empty to query aggregated availability across all active warehouses"
          >
            <MenuItem value="">All Warehouses</MenuItem>
            {allWarehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id}>
                {wh.name} ({wh.code})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            type="number"
            label="Requested Order Quantity (Optional)"
            value={availQuantity}
            onChange={(e) => setAvailQuantity(e.target.value)}
            inputProps={{ min: 1 }}
            helperText="Specify units to evaluate whether full fulfillment is feasible"
          />

          {/* Results display */}
          {availResult && (
            <Card variant="outlined" sx={{ mt: 2, bgcolor: 'background.default' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Stock Availability Query Result
                </Typography>

                {availResult.isAvailable !== undefined && (
                  <Alert
                    severity={availResult.isAvailable ? 'success' : 'error'}
                    sx={{ mb: 2 }}
                  >
                    {availResult.isAvailable
                      ? `Stock Available: Requested ${availQuantity} units can be satisfied!`
                      : `Stock Insufficient: Cannot satisfy requested ${availQuantity} units.`}
                  </Alert>
                )}

                <Box sx={{ mb: 2, display: 'flex', gap: 3 }}>
                  <Typography variant="body2">
                    Total Available: <strong>{availResult.availableQuantity ?? availResult.totalAvailable ?? 0} units</strong>
                  </Typography>
                </Box>

                {availResult.warehouses && availResult.warehouses.length > 0 && (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Warehouse</TableCell>
                          <TableCell align="right">Available Stock</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {availResult.warehouses.map((w) => (
                          <TableRow key={w.warehouseId || w.id}>
                            <TableCell>{w.warehouseName || w.name} ({w.warehouseCode || w.code})</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              {w.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* DIALOG 2: RECORD MOVEMENT (UC-16)                                 */}
      {/* ================================================================= */}
      <FormDialog
        open={moveOpen}
        title="Record Stock Movement (UC-16)"
        subtitle="Log manual stock entries or withdrawals (422 stock protection enforced)"
        submitText="Post Movement"
        loading={moveLoading}
        error={moveError}
        maxWidth="sm"
        onClose={() => setMoveOpen(false)}
        onSubmit={handleSubmitMove}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            fullWidth
            label="Product"
            value={moveData.productId}
            onChange={(e) => setMoveData({ ...moveData, productId: e.target.value })}
            error={Boolean(moveFieldErrors.productId)}
            helperText={moveFieldErrors.productId}
            required
          >
            {allProducts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Warehouse"
            value={moveData.warehouseId}
            onChange={(e) => setMoveData({ ...moveData, warehouseId: e.target.value })}
            error={Boolean(moveFieldErrors.warehouseId)}
            helperText={moveFieldErrors.warehouseId}
            required
          >
            {allWarehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id}>
                {wh.name} ({wh.code})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Movement Type"
            value={moveData.movementType}
            onChange={(e) => setMoveData({ ...moveData, movementType: e.target.value })}
            required
          >
            <MenuItem value="in">Inbound (Stock In / Receipt)</MenuItem>
            <MenuItem value="out">Outbound (Stock Out / Issue)</MenuItem>
          </TextField>

          <TextField
            fullWidth
            type="number"
            label="Movement Quantity"
            value={moveData.quantity}
            onChange={(e) => setMoveData({ ...moveData, quantity: e.target.value })}
            error={Boolean(moveFieldErrors.quantity)}
            helperText={moveFieldErrors.quantity || 'Must be an integer >= 1'}
            inputProps={{ min: 1 }}
            required
          />

          <TextField
            fullWidth
            label="Reference / Tracking Notes (Optional)"
            value={moveData.reference}
            onChange={(e) => setMoveData({ ...moveData, reference: e.target.value })}
            placeholder="e.g., Damaged batch disposal, customer exchange"
          />
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* DIALOG 3: ADJUST STOCK (UC-17)                                    */}
      {/* ================================================================= */}
      <FormDialog
        open={adjOpen}
        title="Physical Cycle Count Adjustment (UC-17)"
        subtitle="Reconcile system balance with physical count. Audit reason is strictly mandatory."
        submitText="Save Physical Adjustment"
        loading={adjLoading}
        error={adjError}
        maxWidth="sm"
        onClose={() => setAdjOpen(false)}
        onSubmit={handleSubmitAdjust}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            fullWidth
            label="Product"
            value={adjData.productId}
            onChange={(e) => setAdjData({ ...adjData, productId: e.target.value })}
            error={Boolean(adjFieldErrors.productId)}
            helperText={adjFieldErrors.productId}
            required
          >
            {allProducts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Warehouse"
            value={adjData.warehouseId}
            onChange={(e) => setAdjData({ ...adjData, warehouseId: e.target.value })}
            error={Boolean(adjFieldErrors.warehouseId)}
            helperText={adjFieldErrors.warehouseId}
            required
          >
            {allWarehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id}>
                {wh.name} ({wh.code})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            type="number"
            label="Physical Counted Quantity"
            value={adjData.countedQuantity}
            onChange={(e) => setAdjData({ ...adjData, countedQuantity: e.target.value })}
            error={Boolean(adjFieldErrors.countedQuantity)}
            helperText={adjFieldErrors.countedQuantity || 'The verified physical quantity on shelf (>= 0)'}
            inputProps={{ min: 0 }}
            required
          />

          <TextField
            fullWidth
            multiline
            rows={2}
            label="Adjustment Reason (Required)"
            value={adjData.reason}
            onChange={(e) => setAdjData({ ...adjData, reason: e.target.value })}
            error={Boolean(adjFieldErrors.reason)}
            helperText={adjFieldErrors.reason || 'Minimum 3 characters explaining cycle discrepancy'}
            placeholder="e.g., Annual physical audit discrepancy, breakage on shelf B3"
            required
          />
        </Box>
      </FormDialog>

      {/* ================================================================= */}
      {/* DIALOG 4: TRANSFER STOCK (UC-18)                                  */}
      {/* ================================================================= */}
      <FormDialog
        open={transOpen}
        title="Inter-Warehouse Stock Transfer (UC-18)"
        subtitle="Atomic transfer with deadlock prevention. Both warehouses must be active."
        submitText="Execute Stock Transfer"
        loading={transLoading}
        error={transError}
        maxWidth="sm"
        onClose={() => setTransOpen(false)}
        onSubmit={handleSubmitTransfer}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            fullWidth
            label="Product"
            value={transData.productId}
            onChange={(e) => setTransData({ ...transData, productId: e.target.value })}
            error={Boolean(transFieldErrors.productId)}
            helperText={transFieldErrors.productId}
            required
          >
            {allProducts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Source Warehouse (From)"
            value={transData.sourceWarehouseId}
            onChange={(e) => setTransData({ ...transData, sourceWarehouseId: e.target.value })}
            error={Boolean(transFieldErrors.sourceWarehouseId)}
            helperText={transFieldErrors.sourceWarehouseId}
            required
          >
            {allWarehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id}>
                {wh.name} ({wh.code})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Destination Warehouse (To)"
            value={transData.destinationWarehouseId}
            onChange={(e) => setTransData({ ...transData, destinationWarehouseId: e.target.value })}
            error={Boolean(transFieldErrors.destinationWarehouseId)}
            helperText={transFieldErrors.destinationWarehouseId || 'Cannot match source warehouse'}
            required
          >
            {allWarehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id} disabled={String(wh.id) === String(transData.sourceWarehouseId)}>
                {wh.name} ({wh.code}) {String(wh.id) === String(transData.sourceWarehouseId) ? '(Source)' : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            type="number"
            label="Transfer Quantity"
            value={transData.quantity}
            onChange={(e) => setTransData({ ...transData, quantity: e.target.value })}
            error={Boolean(transFieldErrors.quantity)}
            helperText={transFieldErrors.quantity || 'Must be >= 1 and <= available balance in source'}
            inputProps={{ min: 1 }}
            required
          />

          <TextField
            fullWidth
            label="Transfer Reason / Reference (Optional)"
            value={transData.reason}
            onChange={(e) => setTransData({ ...transData, reason: e.target.value })}
            placeholder="e.g., Regional replenishment request, rebalancing"
          />
        </Box>
      </FormDialog>
    </>
  );
}
