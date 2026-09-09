const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { data, save, nextId, now } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const EXPECTED_HEADERS = ['SKU', 'Product Name', 'Category', 'Brand', 'Barcode', 'Regular Price', 'Sale Price', 'Active'];

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function parseWorkbook(buffer, originalName) {
  const workbook = new ExcelJS.Workbook();
  if (originalName.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(require('stream').Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No sheet found in the uploaded file.');

  const headerRow = sheet.getRow(1).values.slice(1).map(normalizeHeader);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (values.every(v => v === null || v === undefined || v === '')) return;
    const obj = {};
    headerRow.forEach((h, i) => { obj[h] = values[i]; });
    rows.push({ rowNumber, raw: obj });
  });
  return rows;
}

function validateRow(raw) {
  const errors = [];
  const sku = String(raw['sku'] ?? '').trim();
  const name = String(raw['product name'] ?? raw['name'] ?? '').trim();
  const category = String(raw['category'] ?? '').trim();
  const brand = String(raw['brand'] ?? '').trim();
  const barcode = String(raw['barcode'] ?? '').trim();
  const regular_price = parseFloat(raw['regular price']);
  const sale_price = parseFloat(raw['sale price']);
  const activeRaw = String(raw['active'] ?? 'yes').trim().toLowerCase();
  const active = ['yes', 'true', '1', 'y'].includes(activeRaw);

  if (!sku) errors.push('SKU is missing.');
  if (!name) errors.push('Product Name is missing.');
  if (isNaN(regular_price) || regular_price < 0) errors.push('Regular Price is missing or invalid.');
  if (isNaN(sale_price) || sale_price < 0) errors.push('Sale Price is missing or invalid.');
  if (!isNaN(regular_price) && !isNaN(sale_price) && sale_price > regular_price) errors.push('Sale Price is greater than Regular Price.');

  return { sku, name, category, brand, barcode, regular_price, sale_price, active, errors };
}

router.post('/preview', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    try {
      const rawRows = await parseWorkbook(req.file.buffer, req.file.originalname);
      if (rawRows.length === 0) return res.status(400).json({ error: 'No data rows found in the file.' });
      if (rawRows.length > 2000) return res.status(400).json({ error: 'File has too many rows (max 2000 for preview).' });

      const existingSkus = new Set(data.products.map(p => p.sku));
      const preview = rawRows.map(({ rowNumber, raw }) => {
        const parsed = validateRow(raw);
        return {
          row: rowNumber,
          ...parsed,
          action: parsed.errors.length ? 'error' : (existingSkus.has(parsed.sku) ? 'update' : 'create')
        };
      });

      res.json({
        expected_headers: EXPECTED_HEADERS,
        total: preview.length,
        valid: preview.filter(r => r.action !== 'error').length,
        errors: preview.filter(r => r.action === 'error').length,
        rows: preview
      });
    } catch (e) {
      res.status(400).json({ error: 'Could not read file: ' + e.message });
    }
  });
});

router.post('/confirm', requireAdmin, (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });

  let created = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    if (!r.sku || !r.name || r.regular_price == null || r.sale_price == null) { skipped++; continue; }
    let categoryId = null;
    if (r.category) {
      let cat = data.categories.find(c => c.name === r.category);
      if (!cat) {
        cat = { id: nextId('categories'), name: r.category, sort_order: data.categories.length, active: 1 };
        data.categories.push(cat);
      }
      categoryId = cat.id;
    }
    const active = r.active === undefined ? 1 : (r.active ? 1 : 0);
    const existing = data.products.find(p => p.sku === r.sku);
    if (existing) {
      existing.name = r.name;
      existing.category_id = categoryId;
      existing.brand = r.brand || '';
      if (r.barcode) existing.barcode = r.barcode;
      existing.regular_price = r.regular_price;
      existing.sale_price = r.sale_price;
      existing.active = active;
      existing.updated_at = now();
      updated++;
    } else {
      const ts = now();
      data.products.push({
        id: nextId('products'), sku: r.sku, name: r.name, barcode: r.barcode || null, category_id: categoryId, brand: r.brand || '',
        description: '', regular_price: r.regular_price, sale_price: r.sale_price, image_path: null,
        stock_qty: null, track_stock: 0, featured: 0, active, created_at: ts, updated_at: ts
      });
      created++;
    }
  }
  save();

  res.json({ created, updated, skipped, total: rows.length });
});

module.exports = router;
