const express = require('express');
const bcrypt = require('bcryptjs');
const { data, save } = require('../db');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  const user = data.admin_users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.adminId = user.id;
  req.session.username = user.username;
  res.json({ id: user.id, username: user.username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ id: req.session.adminId, username: req.session.username });
  }
  res.status(401).json({ error: 'Not logged in.' });
});

router.post('/change-password', (req, res) => {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: 'Not logged in.' });
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const user = data.admin_users.find(u => u.id === req.session.adminId);
  if (!bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  user.password_hash = bcrypt.hashSync(newPassword, 10);
  save();
  res.json({ ok: true });
});

module.exports = router;
