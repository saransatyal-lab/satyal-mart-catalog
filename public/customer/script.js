const API = '/api';

/* ---------------- ICONS (fallback illustrations when a product has no photo) ---------------- */
const ICONS = {
  Beverages: `<svg viewBox="0 0 64 64" fill="none"><path d="M26 6h12v8l4 6v34a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V20l4-6V6z" fill="{c1}"/><rect x="26" y="6" width="12" height="6" rx="1.5" fill="{c2}"/><rect x="22" y="30" width="20" height="16" rx="2" fill="{c2}" opacity="0.85"/></svg>`,
  Snacks: `<svg viewBox="0 0 64 64" fill="none"><path d="M16 10h32l4 44a3 3 0 0 1-3 3.4H15a3 3 0 0 1-3-3.4L16 10z" fill="{c1}"/><path d="M16 10h32l1.4 15H14.6L16 10z" fill="{c2}"/><circle cx="32" cy="34" r="7" fill="#fff" opacity="0.9"/><circle cx="32" cy="34" r="4.2" fill="{c1}"/></svg>`,
  Dairy: `<svg viewBox="0 0 64 64" fill="none"><path d="M22 8h20l3 10v34a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V18l3-10z" fill="{c1}"/><path d="M22 8h20l2 7H20l2-7z" fill="{c2}"/><rect x="19" y="30" width="26" height="12" fill="#fff" opacity="0.85"/></svg>`,
  Bakery: `<svg viewBox="0 0 64 64" fill="none"><path d="M8 34c0-12 8-22 24-22s24 10 24 22-6 20-24 20S8 46 8 34z" fill="{c1}"/><path d="M14 34c0-9 7-17 18-17s18 8 18 17" stroke="{c2}" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`,
  Grocery: `<svg viewBox="0 0 64 64" fill="none"><path d="M14 14h36v6l4 30a4 4 0 0 1-4 4.4H14A4 4 0 0 1 10 50l4-30v-6z" fill="{c1}"/><rect x="14" y="14" width="36" height="7" fill="{c2}"/><circle cx="32" cy="36" r="10" fill="#fff" opacity="0.9"/></svg>`,
  'Personal Care': `<svg viewBox="0 0 64 64" fill="none"><rect x="12" y="20" width="40" height="26" rx="6" fill="{c1}"/><rect x="12" y="20" width="40" height="9" rx="4.5" fill="{c2}"/></svg>`,
  Household: `<svg viewBox="0 0 64 64" fill="none"><rect x="22" y="18" width="16" height="34" rx="3" fill="{c1}"/><rect x="26" y="8" width="8" height="10" rx="2" fill="{c2}"/><path d="M34 10h8l-3 4h-5z" fill="{c2}"/></svg>`,
};
const PALETTE = [['#7A1F2B','#4A1119'],['#D97A2B','#7A3D0F'],['#2E7DAF','#1A4A66'],['#E8A33D','#C6811E'],['#D0473C','#8F2B22'],['#3D8A6A','#1F4D3A'],['#C6811E','#8A5B15'],['#5B8A4A','#3D6534']];

function hashColor(seed){ return PALETTE[seed % PALETTE.length]; }
function productIcon(p){
  if (p.image_path) return `<img src="${p.image_path}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
  const tpl = ICONS[p.category_name] || ICONS.Grocery;
  const [c1, c2] = hashColor(p.id);
  return tpl.replaceAll('{c1}', c1).replaceAll('{c2}', c2);
}

/* ---------------- STATE ---------------- */
let state = {
  categories: ['All'],
  products: [],
  category: 'All',
  search: '',
  cart: {},       // productId -> qty
  coupon: null,   // { code, discount }
  couponError: null,
  loading: true
};

function money(n){ return 'Rs. ' + Number(n).toLocaleString('en-IN'); }
function getProduct(id){ return state.products.find(p => p.id === id); }
let searchDebounce;

/* ---------------- LOAD DATA ---------------- */
async function loadCategories(){
  const res = await fetch(`${API}/categories`);
  const cats = await res.json();
  state.categories = ['All', ...cats.map(c => c.name)];
  renderCats();
}
async function loadProducts(){
  const params = new URLSearchParams();
  if (state.category !== 'All') params.set('category', state.category);
  if (state.search) params.set('search', state.search);
  const res = await fetch(`${API}/products?${params.toString()}`);
  state.products = await res.json();
  renderGrid();
}
async function loadSettings(){
  try{
    const res = await fetch(`${API}/settings`);
    const s = await res.json();
    if (s.store_name) document.querySelector('.wordmark .name').textContent = s.store_name;
    if (s.banner_title) document.querySelector('.banner .h').textContent = s.banner_title;
    if (s.banner_subtitle) document.querySelector('.banner .s').textContent = s.banner_subtitle;
  }catch(e){ /* non-critical */ }
}

/* ---------------- RENDER: CATEGORIES ---------------- */
function renderCats(){
  const el = document.getElementById('cats');
  el.innerHTML = state.categories.map(c =>
    `<button class="cat-chip ${c===state.category?'active':''}" onclick="setCategory('${c.replace(/'/g,"\\'")}')">${c}</button>`
  ).join('');
}
function setCategory(c){ state.category = c; renderCats(); loadProducts(); }
function onSearch(){
  state.search = document.getElementById('searchInput').value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProducts, 250);
}

