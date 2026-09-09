const express = require('express');
const { data } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

function isToday(iso) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

router.get('/dashboard', requireAdmin, (req, res) => {
  const todaysOrders = data.orders.filter(o => isToday(o.created_at));

  const ordersToday = todaysOrders.length;
  const pending = data.orders.filter(o => ['NEW', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status)).length;
  const completedToday = todaysOrders.filter(o => o.status === 'COMPLETED').length;
  const cancelledToday = todaysOrders.filter(o => o.status === 'CANCELLED').length;
  const salesToday = todaysOrders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
  const activeProducts = data.products.filter(p => p.active).length;
  const onSale = data.products.filter(p => p.active && p.sale_price < p.regular_price).length;
  const activeCoupons = data.coupons.filter(c => c.active).length;

  const recentOrders = [...data.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

  res.json({
    orders_today: ordersToday, pending_orders: pending, completed_today: completedToday,
    cancelled_today: cancelledToday, sales_today: salesToday, active_products: activeProducts,
    products_on_sale: onSale, active_coupons: activeCoupons, recent_orders: recentOrders
  });
});

router.get('/top-products', requireAdmin, (req, res) => {
  const validOrderIds = new Set(data.orders.filter(o => o.status !== 'CANCELLED').map(o => o.id));
  const totals = {};
  for (const item of data.order_items) {
    if (!validOrderIds.has(item.order_id)) continue;
    const key = item.product_name;
    if (!totals[key]) totals[key] = { product_name: item.product_name, brand: item.brand, total_qty: 0, total_revenue: 0 };
    totals[key].total_qty += item.qty;
    totals[key].total_revenue += item.line_total;
  }
  const rows = Object.values(totals).sort((a, b) => b.total_qty - a.total_qty).slice(0, 10);
  res.json(rows);
});

router.get('/coupon-usage', requireAdmin, (req, res) => {
  const rows = [...data.coupons]
    .map(c => ({ code: c.code, type: c.type, value: c.value, used_count: c.used_count, usage_limit: c.usage_limit, active: c.active }))
    .sort((a, b) => b.used_count - a.used_count);
  res.json(rows);
});

router.get('/export/orders.csv', requireAdmin, (req, res) => {
  const orders = [...data.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const header = 'Order Number,Date,Customer,Phone,Subtotal,Discount,Total,Coupon,Status\n';
  const body = orders.map(o =>
    [o.order_number, o.created_at, `"${o.customer_name}"`, o.customer_phone, o.subtotal, o.discount, o.total, o.coupon_code || '', o.status].join(',')
  ).join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="satyal-mart-orders.csv"');
  res.send(header + body);
});

module.exports = router;
