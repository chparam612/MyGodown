import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { dashboardApi } from '../api/dashboard.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { DataState } from '../components/DataState.jsx';
import { StatusChip } from '../components/StatusChip.jsx';
import { MoneyText } from '../components/MoneyText.jsx';
import { formatDate } from '../utils/formatters.js';
import { useAuth } from '../context/useAuth.js';
import { USER_ROLES } from '../utils/constants.js';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.getSummary();
      setData(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    async function loadInitial() {
      try {
        const res = await dashboardApi.getSummary();
        if (isCurrent) {
          setData(res.data);
        }
      } catch (err) {
        if (isCurrent) {
          setError(err);
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadInitial();
    return () => {
      isCurrent = false;
    };
  }, []);

  // BR-05: stockValue is STRICTLY OMITTED from backend response for staff role
  // Genuinely check property existence in data, not truthiness
  const hasStockValue = data && Object.prototype.hasOwnProperty.call(data, 'stockValue');

  // Chart data from stockByWarehouse
  const chartData = (data?.stockByWarehouse || []).map((w) => ({
    name: w.warehouseCode || w.warehouseName,
    fullName: w.warehouseName,
    units: Number(w.totalUnits || 0),
  }));

  const recentMovements = data?.recentMovements || [];

  return (
    <Box>
      <PageHeader
        title="Dashboard Summary"
        subtitle="Real-time operational metrics, facility stock allocation, and recent movements"
        action={
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      <DataState loading={loading} error={error} onRetry={handleRefresh}>
        {data && (
          <>
            {/* KPI Metric Cards Grid */}
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
              {/* Active Products */}
              <Grid item xs={12} sm={6} md={hasStockValue ? 2 : 2.4}>
                <Card>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                        Active Products
                      </Typography>
                      <LayersOutlinedIcon fontSize="small" color="primary" />
                    </Box>
                    <Typography variant="h4" fontWeight={700}>
                      {data.totalActiveProducts ?? 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Available in catalog
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Total Stock Units */}
              <Grid item xs={12} sm={6} md={hasStockValue ? 2 : 2.4}>
                <Card>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                        Total Units
                      </Typography>
                      <Inventory2OutlinedIcon fontSize="small" color="secondary" />
                    </Box>
                    <Typography variant="h4" fontWeight={700}>
                      {(data.totalStockUnits ?? 0).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Physical items on hand
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Total Stock Valuation - STRICTLY OMITTED FOR STAFF (BR-05) */}
              {hasStockValue && (
                <Grid item xs={12} sm={6} md={2}>
                  <Card sx={{ bgcolor: 'primary.50', borderColor: 'primary.200' }}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="primary.dark" fontWeight={600} textTransform="uppercase">
                          Stock Value
                        </Typography>
                        <MonetizationOnOutlinedIcon fontSize="small" color="primary" />
                      </Box>
                      <Typography variant="h4" fontWeight={700} color="primary.dark">
                        <MoneyText amount={data.stockValue} variant="h4" fontWeight={700} />
                      </Typography>
                      <Typography variant="caption" color="primary.dark">
                        At unit cost valuation
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Low Stock Count (Clickable link to Inventory page with filter) */}
              <Grid item xs={12} sm={6} md={hasStockValue ? 2 : 2.4}>
                <Card
                  sx={{
                    borderColor: data.lowStockCount > 0 ? 'warning.main' : 'divider',
                    bgcolor: data.lowStockCount > 0 ? 'warning.50' : 'background.paper',
                  }}
                >
                  <CardActionArea onClick={() => navigate('/inventory?tab=stock&lowStock=true')}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography
                          variant="caption"
                          color={data.lowStockCount > 0 ? 'warning.dark' : 'text.secondary'}
                          fontWeight={600}
                          textTransform="uppercase"
                        >
                          Low Stock Items
                        </Typography>
                        <WarningAmberIcon
                          fontSize="small"
                          color={data.lowStockCount > 0 ? 'warning' : 'action'}
                        />
                      </Box>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color={data.lowStockCount > 0 ? 'warning.dark' : 'text.primary'}
                      >
                        {data.lowStockCount ?? 0}
                      </Typography>
                      <Typography variant="caption" color={data.lowStockCount > 0 ? 'warning.dark' : 'text.secondary'}>
                        {data.lowStockCount > 0 ? 'Requires reorder →' : 'Healthy inventory'}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>

              {/* Open Purchase Orders (Clickable if Admin/Manager) */}
              <Grid item xs={12} sm={6} md={hasStockValue ? 2 : 2.4}>
                <Card>
                  <CardActionArea
                    disabled={user?.role === USER_ROLES.STAFF}
                    onClick={() => navigate('/purchase-orders?status=ordered')}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                          Open POs
                        </Typography>
                        <ShoppingCartOutlinedIcon fontSize="small" color="primary" />
                      </Box>
                      <Typography variant="h4" fontWeight={700}>
                        {data.openPurchaseOrders ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Draft & Ordered
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>

              {/* Open Sales Orders */}
              <Grid item xs={12} sm={6} md={hasStockValue ? 2 : 2.4}>
                <Card>
                  <CardActionArea onClick={() => navigate('/sales-orders?status=confirmed')}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                          Open SOs
                        </Typography>
                        <PointOfSaleOutlinedIcon fontSize="small" color="secondary" />
                      </Box>
                      <Typography variant="h4" fontWeight={700}>
                        {data.openSalesOrders ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Draft & Confirmed
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            </Grid>

            {/* Warehouse Stock Distribution Bar Chart */}
            <Card sx={{ mb: 4 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                  Stock Distribution by Warehouse
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Physical inventory unit quantities currently allocated across operational facilities
                </Typography>

                {chartData.length === 0 ? (
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No warehouse stock data available.
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#475569', fontSize: 12 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          tick={{ fill: '#475569', fontSize: 12 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                          formatter={(value) => [`${value.toLocaleString()} units`, 'Stock Units']}
                          labelFormatter={(label) => {
                            const match = chartData.find((c) => c.name === label);
                            return match ? match.fullName : label;
                          }}
                        />
                        <Bar dataKey="units" fill="#1e40af" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Recent Stock Movements Table (Resolved API names) */}
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={600}>
                      Recent Stock Movements
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Latest 10 audit ledger movements across all warehouses (newest first)
                    </Typography>
                  </Box>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => navigate('/inventory?tab=movements')}
                  >
                    View All Movements →
                  </Button>
                </Box>

                {recentMovements.length === 0 ? (
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No stock movements recorded yet.
                    </Typography>
                  </Box>
                ) : (
                  <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'background.default' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">
                            Quantity
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Reference Type</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Reference / Notes</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Authorized By</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {recentMovements.map((mov) => {
                          const userName = mov.user?.name || mov.userName || 'System';
                          return (
                            <TableRow key={mov.id} hover>
                              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                {formatDate(mov.createdAt)}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {mov.productName || `Product #${mov.productId}`}
                                </Typography>
                                {mov.sku && (
                                  <Typography variant="caption" color="text.secondary">
                                    {mov.sku}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.875rem' }}>
                                {mov.warehouseName || `Warehouse #${mov.warehouseId}`}
                              </TableCell>
                              <TableCell>
                                <StatusChip status={mov.movementType} type="movement" size="small" />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                {mov.movementType === 'out'
                                  ? `-${mov.quantity}`
                                  : mov.movementType === 'in'
                                  ? `+${mov.quantity}`
                                  : mov.quantity > 0
                                  ? `+${mov.quantity}`
                                  : mov.quantity}
                              </TableCell>
                              <TableCell>
                                <StatusChip status={mov.referenceType} type="reference" size="small" />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem', color: 'text.secondary', maxWidth: 220 }} noWrap>
                                {mov.reference || '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{userName}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </DataState>
    </Box>
  );
}
