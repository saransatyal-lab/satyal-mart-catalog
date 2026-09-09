const bcrypt = require('bcryptjs');
const store = require('./store');
const { data, save, nextId, now } = store;

// ---- Seed: default admin user ----
if (data.admin_users.length === 0) {
  data.admin_users.push({
    id: nextId('admin_users'),
    username: 'admin',
    password_hash: bcrypt.hashSync('satyal123', 10),
    created_at: now()
  });
  console.log('Seeded default admin user -> username: admin / password: satyal123 (please change this)');
}

// ---- Seed: settings ----
const settingsSeed = {
  store_name: 'Satyal Mart',
  banner_title: "Today's Deals",
  banner_subtitle: 'Great prices, while stocks last',
  qr_target_url: 'http://satyal-mart.local:3000'
};
for (const [k, v] of Object.entries(settingsSeed)) {
  if (!(k in data.settings)) data.settings[k] = v;
}

// ---- Seed: categories + products (only if empty) ----
if (data.categories.length === 0) {
  const catNames = ['Beverages', 'Snacks', 'Grocery', 'Dairy', 'Bakery', 'Personal Care', 'Household'];
  catNames.forEach((name, i) => {
    data.categories.push({ id: nextId('categories'), name, sort_order: i, active: 1 });
  });

  const catId = name => data.categories.find(c => c.name === name).id;

  const products = [
    ['SM-0001', 'Sparkling Cola 2.25L', 'Beverages', 'FIZZO', 'Classic sparkling cola, chilled and ready to serve.', 250, 219, '8901234500011'],
    ['SM-0002', 'Orange Burst 1.5L', 'Beverages', 'FIZZO', 'Fizzy orange soft drink made with real fruit extract.', 150, 135, '8901234500028'],
    ['SM-0003', 'Mineral Water 1L', 'Beverages', 'HimSpring', 'Purified mineral water sourced from Himalayan springs.', 30, 30, '8901234500035'],
    ['SM-0004', 'Classic Salted Chips', 'Snacks', 'CrispKing', 'Crunchy potato chips lightly salted.', 120, 100, '8901234500042'],
    ['SM-0005', 'Masala Munch 90g', 'Snacks', 'CrispKing', 'Spicy masala flavoured crisps.', 100, 85, '8901234500059'],
    ['SM-0006', 'Cream Biscuit Pack', 'Snacks', 'GoldenBake', 'Sweet cream-filled biscuits.', 80, 70, '8901234500066'],
    ['SM-0007', 'Fresh Milk 1L', 'Dairy', 'DairyPure', 'Fresh pasteurised full-cream milk.', 105, 95, '8901234500073'],
    ['SM-0008', 'Curd Cup 400g', 'Dairy', 'DairyPure', 'Thick, creamy homestyle curd.', 75, 65, '8901234500080'],
    ['SM-0009', 'Basmati Rice 5kg', 'Grocery', 'AnnapurnaGrain', 'Premium long-grain basmati rice.', 750, 699, '8901234500097'],
    ['SM-0010', 'Sunflower Cooking Oil 1L', 'Grocery', 'GoldPress', 'Light, healthy sunflower oil.', 320, 295, '8901234500103'],
    ['SM-0011', 'Instant Noodles (Pack of 5)', 'Grocery', 'QuickBite', 'Quick-cook masala noodles.', 150, 130, '8901234500110'],
    ['SM-0012', 'Sliced White Bread', 'Bakery', 'GoldenBake', 'Soft, fresh sliced bread baked daily.', 70, 65, '8901234500127'],
    ['SM-0013', 'Whole Wheat Buns (6pc)', 'Bakery', 'GoldenBake', 'Soft whole-wheat buns.', 90, 90, '8901234500134'],
    ['SM-0014', 'Herbal Bathing Soap', 'Personal Care', 'PureLeaf', 'Gentle herbal soap with neem and tulsi.', 60, 50, '8901234500141'],
    ['SM-0015', 'Toothpaste 150g', 'Personal Care', 'BrightSmile', 'Fluoride toothpaste for cavity protection.', 140, 125, '8901234500158'],
    ['SM-0016', 'Multi-Surface Cleaner', 'Household', 'HomeShine', 'All-purpose cleaning spray.', 180, 150, '8901234500165'],
    ['SM-0017', 'Dish Wash Liquid 500ml', 'Household', 'HomeShine', 'Concentrated dish wash liquid.', 110, 99, '8901234500172'],
    ['SM-0018', 'Energy Drink 250ml', 'Beverages', 'VoltUp', 'A quick energy boost for busy days.', 120, 99, '8901234500189'],
  ];
  products.forEach(([sku, name, catName, brand, description, reg, sale, barcode], i) => {
    const ts = now();
    data.products.push({
      id: nextId('products'), sku, name, barcode, category_id: catId(catName), brand, description,
      regular_price: reg, sale_price: sale, image_path: null,
      stock_qty: null, track_stock: 0, featured: i < 4 ? 1 : 0, active: 1,
      created_at: ts, updated_at: ts
    });
  });

  const coupons = [
    ['SATYAL10', 'percent', 10, 0, 150],
    ['SAVE50', 'flat', 50, 400, 50],
    ['WELCOME20', 'percent', 20, 600, 250],
  ];
  coupons.forEach(([code, type, value, min_order, max_discount]) => {
    data.coupons.push({
      id: nextId('coupons'), code, type, value, min_order, max_discount,
      start_date: null, end_date: null, usage_limit: null, used_count: 0, active: 1, created_at: now()
    });
  });

  console.log('Seeded categories, products, and starter coupons.');
}

save();

module.exports = store;