/* ---------------- RENDER: GRID ---------------- */
function pct(reg, sale){ return reg > sale ? Math.round(((reg-sale)/reg)*100) : 0; }

function renderGrid(){
  document.getElementById('sectionTitle').textContent = state.search ? 'Search Results' : state.category;
  document.getElementById('resultCount').textContent = state.products.length + (state.products.length===1 ? ' item' : ' items');
  const grid = document.getElementById('grid');
  const existingEmpty = document.getElementById('emptyState');
  if (existingEmpty) existingEmpty.remove();

  if (state.products.length === 0){
    grid.innerHTML = '';
    grid.insertAdjacentHTML('afterend', `<div class="empty" id="emptyState"><svg class="e-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><div>No products match your search.</div></div>`);
    return;
  }

  grid.innerHTML = state.products.map(p => {
    const off = pct(p.regular_price, p.sale_price);
    const outOfStock = p.track_stock && p.stock_qty != null && p.stock_qty <= 0;
    const qty = state.cart[p.id] || 0;
    return `
    <div class="card">
      <div class="card-media" onclick="openProduct(${p.id})">
        ${off>0?`<span class="badge-off">${off}% OFF</span>`:''}
        ${outOfStock?`<span class="badge-stock">Out of stock</span>`:''}
        ${productIcon(p)}
      </div>
      <div class="card-body">
        <div class="card-brand">${p.brand||''}</div>
        <div class="card-name" onclick="openProduct(${p.id})">${p.name}</div>
        <div class="price-row">
          <span class="price-sale">${money(p.sale_price)}</span>
          ${p.regular_price>p.sale_price?`<span class="price-reg">${money(p.regular_price)}</span>`:''}
        </div>
        <div class="card-foot">
          ${qty>0 ? `
            <div class="stepper">
              <button onclick="changeQty(${p.id},-1)">−</button>
              <span class="qty">${qty}</span>
              <button onclick="changeQty(${p.id},1)">+</button>
            </div>` : `
            <button class="add-btn" ${outOfStock?'style="opacity:0.4;pointer-events:none;"':''} onclick="changeQty(${p.id},1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Add
            </button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- CART LOGIC ---------------- */
function changeQty(id, delta){
  const p = getProduct(id);
  const outOfStock = p.track_stock && p.stock_qty != null && p.stock_qty <= 0;
  if (outOfStock && delta > 0) return;
  const cur = state.cart[id] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete state.cart[id]; else state.cart[id] = next;
  state.coupon = null; // re-validate coupon whenever cart changes
  renderGrid();
  renderCartBar();
  if (document.getElementById('cartSheet').classList.contains('show')) renderCartSheet();
  if (document.getElementById('pdSheet').classList.contains('show')) renderPdQty(id);
}
function cartCount(){ return Object.values(state.cart).reduce((a,b)=>a+b,0); }
function cartSubtotal(){ return Object.entries(state.cart).reduce((s,[id,q]) => s + getProduct(+id).sale_price*q, 0); }
function cartRegTotal(){ return Object.entries(state.cart).reduce((s,[id,q]) => s + getProduct(+id).regular_price*q, 0); }

function renderCartBar(){
  const count = cartCount();
  const bar = document.getElementById('cartbar');
  const badge = document.getElementById('cartBadge');
  if (count > 0){
    bar.classList.add('show');
    badge.style.display='flex';
    badge.textContent = count;
    document.getElementById('cartbarCount').textContent = count;
    document.getElementById('cartbarTotal').textContent = money(cartSubtotal());
  } else {
    bar.classList.remove('show');
    badge.style.display='none';
  }
}

/* ---------------- SHEETS ---------------- */
function closeAllSheets(){
  ['pdSheet','cartSheet','checkoutSheet','confirmSheet'].forEach(id=>document.getElementById(id).classList.remove('show'));
  document.getElementById('overlay').classList.remove('show');
}
function showSheet(id){
  document.getElementById('overlay').classList.add('show');
  document.getElementById(id).classList.add('show');
}

/* Product detail */
let activePid = null;
function openProduct(id){
  activePid = id;
  const p = getProduct(id);
  const off = pct(p.regular_price, p.sale_price);
  const outOfStock = p.track_stock && p.stock_qty != null && p.stock_qty <= 0;
  document.getElementById('pdBody').innerHTML = `
    <div class="pd-media">${productIcon(p)}${off>0?`<span class="badge-off">${off}% OFF</span>`:''}</div>
    <div class="pd-brand">${p.brand||''}</div>
    <div class="pd-name">${p.name}</div>
    <div class="pd-desc">${p.description||''}</div>
    <div class="pd-prices">
      <span class="sale">${money(p.sale_price)}</span>
      ${p.regular_price>p.sale_price?`<span class="reg">${money(p.regular_price)}</span><span class="save">Save ${money(p.regular_price-p.sale_price)}</span>`:''}
    </div>
    <div class="pd-qty-row">
      <span class="lab">${outOfStock ? 'Currently out of stock' : 'Quantity'}</span>
      ${!outOfStock?`
      <div class="pd-stepper">
        <button onclick="changeQty(${p.id},-1)">−</button>
        <span class="qv" id="pdQty">${state.cart[p.id]||0}</span>
        <button onclick="changeQty(${p.id},1)">+</button>
      </div>`:''}
    </div>
    ${!outOfStock?`<button class="pd-add" onclick="addFromDetail(${p.id})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      Add to Cart
    </button>`:''}
  `;
  showSheet('pdSheet');
}
function renderPdQty(id){
  if (activePid !== id) return;
  const el = document.getElementById('pdQty');
  if (el) el.textContent = state.cart[id] || 0;
}
function addFromDetail(id){
  if (!state.cart[id]) changeQty(id, 1);
  closeAllSheets();
  openCart();
}

/* Cart sheet */
function openCart(){ renderCartSheet(); showSheet('cartSheet'); }

function renderCartSheet(){
  const body = document.getElementById('cartBody');
  const entries = Object.entries(state.cart);
  if (entries.length === 0){
    body.innerHTML = `<div class="empty"><svg class="e-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><div>Your cart is empty.<br>Add some products to get started.</div></div>`;
    return;
  }
  const subtotal = cartSubtotal();
  const regTotal = cartRegTotal();
  const savings = regTotal - subtotal;
  const discount = state.coupon ? state.coupon.discount : 0;
  const grand = Math.max(0, subtotal - discount);

  const itemsHtml = entries.map(([id, qty]) => {
    const p = getProduct(+id);
    return `
    <div class="cart-item">
      <div class="ci-media">${productIcon(p)}</div>
      <div class="ci-info">
        <div class="ci-name">${p.name}</div>
        <div class="ci-unit">${money(p.sale_price)} each</div>
        <div class="ci-bottom">
          <div class="ci-sub">${money(p.sale_price*qty)}</div>
          <div class="ci-stepper">
            <button onclick="changeQty(${p.id},-1)">−</button>
            <span class="q">${qty}</span>
            <button onclick="changeQty(${p.id},1)">+</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  let couponHtml;
  if (state.coupon){
    couponHtml = `<div class="coupon-applied">
      <span class="cname">✓ ${state.coupon.code} applied</span>
      <button onclick="removeCoupon()">Remove</button>
    </div>`;
  } else {
    couponHtml = `
      <div class="coupon-row">
        <input id="couponInput" type="text" placeholder="Enter coupon code" maxlength="20">
        <button class="coupon-apply" onclick="applyCoupon()">Apply</button>
      </div>
      <div class="coupon-msg ${state.couponError?'err':''}" id="couponMsg">${state.couponError||''}</div>`;
  }

  body.innerHTML = `
    ${itemsHtml}
    ${couponHtml}
    <div class="totals">
      <div class="trow"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      ${savings>0?`<div class="trow save"><span>Item savings</span><span>−${money(savings)}</span></div>`:''}
      ${discount>0?`<div class="trow save"><span>Coupon discount</span><span>−${money(discount)}</span></div>`:''}
      <div class="trow grand"><span>Total</span><span>${money(grand)}</span></div>
    </div>
    <button class="checkout-cta" onclick="goCheckout()">
      Proceed to Checkout
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
  `;
}

async function applyCoupon(){
  const input = document.getElementById('couponInput');
  const code = input.value.trim().toUpperCase();
  if (!code){ state.couponError = 'Enter a coupon code.'; renderCartSheet(); return; }
  try{
    const res = await fetch(`${API}/coupons/validate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, subtotal: cartSubtotal() })
    });
    const data = await res.json();
    if (!res.ok || !data.ok){
      state.couponError = data.error || 'Invalid coupon code.';
      state.coupon = null;
    } else {
      state.coupon = { code: data.code, discount: data.discount };
      state.couponError = null;
    }
  }catch(e){
    state.couponError = 'Could not validate coupon. Check your connection.';
  }
  renderCartSheet();
}
function removeCoupon(){ state.coupon = null; state.couponError = null; renderCartSheet(); }

