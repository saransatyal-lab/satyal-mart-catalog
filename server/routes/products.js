const express = require('express');
const { data, save, nextId, now } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

function discountPct(reg, sale) {
  if (!reg || reg <= sale) return 0;
  return Math.round(((reg - sale) / reg) * 100);
}
function categoryName(catId) {
  const c = data.categories.find(c => c.id === catId);
  return c ? c.name : null;
}
function serialize(p) {
  return { ...p, category_name: categoryName(p.category_id), discount_pct: discountPct(p.regular_price, p.sale_price) };
}

// ---------- PUBLIC: customer catalog ----------
router.get('/', (req, res) => {
  const { category, search, featured, sort } = req.query;
  let list = data.products.filter(p => p.active);

  if (category && category !== 'All') {
    list = list.filter(p => categoryName(p.category_id) === category);
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (categoryName(p.category_id) || '').toLowerCase().includes(q)
    );
  }
  if (featured === '1') list = list.filter(p => p.featured);

  const sorters = {
    price_asc: (a, b) => a.sale_price - b.sale_price,
    price_desc: (a, b) => b.sale_price - a.sale_price,
    discount: (a, b) => (b.regular_price - b.sale_price) - (a.regular_price - a.sale_price),
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  };
  list = [...list].sort(sorters[sort] || ((a, b) => (b.featured - a.featured) || a.name.localeCompare(b.name)));

  res.json(list.map(serialize));
});

// Public: price-check by barcode (customer camera/manual scan) — must come before /:id
router.get('/barcode/:code', (req, res) => {
  const code = String(req.params.code).trim();
  const p = data.products.find(p => p.barcode && p.barcode === code && p.active);
  if (!p) return res.status(404).json({ error: 'No product found for that barcode.' });
  res.json(serialize(p));
});

router.get('/:id', (req, res) => {
  const p = data.products.find(p => p.id === +req.params.id && p.active);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  res.json(serialize(p));
});

// ---------- ADMIN ----------
router.get('/admin/all', requireAdmin, (req, res) => {
  const { search, category_id, status } = req.query;
  let list = [...data.products];
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q));
  }
  if (category_id) list = list.filter(p => p.category_id === +category_id);
  if (status === 'active') list = list.filter(p => p.active);
  if (status === 'inactive') list = list.filter(p => !p.active);
  list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json(list.map(serialize));
});

// Admin: stock lookup by barcode (scanner-gun or manual entry)
router.get('/admin/barcode/:code', requireAdmin, (req, res) => {
  const code = String(req.params.code).trim();
  const p = data.products.find(p => p.barcode && p.barcode === code);
  if (!p) return res.status(404).json({ error: 'No product found for that barcode.' });
  res.json(serialize(p));
});

router.post('/admin', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.sku || !b.name || b.regular_price == null || b.sale_price == null) {
    return res.status(400).json({ error: 'SKU, name, regular price, and sale price are required.' });
  }
  if (data.products.some(p => p.sku === b.sku.trim())) {
    return res.status(400).json({ error: 'A product with that SKU already exists.' });
  }
  if (b.barcode && data.products.some(p => p.barcode === b.barcode.trim())) {
    return res.status(400).json({ error: 'A product with that barcode already exists.' });
  }
  const ts = now();
  const product = {
    id: nextId('products'), sku: b.sku.trim(), name: b.name.trim(), barcode: b.barcode ? b.barcode.trim() : null,
    category_id: b.category_id ? +b.category_id : null, brand: b.brand || '', description: b.description || '',
    regular_price: b.regular_price, sale_price: b.sale_price, image_path: b.image_path || null,
    stock_qty: b.track_stock ? (b.stock_qty ?? 0) : null, track_stock: b.track_stock ? 1 : 0,
    featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1,
    created_at: ts, updated_at: ts
  };
  data.products.push(product);
  save();
  res.status(201).json(serialize(product));
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const p = data.products.find(p => p.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body || {};
  if (b.sku !== undefined && b.sku !== p.sku && data.products.some(x => x.sku === b.sku)) {
    return res.status(400).json({ error: 'A product with that SKU already exists.' });
  }
  if (b.barcode !== undefined && b.barcode && b.barcode !== p.barcode && data.products.some(x => x.barcode === b.barcode)) {
    return res.status(400).json({ error: 'A product with that barcode already exists.' });
  }
  if (b.sku !== undefined) p.sku = b.sku;
  if (b.barcode !== undefined) p.barcode = b.barcode ? b.barcode.trim() : null;
  if (b.name !== undefined) p.name = b.name;
  if (b.category_id !== undefined) p.category_id = b.category_id ? +b.category_id : null;
  if (b.brand !== undefined) p.brand = b.brand;
  if (b.description !== undefined) p.description = b.description;
  if (b.regular_price !== undefined) p.regular_price = b.regular_price;
  if (b.sale_price !== undefined) p.sale_price = b.sale_price;
  if (b.image_path !== undefined) p.image_path = b.image_path;
  if (b.track_stock !== undefined) p.track_stock = b.track_stock ? 1 : 0;
  if (b.stock_qty !== undefined) p.stock_qty = p.track_stock ? b.stock_qty : null;
  if (b.featured !== undefined) p.featured = b.featured ? 1 : 0;
  if (b.active !== undefined) p.active = b.active ? 1 : 0;
  p.updated_at = now();
  save();
  res.json(serialize(p));
});

router.patch('/admin/:id/toggle-active', requireAdmin, (req, res) => {
  const p = data.products.find(p => p.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  p.active = p.active ? 0 : 1;
  p.updated_at = now();
  save();
  res.json(serialize(p));
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  data.products = data.products.filter(p => p.id !== +req.params.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
