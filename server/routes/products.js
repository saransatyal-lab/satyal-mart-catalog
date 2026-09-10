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
    discount: (a, b) => discountPct(b.regular_price, b.sale_price) - discountPct(a.regular_price, a.sale_price),
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    name: (a, b) => a.name.localeCompare(b.name),
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
  if (!b.name || b.regular_price == null || b.sale_price == null) {
    return res.status(400).json({ error: 'Name, regular price, and sale price are required.' });
  }
  const barcode = b.barcode ? b.barcode.trim() : null;
  if (barcode) {
    const clash = data.products.find(p => p.barcode === barcode);
    if (clash) return res.status(400).json({ error: `Barcode ${barcode} is already used by "${clash.name}" (${clash.sku}).` });
  }
  const id = nextId('products');
  let sku = b.sku && b.sku.trim() ? b.sku.trim() : `SM-${String(id).padStart(4, '0')}`;
  const skuClash = data.products.find(p => p.sku === sku);
  if (skuClash) {
    if (b.sku && b.sku.trim()) {
      return res.status(400).json({ error: `SKU ${sku} is already used by "${skuClash.name}". Leave SKU blank to auto-generate one instead.` });
    }
    sku = `SM-${String(id).padStart(4, '0')}-${Date.now().toString().slice(-4)}`; // extremely unlikely fallback clash
  }
  const ts = now();
  const product = {
    id, sku, name: b.name.trim(), barcode,
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

  // Normalize to strings and trim before comparing — request bodies (especially
  // anything that ever passed through a spreadsheet) can carry numbers or
  // stray whitespace that would otherwise cause false "already exists" hits.
  const newSku = b.sku !== undefined ? String(b.sku).trim() : undefined;
  const newBarcode = b.barcode !== undefined ? (String(b.barcode).trim() || null) : undefined;

  if (newSku !== undefined && newSku !== p.sku) {
    const clash = data.products.find(x => x.id !== p.id && x.sku === newSku);
    if (clash) return res.status(400).json({ error: `SKU ${newSku} is already used by "${clash.name}".` });
  }
  if (newBarcode !== undefined && newBarcode && newBarcode !== p.barcode) {
    const clash = data.products.find(x => x.id !== p.id && x.barcode === newBarcode);
    if (clash) return res.status(400).json({ error: `Barcode ${newBarcode} is already used by "${clash.name}" (${clash.sku}).` });
  }
  if (newSku !== undefined) p.sku = newSku;
  if (newBarcode !== undefined) p.barcode = newBarcode;
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