/* Checkout */
const REMEMBER_KEY = 'satyalMartProfile';
function loadRememberedProfile(){
  try{
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    if (saved && saved.name && saved.phone){
      document.getElementById('custName').value = saved.name;
      document.getElementById('custPhone').value = saved.phone;
    }
  }catch(e){ /* ignore malformed storage */ }
}
function saveRememberedProfile(name, phone){
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name, phone }));
}
function forgetRememberedProfile(){
  localStorage.removeItem(REMEMBER_KEY);
}

function goCheckout(){
  closeAllSheets();
  const btn = document.getElementById('placeOrderBtn');
  btn.textContent = 'Place Order';
  // Only prefill if the fields are currently empty — don't clobber what the
  // customer is mid-typing if they reopen this sheet.
  if (!document.getElementById('custName').value && !document.getElementById('custPhone').value){
    loadRememberedProfile();
  }
  showSheet('checkoutSheet');
  validateCheckout(); // sync disabled state with whatever is already in the fields
}
function validateCheckout(){
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const ok = name.length > 1 && /^[0-9]{7,10}$/.test(phone.replace(/\s/g,''));
  document.getElementById('placeOrderBtn').disabled = !ok;
}

async function placeOrder(){
  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order...';

  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const note = document.getElementById('custNote').value.trim();
  const items = Object.entries(state.cart).map(([id, qty]) => ({ product_id: +id, qty }));

  try{
    const res = await fetch(`${API}/orders`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        customer_name: name, customer_phone: phone, note,
        coupon_code: state.coupon ? state.coupon.code : null, items
      })
    });
    const data = await res.json();
    if (!res.ok){
      alert(data.error || 'Could not place order. Please try again.');
      btn.disabled = false; btn.textContent = 'Place Order';
      return;
    }
    if (document.getElementById('rememberMe').checked){
      saveRememberedProfile(name, phone);
    } else {
      forgetRememberedProfile();
    }
    showConfirmation(data, name);
    state.cart = {};
    state.coupon = null;
    renderCartBar();
    loadProducts();
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }catch(e){
    alert('Could not reach Satyal Mart. Check your Wi-Fi connection and try again.');
    btn.disabled = false; btn.textContent = 'Place Order';
  }
}

