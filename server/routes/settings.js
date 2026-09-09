const express = require('express');
const QRCode = require('qrcode');
const { data, save } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ ...data.settings, order_seq: undefined });
});

router.put('/admin', requireAdmin, (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    data.settings[k] = String(v);
  }
  save();
  res.json({ ...data.settings, order_seq: undefined });
});

router.get('/admin/qr.png', requireAdmin, async (req, res) => {
  const url = data.settings.qr_target_url || 'http://satyal-mart.local:3000';
  try {
    const buffer = await QRCode.toBuffer(url, { width: 512, margin: 2, color: { dark: '#7A2E10', light: '#FFFFFF' } });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: 'Could not generate QR code.' });
  }
});

module.exports = router;
