// Minimal dependency-free JSON file datastore.
// Chosen over a native SQLite binding so this app installs and runs on any
// machine with just Node.js — no C++ build tools required on the shop's
// counter computer. Fine for V1 scale (hundreds/thousands of rows).
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'satyal-mart.json');

const DEFAULT_DATA = {
  admin_users: [],
  categories: [],
  products: [],
  coupons: [],
  orders: [],
  order_items: [],
  customers: [],
  settings: {},
  _seq: {}
};

function load() {
  if (!fs.existsSync(DB_PATH)) return JSON.parse(JSON.stringify(DEFAULT_DATA));
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_DATA));
  } catch (e) {
    console.error('Could not read database file, starting fresh:', e.message);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

const data = load();
for (const k of Object.keys(DEFAULT_DATA)) {
  if (!(k in data)) data[k] = JSON.parse(JSON.stringify(DEFAULT_DATA[k]));
}

function save() {
  // Synchronous write-through. Simple and safe for this scale — every
  // mutating request persists immediately, so an order is never "lost"
  // between a crash and the next write.
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function nextId(table) {
  data._seq[table] = (data._seq[table] || 0) + 1;
  return data._seq[table];
}

function now() {
  return new Date().toISOString();
}

module.exports = { data, save, nextId, now, DB_PATH };
