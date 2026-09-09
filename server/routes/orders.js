const express = require('express');
const { data, save, nextId, now } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { evaluateCoupon } = require('./coupons');
const { upsertCustomerFromOrder, normalizePhone } = require('./customers');
const router = express.Router();

function nextOrderNumber() {
  const current = data.settings.order_seq ? parseInt(data.settings.order_seq, 10) : 1024;
  const next = current + 1;
  data.settings.order_seq = String(next);
  return `SM-${next}`;
}

// ---------- PUBLIC: place an order ----------
// All prices/discounts are recalculated server-side from the DB — never trust client totals.
router.post('/', (req, res) => {
  const { customer_name, customer_phone, note, coupon_code, items } = req.body || {};

  if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: 'Customer name is required.' });
  if (!customer_phone || !/^[0-9]{7,10}$/.test(String(customer_phone).replace(/\s/g, ''))) {
    return res.status(400).json({ error: 'A valid mobile number is required.' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty.' });

  const lineItems = [];
  let subtotal = 0;

  for (const item of items) {
    const p = data.products.find(p => p.id === +item.product_id && p.active);
    if (!p) return res.status(400).json({ error: `A product in your cart is no longer available.` });
    if (p.track_stock && p.stock_qty != null && item.qty > p.stock_qty) {
      return res.status(400).json({ error: `Only ${p.stock_qty} of "${p.name}" left in stock.` });
    }
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const lineTotal = p.sale_price * qty;
    subtotal += lineTotal;
    lineItems.push({ product: p, qty, lineTotal });
  }

  let discount = 0;
  let appliedCode = null;
  if (coupon_code) {
    const coupon = data.coupons.find(c => c.code === coupon_code.trim().toUpperCase());
    const result = evaluateCoupon(coupon, subtotal);
    if (result.ok) {
      discount = result.discount;
      appliedCode = coupon.code;
    }
    // if invalid, silently ignore rather than fail the whole order — coupon was already validated client-side
  }

  const total = Math.max(0, subtotal - discount);
  const orderNumber = nextOrderNumber();
  const ts = now();

  const customer = upsertCustomerFromOrder(customer_name, customer_phone);

  const order = {
    id: nextId('orders'), order_number: orderNumber, customer_id: customer.id,
    customer_name: customer_name.trim(), customer_phone: customer_phone.trim(), note: note || '',
    subtotal, discount, total, coupon_code: appliedCode, status: 'NEW', created_at: ts, updated_at: ts
  };
  data.orders.push(order);

  for (const li of lineItems) {
    data.order_items.push({
      id: nextId('order_items'), order_id: order.id, product_id: li.product.id,
      product_name: li.product.name, brand: li.product.brand, qty: li.qty,
      unit_price: li.product.sale_price, regular_price: li.product.regular_price, line_total: li.lineTotal
    });
    if (li.product.track_stock) li.product.stock_qty -= li.qty;
  }
  if (appliedCode) {
    const c = data.coupons.find(c => c.code === appliedCode);
    if (c) c.used_count += 1;
  }

  save();
  res.status(201).json({ order_number: orderNumber, subtotal, discount, total, status: 'NEW', order_id: order.id });
});

// ---------- ADMIN ----------
router.get('/admin/all', requireAdmin, (req, res) => {
  const { status, date } = req.query;
  let list = [...data.orders];
  if (status) list = list.filter(o => o.status === status);
  if (date) list = list.filter(o => o.created_at.slice(0, 10) === date);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

router.get('/admin/:id', requireAdmin, (req, res) => {
  const order = data.orders.find(o => o.id === +req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = data.order_items.filter(i => i.order_id === order.id);
  const customer = data.customers.find(c => c.phone === normalizePhone(order.customer_phone));
  res.json({ ...order, items, customer_note: customer ? customer.note : '' });
});

const VALID_STATUSES = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
router.patch('/admin/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const order = data.orders.find(o => o.id === +req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.status = status;
  order.updated_at = now();
  save();
  res.json(order);
});

module.exports = router;
