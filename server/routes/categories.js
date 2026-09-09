const express = require('express');
const { data, save, nextId } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

function sortCats(list) {
  return [...list].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
}

// Public: active categories only
router.get('/', (req, res) => {
  res.json(sortCats(data.categories.filter(c => c.active)));
});

// Admin: all categories
router.get('/admin/all', requireAdmin, (req, res) => {
  res.json(sortCats(data.categories));
});

router.post('/admin', requireAdmin, (req, res) => {
  const { name, sort_order } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required.' });
  if (data.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'A category with that name already exists.' });
  }
  const cat = { id: nextId('categories'), name: name.trim(), sort_order: sort_order || 0, active: 1 };
  data.categories.push(cat);
  save();
  res.status(201).json(cat);
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const cat = data.categories.find(c => c.id === +req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });
  const { name, sort_order, active } = req.body || {};
  if (name !== undefined) cat.name = name;
  if (sort_order !== undefined) cat.sort_order = sort_order;
  if (active !== undefined) cat.active = active ? 1 : 0;
  save();
  res.json(cat);
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const id = +req.params.id;
  const inUse = data.products.filter(p => p.category_id === id).length;
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete: ${inUse} product(s) use this category. Deactivate it instead.` });
  data.categories = data.categories.filter(c => c.id !== id);
  save();
  res.json({ ok: true });
});

module.exports = router;
