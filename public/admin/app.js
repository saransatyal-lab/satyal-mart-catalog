const API = '/api';
let CATEGORIES = [];
let currentUser = null;

/* ---------------- API helper ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts
  });
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}
function money(n){ return 'Rs. ' + Number(n||0).toLocaleString('en-IN'); }
function fmtDate(s){ const d = new Date(s); return d.toLocaleDateString('en-IN', {day:'numeric',month:'short'}) + ' · ' + d.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg, isErr=false){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.classList.remove('show'), 3200);
}

/* ---------------- Auth ---------------- */
async function checkSession(){
  try{
    const me = await api('/auth/me');
    currentUser = me;
    showApp();
  }catch(e){
    showLogin();
  }
}
function showLogin(){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}
function showApp(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  document.getElementById('topbarUser').textContent = currentUser.username;
  initNav();
  loadCategoriesGlobal().then(()=> switchView('dashboard'));
}
async function doLogin(){
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try{
    currentUser = await api('/auth/login', { method:'POST', body: JSON.stringify({ username, password }) });
    showApp();
  }catch(e){
    errEl.textContent = e.message;
  }
}
async function doLogout(){
  await api('/auth/logout', { method:'POST' });
  currentUser = null;
  showLogin();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});

/* ---------------- Nav / routing ---------------- */
const VIEW_TITLES = {
  dashboard:'Dashboard', products:'Products', categories:'Categories', orders:'Orders', customers:'Customers',
  scan:'Scan Stock', coupons:'Coupons', import:'Import Excel', reports:'Reports', qr:'QR Code', settings:'Settings'
};
function initNav(){
  document.querySelectorAll('.sb-item').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
}
function switchView(view){
  if (scanCameraStream) stopCameraScan();
  document.querySelectorAll('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || '';
  const renderers = {
    dashboard: renderDashboard, products: renderProducts, categories: renderCategories,
    orders: renderOrders, customers: renderCustomers, scan: renderScan, coupons: renderCoupons, import: renderImport,
    reports: renderReports, qr: renderQr, settings: renderSettings
  };
  (renderers[view] || (()=>{}))();
}

async function loadCategoriesGlobal(){
  CATEGORIES = await api('/categories/admin/all');
}

/* ---------------- Modal helpers ---------------- */
function openModal(html){
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
  document.getElementById('modalBody').innerHTML = '';
}

/* ================= DASHBOARD ================= */
async function renderDashboard(){
  const content = document.getElementById('content');
  content.innerHTML = `<div class="panel"><div class="panel-body" style="padding-top:18px;">Loading…</div></div>`;
  const d = await api('/admin/reports/dashboard');

  const stats = [
    ['Orders Today', d.orders_today],
    ['Pending Orders', d.pending_orders],
    ["Today's Sales", money(d.sales_today)],
    ['Completed Today', d.completed_today],
    ['Active Products', d.active_products],
    ['Products On Sale', d.products_on_sale],
    ['Active Coupons', d.active_coupons],
    ['Cancelled Today', d.cancelled_today],
  ];

  content.innerHTML = `
    <div class="stat-grid">
      ${stats.map(([l,v]) => `<div class="stat-card"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Recent Orders</h3><button class="btn-secondary" onclick="switchView('orders')">View all</button></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
          <tbody>
            ${d.recent_orders.length ? d.recent_orders.map(o => `
              <tr style="cursor:pointer" onclick="viewOrder(${o.id})">
                <td><b>${o.order_number}</b></td>
                <td>${esc(o.customer_name)}<br><span style="color:var(--ink-soft);font-size:11.5px;">${esc(o.customer_phone)}</span></td>
                <td>${money(o.total)}</td>
                <td><span class="badge status-${o.status}">${o.status}</span></td>
                <td style="color:var(--ink-soft);">${fmtDate(o.created_at)}</td>
              </tr>`).join('') : `<tr class="empty-row"><td colspan="5">No orders yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ================= PRODUCTS ================= */
let productFilters = { search:'', category_id:'', status:'' };

async function renderProducts(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <input type="text" id="pSearch" placeholder="Search name, brand, SKU..." value="${esc(productFilters.search)}">
          <select id="pCat">
            <option value="">All categories</option>
            ${CATEGORIES.map(c=>`<option value="${c.id}" ${productFilters.category_id==c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select>
          <select id="pStatus">
            <option value="">All status</option>
            <option value="active" ${productFilters.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${productFilters.status==='inactive'?'selected':''}>Inactive</option>
          </select>
        </div>
        <button class="btn-primary" onclick="openProductModal()">+ Add Product</button>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr><th></th><th>Product</th><th>Category</th><th>Regular</th><th>Sale</th><th>Status</th><th>Featured</th><th></th></tr></thead>
          <tbody id="productsTbody"><tr class="empty-row"><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('pSearch').oninput = debounce(() => { productFilters.search = document.getElementById('pSearch').value; loadProductsTable(); }, 300);
  document.getElementById('pCat').onchange = () => { productFilters.category_id = document.getElementById('pCat').value; loadProductsTable(); };
  document.getElementById('pStatus').onchange = () => { productFilters.status = document.getElementById('pStatus').value; loadProductsTable(); };
  loadProductsTable();
}

let debounceTimers = {};
function debounce(fn, ms){
  const key = fn.toString();
  return (...args) => { clearTimeout(debounceTimers[key]); debounceTimers[key] = setTimeout(()=>fn(...args), ms); };
}

async function loadProductsTable(){
  const params = new URLSearchParams();
  if (productFilters.search) params.set('search', productFilters.search);
  if (productFilters.category_id) params.set('category_id', productFilters.category_id);
  if (productFilters.status) params.set('status', productFilters.status);
  const products = await api(`/products/admin/all?${params.toString()}`);
  const tbody = document.getElementById('productsTbody');
  if (!tbody) return;
  tbody.innerHTML = products.length ? products.map(p => `
    <tr>
      <td><div class="thumb">${p.image_path ? `<img src="${p.image_path}">` : `<svg viewBox="0 0 24 24" fill="none" stroke="#F86D30" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l3-4h12l3 4"/></svg>`}</div></td>
      <td class="name-cell"><div class="n">${esc(p.name)}</div><div class="s">${esc(p.sku)} ${p.brand?'· '+esc(p.brand):''}</div></td>
      <td>${esc(p.category_name || '—')}</td>
      <td>${money(p.regular_price)}</td>
      <td>${money(p.sale_price)} ${p.discount_pct>0?`<span style="color:var(--sale);font-weight:700;font-size:11.5px;">(${p.discount_pct}% off)</span>`:''}</td>
      <td><span class="badge ${p.active?'on':'off'}">${p.active?'Active':'Inactive'}</span></td>
      <td>${p.featured?'★':'—'}</td>
      <td class="actions-cell">
        <button onclick='openProductModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>Edit</button>
        <button onclick="toggleProductActive(${p.id})">${p.active?'Deactivate':'Activate'}</button>
        <button class="btn-danger" onclick="deleteProduct(${p.id})">Delete</button>
      </td>
    </tr>
  `).join('') : `<tr class="empty-row"><td colspan="8">No products found.</td></tr>`;
}

function openProductModal(p, prefillBarcode){
  const isEdit = !!p;
  openModal(`
    <h3>${isEdit ? 'Edit Product' : 'Add Product'}</h3>
    <div class="form-error" id="pmError"></div>
    <div class="img-upload">
      <div class="preview" id="pmPreview">${p && p.image_path ? `<img src="${p.image_path}">` : ''}</div>
      <div>
        <input type="file" id="pmImageFile" accept="image/*" onchange="uploadProductImage(this)">
        <div class="hint">JPG, PNG or WebP, up to 5MB. Optional — a placeholder icon shows if left blank.</div>
      </div>
    </div>
    <input type="hidden" id="pmImagePath" value="${p && p.image_path ? p.image_path : ''}">
    <div class="field-row">
      <div class="field"><label>SKU</label><input id="pmSku" value="${p?esc(p.sku):''}" placeholder="e.g. SM-0019"></div>
      <div class="field"><label>Barcode <span style="font-weight:600;color:var(--ink-soft);">(optional)</span></label><input id="pmBarcode" value="${p&&p.barcode?esc(p.barcode):(prefillBarcode?esc(prefillBarcode):'')}" placeholder="e.g. 8901234500011"></div>
    </div>
    <div class="field"><label>Category</label>
      <select id="pmCategory">
        <option value="">— None —</option>
        ${CATEGORIES.map(c=>`<option value="${c.id}" ${p&&p.category_id==c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Product Name</label><input id="pmName" value="${p?esc(p.name):''}" placeholder="e.g. Coca-Cola 2.25L"></div>
    <div class="field"><label>Brand</label><input id="pmBrand" value="${p?esc(p.brand||''):''}" placeholder="e.g. Coca-Cola"></div>
    <div class="field"><label>Description</label><textarea id="pmDesc" rows="2" placeholder="Shown on the product detail page">${p?esc(p.description||''):''}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Regular Price (Rs.)</label><input id="pmReg" type="number" min="0" step="0.01" value="${p?p.regular_price:''}"></div>
      <div class="field"><label>Sale Price (Rs.)</label><input id="pmSale" type="number" min="0" step="0.01" value="${p?p.sale_price:''}"></div>
    </div>
    <div class="checkbox-row"><input type="checkbox" id="pmTrackStock" ${p&&p.track_stock?'checked':''} onchange="document.getElementById('pmStockField').style.display=this.checked?'block':'none'"><label>Track stock quantity</label></div>
    <div class="field" id="pmStockField" style="display:${p&&p.track_stock?'block':'none'};"><label>Stock Quantity</label><input id="pmStock" type="number" min="0" value="${p&&p.stock_qty!=null?p.stock_qty:''}"></div>
    <div class="checkbox-row"><input type="checkbox" id="pmFeatured" ${p&&p.featured?'checked':''}><label>Featured (show in Today's Deals)</label></div>
    <div class="checkbox-row"><input type="checkbox" id="pmActive" ${!p||p.active?'checked':''}><label>Active (visible to customers)</label></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveProduct(${p?p.id:'null'})">${isEdit?'Save Changes':'Add Product'}</button>
    </div>
  `);
}

async function uploadProductImage(input){
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('image', file);
  try{
    const res = await api('/admin/upload/product-image', { method:'POST', body: fd });
    document.getElementById('pmImagePath').value = res.image_path;
    document.getElementById('pmPreview').innerHTML = `<img src="${res.image_path}">`;
  }catch(e){
    toast(e.message, true);
  }
}

async function saveProduct(id){
  const errEl = document.getElementById('pmError');
  const body = {
    sku: document.getElementById('pmSku').value.trim(),
    barcode: document.getElementById('pmBarcode').value.trim() || null,
    name: document.getElementById('pmName').value.trim(),
    category_id: document.getElementById('pmCategory').value || null,
    brand: document.getElementById('pmBrand').value.trim(),
    description: document.getElementById('pmDesc').value.trim(),
    regular_price: parseFloat(document.getElementById('pmReg').value),
    sale_price: parseFloat(document.getElementById('pmSale').value),
    image_path: document.getElementById('pmImagePath').value || null,
    track_stock: document.getElementById('pmTrackStock').checked,
    stock_qty: document.getElementById('pmStock').value ? parseInt(document.getElementById('pmStock').value,10) : null,
    featured: document.getElementById('pmFeatured').checked,
    active: document.getElementById('pmActive').checked,
  };
  if (!body.sku || !body.name || isNaN(body.regular_price) || isNaN(body.sale_price)){
    errEl.textContent = 'SKU, name, regular price and sale price are required.'; return;
  }
  if (body.sale_price > body.regular_price){
    errEl.textContent = 'Sale price cannot be greater than regular price.'; return;
  }
  try{
    if (id) await api(`/products/admin/${id}`, { method:'PUT', body: JSON.stringify(body) });
    else await api('/products/admin', { method:'POST', body: JSON.stringify(body) });
    closeModal();
    toast(id ? 'Product updated.' : 'Product added.');
    loadProductsTable();
  }catch(e){
    errEl.textContent = e.message;
  }
}
async function toggleProductActive(id){
  await api(`/products/admin/${id}/toggle-active`, { method:'PATCH' });
  loadProductsTable();
}
async function deleteProduct(id){
  if (!confirm('Delete this product permanently? This cannot be undone.')) return;
  await api(`/products/admin/${id}`, { method:'DELETE' });
  toast('Product deleted.');
  loadProductsTable();
}

/* ================= CATEGORIES ================= */
async function renderCategories(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Categories</h3><button class="btn-primary" onclick="openCategoryModal()">+ Add Category</button></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Name</th><th>Products</th><th>Status</th><th></th></tr></thead>
          <tbody id="catsTbody"><tr class="empty-row"><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  loadCategoriesTable();
}
async function loadCategoriesTable(){
  const cats = await api('/categories/admin/all');
  const products = await api('/products/admin/all');
  const counts = {};
  products.forEach(p => { counts[p.category_id] = (counts[p.category_id]||0) + 1; });
  document.getElementById('catsTbody').innerHTML = cats.length ? cats.map(c => `
    <tr>
      <td><b>${esc(c.name)}</b></td>
      <td>${counts[c.id]||0}</td>
      <td><span class="badge ${c.active?'on':'off'}">${c.active?'Active':'Inactive'}</span></td>
      <td class="actions-cell">
        <button onclick='openCategoryModal(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Edit</button>
        <button class="btn-danger" onclick="deleteCategory(${c.id})">Delete</button>
      </td>
    </tr>
  `).join('') : `<tr class="empty-row"><td colspan="4">No categories yet.</td></tr>`;
}
function openCategoryModal(c){
  openModal(`
    <h3>${c?'Edit Category':'Add Category'}</h3>
    <div class="form-error" id="cmError"></div>
    <div class="field"><label>Category Name</label><input id="cmName" value="${c?esc(c.name):''}" placeholder="e.g. Frozen Foods"></div>
    <div class="checkbox-row"><input type="checkbox" id="cmActive" ${!c||c.active?'checked':''}><label>Active (visible to customers)</label></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCategory(${c?c.id:'null'})">${c?'Save Changes':'Add Category'}</button>
    </div>
  `);
}
async function saveCategory(id){
  const name = document.getElementById('cmName').value.trim();
  const active = document.getElementById('cmActive').checked;
  const errEl = document.getElementById('cmError');
  if (!name){ errEl.textContent = 'Category name is required.'; return; }
  try{
    if (id) await api(`/categories/admin/${id}`, { method:'PUT', body: JSON.stringify({ name, active }) });
    else await api('/categories/admin', { method:'POST', body: JSON.stringify({ name }) });
    closeModal();
    toast('Category saved.');
    CATEGORIES = await api('/categories/admin/all');
    loadCategoriesTable();
  }catch(e){ errEl.textContent = e.message; }
}
async function deleteCategory(id){
  if (!confirm('Delete this category?')) return;
  try{
    await api(`/categories/admin/${id}`, { method:'DELETE' });
    toast('Category deleted.');
    CATEGORIES = await api('/categories/admin/all');
    loadCategoriesTable();
  }catch(e){ toast(e.message, true); }
}

/* ================= ORDERS ================= */
let orderFilter = '';
async function renderOrders(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <select id="oStatus">
            <option value="">All statuses</option>
            ${['NEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED'].map(s=>`<option value="${s}" ${orderFilter===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
          <tbody id="ordersTbody"><tr class="empty-row"><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('oStatus').onchange = () => { orderFilter = document.getElementById('oStatus').value; loadOrdersTable(); };
  loadOrdersTable();
}
async function loadOrdersTable(){
  const params = new URLSearchParams();
  if (orderFilter) params.set('status', orderFilter);
  const orders = await api(`/orders/admin/all?${params.toString()}`);
  document.getElementById('ordersTbody').innerHTML = orders.length ? orders.map(o => `
    <tr style="cursor:pointer" onclick="viewOrder(${o.id})">
      <td><b>${o.order_number}</b>${o.coupon_code?`<br><span style="color:var(--marigold-dark);font-size:11px;font-weight:700;">${o.coupon_code}</span>`:''}</td>
      <td>${esc(o.customer_name)}<br><span style="color:var(--ink-soft);font-size:11.5px;">${esc(o.customer_phone)}</span></td>
      <td>${o.discount>0?`<span style="color:var(--ink-soft);">−${money(o.discount)} disc.</span>`:'—'}</td>
      <td><b>${money(o.total)}</b></td>
      <td><span class="badge status-${o.status}">${o.status}</span></td>
      <td style="color:var(--ink-soft);">${fmtDate(o.created_at)}</td>
    </tr>
  `).join('') : `<tr class="empty-row"><td colspan="6">No orders found.</td></tr>`;
}
const STATUS_FLOW = ['NEW','CONFIRMED','PREPARING','READY','COMPLETED'];
async function viewOrder(id){
  const o = await api(`/orders/admin/${id}`);
  openModal(`
    <h3>Order ${o.order_number}</h3>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:4px;">${esc(o.customer_name)} · ${esc(o.customer_phone)}</div>
    <div style="font-size:12px;color:var(--ink-soft);margin-bottom:8px;">${fmtDate(o.created_at)}${o.note?' · Note: '+esc(o.note):''}</div>
    ${o.customer_note ? `<div class="badge on" style="margin-bottom:14px;">★ ${esc(o.customer_note)}</div>` : ''}
    <div class="order-items-list">
      ${o.items.map(i => `<div class="oi"><span>${esc(i.product_name)} × ${i.qty}</span><span>${money(i.line_total)}</span></div>`).join('')}
    </div>
    <div class="order-total-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
    ${o.discount>0?`<div class="order-total-row"><span>Discount ${o.coupon_code?'('+o.coupon_code+')':''}</span><span>−${money(o.discount)}</span></div>`:''}
    <div class="order-total-row grand"><span>Total</span><span>${money(o.total)}</span></div>
    <div class="status-select">
      <label style="font-size:12.5px;font-weight:700;">Status:</label>
      <select id="statusSelect">
        ${['NEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <button class="btn-primary" onclick="updateOrderStatus(${o.id})">Update</button>
    </div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Close</button></div>
  `);
}
async function updateOrderStatus(id){
  const status = document.getElementById('statusSelect').value;
  await api(`/orders/admin/${id}/status`, { method:'PATCH', body: JSON.stringify({ status }) });
  closeModal();
  toast('Order status updated.');
  loadOrdersTable();
}

/* ================= CUSTOMERS ================= */
let customerSearch = '';
async function renderCustomers(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <input type="text" id="custSearch" placeholder="Search phone, name, or note...">
        </div>
        <button class="btn-primary" onclick="openCustomerModal()">+ Add Customer</button>
      </div>
      <div class="panel-body">
        <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 10px;">
          Add a customer here using the phone number from your POS bill (with a note like "Gold Member") — any online order placed from that same number links to it automatically.
        </p>
        <table>
          <thead><tr><th>Phone</th><th>Name</th><th>Note</th><th>Source</th><th>Online Orders</th><th></th></tr></thead>
          <tbody id="custTbody"><tr class="empty-row"><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('custSearch').oninput = debounce(() => { customerSearch = document.getElementById('custSearch').value; loadCustomersTable(); }, 300);
  loadCustomersTable();
}
async function loadCustomersTable(){
  const params = new URLSearchParams();
  if (customerSearch) params.set('search', customerSearch);
  const customers = await api(`/customers/admin/all?${params.toString()}`);
  document.getElementById('custTbody').innerHTML = customers.length ? customers.map(c => `
    <tr>
      <td><b>${esc(c.phone)}</b></td>
      <td>${esc(c.name || '—')}</td>
      <td>${c.note ? `<span class="badge on">${esc(c.note)}</span>` : '—'}</td>
      <td style="text-transform:capitalize;color:var(--ink-soft);">${c.source}</td>
      <td>${c.order_count}</td>
      <td class="actions-cell">
        <button onclick='openCustomerModal(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Edit</button>
        <button class="btn-danger" onclick="deleteCustomer(${c.id})">Delete</button>
      </td>
    </tr>
  `).join('') : `<tr class="empty-row"><td colspan="6">No customers yet — they'll appear here as soon as someone orders, or add one manually from your POS list.</td></tr>`;
}
function openCustomerModal(c){
  openModal(`
    <h3>${c?'Edit Customer':'Add Customer'}</h3>
    <div class="form-error" id="ctError"></div>
    <div class="field"><label>Phone Number</label><input id="ctPhone" value="${c?esc(c.phone):''}" placeholder="e.g. 9812345678" ${c?'':''}></div>
    <div class="field"><label>Name</label><input id="ctName" value="${c?esc(c.name||''):''}" placeholder="e.g. Sunita Sharma"></div>
    <div class="field"><label>Note <span style="font-weight:600;color:var(--ink-soft);">(e.g. membership / subscription tier from POS)</span></label><input id="ctNote" value="${c?esc(c.note||''):''}" placeholder="e.g. Gold Member"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCustomer(${c?c.id:'null'})">${c?'Save Changes':'Add Customer'}</button>
    </div>
  `);
}
async function saveCustomer(id){
  const errEl = document.getElementById('ctError');
  const body = {
    phone: document.getElementById('ctPhone').value.trim(),
    name: document.getElementById('ctName').value.trim(),
    note: document.getElementById('ctNote').value.trim(),
  };
  if (!body.phone){ errEl.textContent = 'Phone number is required.'; return; }
  try{
    if (id) await api(`/customers/admin/${id}`, { method:'PUT', body: JSON.stringify(body) });
    else await api('/customers/admin', { method:'POST', body: JSON.stringify(body) });
    closeModal();
    toast('Customer saved.');
    loadCustomersTable();
  }catch(e){ errEl.textContent = e.message; }
}
async function deleteCustomer(id){
  if (!confirm('Delete this customer record?')) return;
  await api(`/customers/admin/${id}`, { method:'DELETE' });
  toast('Customer deleted.');
  loadCustomersTable();
}

/* ================= SCAN STOCK ================= */
let scanCameraStream = null;
let scanLoopActive = false;

function renderScan(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Scan Barcode</h3></div>
      <div class="panel-body">
        <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;">
          Works with a USB/Bluetooth barcode scanner gun (just scan — it types into the box below and submits automatically), or type the number by hand. Camera scanning is also available if your browser and connection support it.
        </p>
        <div class="scan-input-row">
          <input type="text" id="scanInput" placeholder="Scan or type a barcode number…" autofocus>
          <button class="btn-primary" onclick="lookupBarcode()">Look Up</button>
          <button class="btn-secondary" id="cameraToggleBtn" onclick="toggleCameraScan()">📷 Camera</button>
        </div>
        <video id="scanVideo" style="display:none;width:100%;max-width:360px;border-radius:12px;margin-top:14px;" muted playsinline></video>
        <div id="scanResult"></div>
      </div>
    </div>
  `;
  const input = document.getElementById('scanInput');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); lookupBarcode(); } });
}

async function toggleCameraScan(){
  if (scanCameraStream){ stopCameraScan(); return; }
  if (!('BarcodeDetector' in window)){
    toast('Camera scanning isn\'t supported in this browser. Use a scanner gun or type the number instead.', true);
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('scanVideo');
    video.srcObject = stream;
    video.style.display = 'block';
    await video.play();
    scanCameraStream = stream;
    scanLoopActive = true;
    document.getElementById('cameraToggleBtn').textContent = '⏹ Stop Camera';
    const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','codabar','itf'] });
    const loop = async () => {
      if (!scanLoopActive) return;
      try{
        const codes = await detector.detect(video);
        if (codes.length > 0){
          document.getElementById('scanInput').value = codes[0].rawValue;
          stopCameraScan();
          lookupBarcode();
          return;
        }
      }catch(e){ /* keep trying */ }
      requestAnimationFrame(loop);
    };
    loop();
  }catch(e){
    toast('Could not access the camera: ' + e.message + ' — over a local http:// address, phone browsers usually block this. Use a scanner gun or manual entry instead.', true);
  }
}
function stopCameraScan(){
  scanLoopActive = false;
  if (scanCameraStream){ scanCameraStream.getTracks().forEach(t => t.stop()); scanCameraStream = null; }
  const video = document.getElementById('scanVideo');
  if (video){ video.style.display = 'none'; video.srcObject = null; }
  const btn = document.getElementById('cameraToggleBtn');
  if (btn) btn.textContent = '📷 Camera';
}

async function lookupBarcode(){
  const code = document.getElementById('scanInput').value.trim();
  const resultEl = document.getElementById('scanResult');
  if (!code) return;
  resultEl.innerHTML = `<p style="margin-top:16px;color:var(--ink-soft);">Looking up ${esc(code)}…</p>`;
  try{
    const p = await api(`/products/admin/barcode/${encodeURIComponent(code)}`);
    resultEl.innerHTML = `
      <div class="scan-result-card">
        <div class="thumb" style="width:56px;height:56px;">${p.image_path?`<img src="${p.image_path}">`:`<svg viewBox="0 0 24 24" fill="none" stroke="#F86D30" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l3-4h12l3 4"/></svg>`}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;">${esc(p.name)}</div>
          <div style="font-size:12px;color:var(--ink-soft);">${esc(p.sku)} ${p.brand?'· '+esc(p.brand):''} · Barcode ${esc(p.barcode)}</div>
          <div style="font-size:13px;margin-top:4px;"><b>${money(p.sale_price)}</b> ${p.regular_price>p.sale_price?`<span style="text-decoration:line-through;color:var(--ink-soft);">${money(p.regular_price)}</span>`:''}</div>
        </div>
      </div>
      <div class="field-row" style="margin-top:16px;">
        <div class="checkbox-row" style="margin-bottom:0;"><input type="checkbox" id="scanTrackStock" ${p.track_stock?'checked':''}><label>Track stock for this product</label></div>
      </div>
      <div class="field"><label>Current Stock Quantity</label>
        <div style="display:flex;gap:10px;align-items:center;">
          <button class="btn-secondary" onclick="document.getElementById('scanStockQty').stepDown()">−</button>
          <input id="scanStockQty" type="number" min="0" value="${p.stock_qty!=null?p.stock_qty:0}" style="width:100px;text-align:center;border:1.5px solid var(--line);border-radius:10px;padding:10px;">
          <button class="btn-secondary" onclick="document.getElementById('scanStockQty').stepUp()">+</button>
        </div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start;">
        <button class="btn-primary" onclick="saveScanStock(${p.id})">Save Stock</button>
        <button class="btn-secondary" onclick='openProductModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>Edit Full Product</button>
      </div>
    `;
  }catch(e){
    resultEl.innerHTML = `
      <p style="margin-top:16px;color:var(--sale);font-weight:700;">No product matches barcode "${esc(code)}".</p>
      <button class="btn-primary" onclick="openProductModal(null, ${JSON.stringify(code)})">+ Add as New Product</button>
    `;
  }
}

async function saveScanStock(id){
  const track_stock = document.getElementById('scanTrackStock').checked;
  const stock_qty = parseInt(document.getElementById('scanStockQty').value, 10) || 0;
  try{
    await api(`/products/admin/${id}`, { method:'PUT', body: JSON.stringify({ track_stock, stock_qty }) });
    toast('Stock updated.');
    document.getElementById('scanInput').value = '';
    document.getElementById('scanResult').innerHTML = '';
    document.getElementById('scanInput').focus();
  }catch(e){ toast(e.message, true); }
}

/* ================= COUPONS ================= */
async function renderCoupons(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Coupons</h3><button class="btn-primary" onclick="openCouponModal()">+ Add Coupon</button></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Valid Dates</th><th>Status</th><th></th></tr></thead>
          <tbody id="couponsTbody"><tr class="empty-row"><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
  loadCouponsTable();
}
async function loadCouponsTable(){
  const coupons = await api('/coupons/admin/all');
  document.getElementById('couponsTbody').innerHTML = coupons.length ? coupons.map(c => `
    <tr>
      <td><b>${esc(c.code)}</b></td>
      <td>${c.type==='percent' ? c.value+'% off' : money(c.value)+' off'}${c.max_discount?` (max ${money(c.max_discount)})`:''}</td>
      <td>${c.min_order>0?money(c.min_order):'—'}</td>
      <td>${c.used_count}${c.usage_limit!=null?' / '+c.usage_limit:''}</td>
      <td style="font-size:12px;color:var(--ink-soft);">${c.start_date||'—'} to ${c.end_date||'—'}</td>
      <td><span class="badge ${c.active?'on':'off'}">${c.active?'Active':'Inactive'}</span></td>
      <td class="actions-cell">
        <button onclick='openCouponModal(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Edit</button>
        <button class="btn-danger" onclick="deleteCoupon(${c.id})">Delete</button>
      </td>
    </tr>
  `).join('') : `<tr class="empty-row"><td colspan="7">No coupons yet.</td></tr>`;
}
function openCouponModal(c){
  openModal(`
    <h3>${c?'Edit Coupon':'Add Coupon'}</h3>
    <div class="form-error" id="cpError"></div>
    <div class="field"><label>Coupon Code</label><input id="cpCode" value="${c?esc(c.code):''}" placeholder="e.g. SATYAL10" style="text-transform:uppercase;"></div>
    <div class="field-row">
      <div class="field"><label>Discount Type</label>
        <select id="cpType">
          <option value="percent" ${c&&c.type==='percent'?'selected':''}>Percentage (%)</option>
          <option value="flat" ${c&&c.type==='flat'?'selected':''}>Flat Amount (Rs.)</option>
        </select>
      </div>
      <div class="field"><label>Value</label><input id="cpValue" type="number" min="0" step="0.01" value="${c?c.value:''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Minimum Order (Rs.)</label><input id="cpMin" type="number" min="0" value="${c?c.min_order:0}"></div>
      <div class="field"><label>Max Discount (Rs., optional)</label><input id="cpMax" type="number" min="0" value="${c&&c.max_discount!=null?c.max_discount:''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Date (optional)</label><input id="cpStart" type="date" value="${c&&c.start_date?c.start_date.slice(0,10):''}"></div>
      <div class="field"><label>End Date (optional)</label><input id="cpEnd" type="date" value="${c&&c.end_date?c.end_date.slice(0,10):''}"></div>
    </div>
    <div class="field"><label>Usage Limit (optional)</label><input id="cpLimit" type="number" min="0" value="${c&&c.usage_limit!=null?c.usage_limit:''}"></div>
    <div class="checkbox-row"><input type="checkbox" id="cpActive" ${!c||c.active?'checked':''}><label>Active</label></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCoupon(${c?c.id:'null'})">${c?'Save Changes':'Add Coupon'}</button>
    </div>
  `);
}
async function saveCoupon(id){
  const errEl = document.getElementById('cpError');
  const body = {
    code: document.getElementById('cpCode').value.trim().toUpperCase(),
    type: document.getElementById('cpType').value,
    value: parseFloat(document.getElementById('cpValue').value),
    min_order: parseFloat(document.getElementById('cpMin').value) || 0,
    max_discount: document.getElementById('cpMax').value ? parseFloat(document.getElementById('cpMax').value) : null,
    start_date: document.getElementById('cpStart').value || null,
    end_date: document.getElementById('cpEnd').value || null,
    usage_limit: document.getElementById('cpLimit').value ? parseInt(document.getElementById('cpLimit').value,10) : null,
    active: document.getElementById('cpActive').checked,
  };
  if (!body.code || isNaN(body.value)){ errEl.textContent = 'Coupon code and value are required.'; return; }
  try{
    if (id) await api(`/coupons/admin/${id}`, { method:'PUT', body: JSON.stringify(body) });
    else await api('/coupons/admin', { method:'POST', body: JSON.stringify(body) });
    closeModal();
    toast('Coupon saved.');
    loadCouponsTable();
  }catch(e){ errEl.textContent = e.message; }
}
async function deleteCoupon(id){
  if (!confirm('Delete this coupon?')) return;
  await api(`/coupons/admin/${id}`, { method:'DELETE' });
  toast('Coupon deleted.');
  loadCouponsTable();
}

/* ================= IMPORT EXCEL ================= */
let importPreviewRows = [];
async function renderImport(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Import Products from Excel / CSV</h3></div>
      <div class="panel-body">
        <p style="font-size:13px;color:var(--ink-soft);line-height:1.6;">
          Expected columns: <b>SKU, Product Name, Category, Brand, Barcode, Regular Price, Sale Price, Active</b> (Barcode is optional).
          SKU is used to match existing products — matching rows update the product, new SKUs create one.
        </p>
        <label class="dropzone" for="importFile">
          <input type="file" id="importFile" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handleImportFile(this)">
          📄 Click to choose an Excel or CSV file
        </label>
        <div id="importResults"></div>
      </div>
    </div>
  `;
}
async function handleImportFile(input){
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const resultsEl = document.getElementById('importResults');
  resultsEl.innerHTML = `<p style="margin-top:16px;color:var(--ink-soft);">Reading file…</p>`;
  try{
    const preview = await api('/admin/import/preview', { method:'POST', body: fd });
    importPreviewRows = preview.rows;
    resultsEl.innerHTML = `
      <div class="import-summary">
        <div class="isum"><div class="v">${preview.total}</div><div class="l">Rows found</div></div>
        <div class="isum"><div class="v" style="color:var(--green-900);">${preview.valid}</div><div class="l">Valid rows</div></div>
        <div class="isum"><div class="v" style="color:var(--sale);">${preview.errors}</div><div class="l">Rows with errors</div></div>
      </div>
      <div class="import-table-wrap">
        <table>
          <thead><tr><th>Row</th><th>SKU</th><th>Name</th><th>Category</th><th>Reg.</th><th>Sale</th><th>Action / Errors</th></tr></thead>
          <tbody>
            ${preview.rows.map(r => `
              <tr>
                <td>${r.row}</td>
                <td>${esc(r.sku)}</td>
                <td>${esc(r.name)}</td>
                <td>${esc(r.category)}</td>
                <td>${isNaN(r.regular_price)?'—':money(r.regular_price)}</td>
                <td>${isNaN(r.sale_price)?'—':money(r.sale_price)}</td>
                <td>${r.action==='error'
                  ? `<span style="color:var(--sale);font-weight:700;">${r.errors.join(' ')}</span>`
                  : `<span class="badge ${r.action==='create'?'on':'off'}">${r.action==='create'?'New':'Update'}</span>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn-secondary" onclick="document.getElementById('importResults').innerHTML='';document.getElementById('importFile').value='';">Cancel</button>
        <button class="btn-primary" ${preview.valid===0?'disabled':''} onclick="confirmImport()">Import ${preview.valid} Valid Row${preview.valid!==1?'s':''}</button>
      </div>
    `;
  }catch(e){
    resultsEl.innerHTML = `<p style="margin-top:16px;color:var(--sale);font-weight:700;">${esc(e.message)}</p>`;
  }
}
async function confirmImport(){
  const validRows = importPreviewRows.filter(r => r.action !== 'error').map(r => ({
    sku: r.sku, name: r.name, category: r.category, brand: r.brand, barcode: r.barcode,
    regular_price: r.regular_price, sale_price: r.sale_price, active: r.active
  }));
  try{
    const result = await api('/admin/import/confirm', { method:'POST', body: JSON.stringify({ rows: validRows }) });
    toast(`Imported: ${result.created} created, ${result.updated} updated.`);
    CATEGORIES = await api('/categories/admin/all');
    document.getElementById('importResults').innerHTML = `<p style="margin-top:16px;color:var(--green-900);font-weight:700;">✓ ${result.created} product(s) created, ${result.updated} updated, ${result.skipped} skipped.</p>`;
    document.getElementById('importFile').value = '';
  }catch(e){
    toast(e.message, true);
  }
}

/* ================= REPORTS ================= */
async function renderReports(){
  const content = document.getElementById('content');
  content.innerHTML = `<div class="panel"><div class="panel-body" style="padding-top:18px;">Loading…</div></div>`;
  const [top, coupons] = await Promise.all([
    api('/admin/reports/top-products'),
    api('/admin/reports/coupon-usage')
  ]);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Most Ordered Products</h3></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Product</th><th>Brand</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
          <tbody>
            ${top.length ? top.map(t => `<tr><td>${esc(t.product_name)}</td><td>${esc(t.brand||'')}</td><td>${t.total_qty}</td><td>${money(t.total_revenue)}</td></tr>`).join('') : `<tr class="empty-row"><td colspan="4">No sales data yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Coupon Usage</h3></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Status</th></tr></thead>
          <tbody>
            ${coupons.length ? coupons.map(c => `<tr><td><b>${esc(c.code)}</b></td><td>${c.type==='percent'?c.value+'%':money(c.value)}</td><td>${c.used_count}${c.usage_limit!=null?' / '+c.usage_limit:''}</td><td><span class="badge ${c.active?'on':'off'}">${c.active?'Active':'Inactive'}</span></td></tr>`).join('') : `<tr class="empty-row"><td colspan="4">No coupons yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Export</h3></div>
      <div class="panel-body">
        <a href="${API}/admin/reports/export/orders.csv" class="btn-secondary" style="text-decoration:none;display:inline-block;">⬇ Download Orders CSV</a>
      </div>
    </div>
  `;
}

/* ================= QR CODE ================= */
async function renderQr(){
  const content = document.getElementById('content');
  const settings = await api('/settings');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Store QR Code</h3></div>
      <div class="panel-body qr-panel">
        <div class="qr-image">
          <img src="${API}/settings/admin/qr.png?t=${Date.now()}" alt="Satyal Mart QR code">
          <div class="cap">Scan to open the catalog</div>
        </div>
        <div style="flex:1;min-width:240px;">
          <div class="field">
            <label>Catalog URL (what the QR code points to)</label>
            <input id="qrUrl" value="${esc(settings.qr_target_url||'')}" placeholder="http://satyal-mart.local:3000">
            <div class="hint">For the local Wi-Fi version, use this computer's local IP address, e.g. http://192.168.1.20:3000, so customer phones on the same Wi-Fi can reach it.</div>
          </div>
          <button class="btn-primary" onclick="saveQrUrl()">Save & Regenerate</button>
          <a href="${API}/settings/admin/qr.png" download="satyal-mart-qr.png" class="btn-secondary" style="text-decoration:none;display:inline-block;margin-left:10px;">⬇ Download PNG</a>
        </div>
      </div>
    </div>
  `;
}
async function saveQrUrl(){
  const qr_target_url = document.getElementById('qrUrl').value.trim();
  await api('/settings/admin', { method:'PUT', body: JSON.stringify({ qr_target_url }) });
  toast('QR code updated.');
  renderQr();
}

/* ================= SETTINGS ================= */
async function renderSettings(){
  const content = document.getElementById('content');
  const s = await api('/settings');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Store Details</h3></div>
      <div class="panel-body">
        <div class="field"><label>Store Name</label><input id="stName" value="${esc(s.store_name||'')}"></div>
        <div class="field"><label>Promo Banner Title</label><input id="stBannerT" value="${esc(s.banner_title||'')}"></div>
        <div class="field"><label>Promo Banner Subtitle</label><input id="stBannerS" value="${esc(s.banner_subtitle||'')}"></div>
        <button class="btn-primary" onclick="saveStoreSettings()">Save Changes</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Change Admin Password</h3></div>
      <div class="panel-body">
        <div class="form-error" id="pwError"></div>
        <div class="field"><label>Current Password</label><input id="pwCurrent" type="password"></div>
        <div class="field"><label>New Password</label><input id="pwNew" type="password"></div>
        <button class="btn-primary" onclick="changePassword()">Update Password</button>
      </div>
    </div>
  `;
}
async function saveStoreSettings(){
  await api('/settings/admin', { method:'PUT', body: JSON.stringify({
    store_name: document.getElementById('stName').value.trim(),
    banner_title: document.getElementById('stBannerT').value.trim(),
    banner_subtitle: document.getElementById('stBannerS').value.trim(),
  })});
  toast('Settings saved.');
}
async function changePassword(){
  const errEl = document.getElementById('pwError');
  try{
    await api('/auth/change-password', { method:'POST', body: JSON.stringify({
      currentPassword: document.getElementById('pwCurrent').value,
      newPassword: document.getElementById('pwNew').value
    })});
    toast('Password updated.');
    document.getElementById('pwCurrent').value = '';
    document.getElementById('pwNew').value = '';
  }catch(e){ errEl.textContent = e.message; }
}

/* ---------------- INIT ---------------- */
checkSession();
