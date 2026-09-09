const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

require('./db'); // initializes + seeds the database on first run

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'satyal-mart-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hour admin session
}));

// Uploaded product images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admin/upload', require('./routes/upload'));
app.use('/api/admin/import', require('./routes/import'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin/reports', require('./routes/reports'));

// Static frontends
app.use('/', express.static(path.join(__dirname, '..', 'public', 'customer')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSatyal Mart is running!`);
  console.log(`  Customer catalog: http://localhost:${PORT}`);
  console.log(`  Admin dashboard:  http://localhost:${PORT}/admin`);
  console.log(`  (default login -> username: admin / password: satyal123)\n`);
});
