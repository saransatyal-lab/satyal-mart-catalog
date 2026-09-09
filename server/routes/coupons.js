const express = require('express');
const { data, save, nextId, now } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

function evaluateCoupon(coupon, subtotal) {
  const nowDate = new Date();
  if (!coupon || !coupon.active) return { ok: false, error: 'Invalid coupon code.' };
  if (coupon.start_date && nowDate < new Date(coupon.start_date)) return { ok: false, error: 'This coupon is not active yet.' };
  if (coupon.end_date && nowDate > new Date(coupon.end_date)) return { ok: false, error: 'This coupon has expired.' };
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) return { ok: false, error: 'This coupon has reached its usage limit.' };
  if (subtotal < (coupon.min_order || 0)) return { ok: false, error: `Add Rs. ${(coupon.min_order - subtotal).toFixed(0)} more to use this coupon.` };

  let discount = coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100) : coupon.value;
  if (coupon.max_discount != null) discount = Math.min(discount, coupon.max_discount);
  discount = Math.min(discount, subtotal);
  return { ok: true, discount };
}

router.post('/validate', (req, res) => {
  const { code, subtotal } = req.body || {};
  if (!code || subtotal == null) return res.status(400).json({ ok: false, error: 'Coupon code and subtotal are required.' });
  const coupon = data.coupons.find(c => c.code === code.trim().toUpperCase());
  const result = evaluateCoupon(coupon, subtotal);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true, code: coupon.code, discount: result.discount, type: coupon.type, value: coupon.value });
});

router.get('/admin/all', requireAdmin, (req, res) => {
  res.json([...data.coupons].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/admin', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.type || b.value == null) return res.status(400).json({ error: 'Code, type, and value are required.' });
  const code = b.code.trim().toUpperCase();
  if (data.coupons.some(c => c.code === code)) return res.status(400).json({ error: 'A coupon with that code already exists.' });
  const coupon = {
    id: nextId('coupons'), code, type: b.type, value: b.value, min_order: b.min_order || 0,
    max_discount: b.max_discount ?? null, start_date: b.start_date || null, end_date: b.end_date || null,
    usage_limit: b.usage_limit ?? null, used_count: 0, active: b.active === false ? 0 : 1, created_at: now()
  };
  data.coupons.push(coupon);
  save();
  res.status(201).json(coupon);
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const c = data.coupons.find(c => c.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Coupon not found.' });
  const b = req.body || {};
  if (b.code !== undefined) c.code = b.code.toUpperCase();
  if (b.type !== undefined) c.type = b.type;
  if (b.value !== undefined) c.value = b.value;
  if (b.min_order !== undefined) c.min_order = b.min_order;
  if (b.max_discount !== undefined) c.max_discount = b.max_discount;
  if (b.start_date !== undefined) c.start_date = b.start_date;
  if (b.end_date !== undefined) c.end_date = b.end_date;
  if (b.usage_limit !== undefined) c.usage_limit = b.usage_limit;
  if (b.active !== undefined) c.active = b.active ? 1 : 0;
  save();
  res.json(c);
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  data.coupons = data.coupons.filter(c => c.id !== +req.params.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
module.exports.evaluateCoupon = evaluateCoupon;
