const express = require('express');
const { data, save, nextId, now } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

function normalizePhone(p) {
  return String(p || '').replace(/\s/g, '');
}

// Find or create a customer by phone, keeping the name in sync.
// Called whenever an order is placed — this is how the customer directory
// fills up (both "online" signups and any phone match against a customer
// an admin already added from the POS side).
function upsertCustomerFromOrder(name, phone) {
  const cleanPhone = normalizePhone(phone);
  let customer = data.customers.find(c => c.phone === cleanPhone);
  if (customer) {
    if (name && name.trim()) customer.name = name.trim();
    customer.updated_at = now();
  } else {
    customer = {
      id: nextId('customers'), phone: cleanPhone, name: name.trim(),
      note: '', source: 'online', created_at: now(), updated_at: now()
    };
    data.customers.push(customer);
  }
  return customer;
}

// ---------- PUBLIC: look up a returning customer by phone (for prefill) ----------
router.get('/lookup', (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });
  const customer = data.customers.find(c => c.phone === phone);
  if (!customer) return res.status(404).json({ found: false });
  res.json({ found: true, name: customer.name });
});

// ---------- ADMIN ----------
router.get('/admin/all', requireAdmin, (req, res) => {
  const { search } = req.query;
  let list = [...data.customers];
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(c => c.phone.includes(q) || c.name.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q));
  }
  const orderCounts = {};
  for (const o of data.orders) {
    const c = data.customers.find(c => c.phone === normalizePhone(o.customer_phone));
    if (c) orderCounts[c.id] = (orderCounts[c.id] || 0) + 1;
  }
  list = list.map(c => ({ ...c, order_count: orderCounts[c.id] || 0 }));
  list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json(list);
});

// Add/update a customer manually — this is how you bring in POS subscription
// data: enter their phone number (matching what's on the printed bill) and
// a note like "Gold Member". Any online order from that phone links up.
router.post('/admin', requireAdmin, (req, res) => {
  const { phone, name, note } = req.body || {};
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return res.status(400).json({ error: 'Phone number is required.' });
  if (data.customers.some(c => c.phone === cleanPhone)) {
    return res.status(400).json({ error: 'A customer with that phone number already exists — edit them instead.' });
  }
  const customer = {
    id: nextId('customers'), phone: cleanPhone, name: (name || '').trim(),
    note: (note || '').trim(), source: 'pos', created_at: now(), updated_at: now()
  };
  data.customers.push(customer);
  save();
  res.status(201).json(customer);
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const c = data.customers.find(c => c.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });
  const { phone, name, note } = req.body || {};
  if (phone !== undefined) c.phone = normalizePhone(phone);
  if (name !== undefined) c.name = name;
  if (note !== undefined) c.note = note;
  c.updated_at = now();
  save();
  res.json(c);
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  data.customers = data.customers.filter(c => c.id !== +req.params.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
module.exports.upsertCustomerFromOrder = upsertCustomerFromOrder;
module.exports.normalizePhone = normalizePhone;