function showConfirmation(order, name){
  const itemCount = cartCount();
  document.getElementById('confirmBody').innerHTML = `
    <div class="confirm-wrap">
      <div class="confirm-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div class="confirm-title">Order received, ${name.split(' ')[0]}!</div>
      <div class="confirm-order">ORDER #${order.order_number}</div>
      <div class="confirm-sub">Your order (${itemCount} item${itemCount>1?'s':''}) has been sent to Satyal Mart. Show this screen to staff at the counter.</div>
      <div class="confirm-total">
        <div class="amt">${money(order.total)}</div>
        <div class="lab">TOTAL · PAY AT COUNTER</div>
      </div>
      <div class="confirm-steps">
        <div class="cstep active"><div class="n">1</div><div class="t">Order sent to Satyal Mart</div></div>
        <div class="cstep"><div class="n">2</div><div class="t">Staff prepares your order</div></div>
        <div class="cstep"><div class="n">3</div><div class="t">Pay at counter &amp; collect</div></div>
      </div>
      <button class="new-order-btn" onclick="resetOrder()">Start New Order</button>
    </div>
  `;
  closeAllSheets();
  showSheet('confirmSheet');
}
function resetOrder(){
  closeAllSheets();
  document.getElementById('custName').value='';
  document.getElementById('custPhone').value='';
  document.getElementById('custNote').value='';
  const btn = document.getElementById('placeOrderBtn');
  btn.textContent = 'Place Order';
  btn.disabled = true;
}

/* ---------------- INIT ---------------- */
(async function init(){
  await loadSettings();
  await loadCategories();
  await loadProducts();
})();
