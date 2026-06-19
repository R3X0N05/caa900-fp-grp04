// ─── APP.JS — Rexony Technologies e-commerce logic ───────────────
// All data comes from AWS (DynamoDB via Lambda/API Gateway).
// No hardcoded products, no localStorage for cart or orders.

let STATE = {
  user: null,
  cart: [],
  shippingInfo: JSON.parse(sessionStorage.getItem("rexony_shipping") || "null"),
  products: [],
  allProducts: [],
  currentProduct: null,
  currentPage: "home",
  minRating: 0,
  selectedStars: 0,
  currentOrderId: null,
  adminSection: "dashboard",
  guest: {
    email: sessionStorage.getItem("guest_email") || ""
  }
};

let stripe = null;
let cardElement = null;

async function initStripe() {
  if (window.Stripe) {
    stripe = window.Stripe("pk_test_51Tiw89RfsQqBbUtKpgkwHqAYuTGjrweeBg3Qrs3LK2Cny0mBrn02fIaboY96W0UdQ9PpOy5Yz0xKPGlTWE5sM3j000meASJl8i");
  }
}

window.addEventListener("load", async () => {
  try {
    if (typeof initCognito === "function") initCognito();
    if (typeof initStripe === "function") initStripe();

    STATE.user = await loadUserFromSession().catch(() => null);

    updateHeaderAuth();

    if (STATE.user) {
      await loadCart().catch(() => {});
    }

    updateCartBadge();

    await loadHomeProducts(); // 🔥 critical — keep this last

    const guestCart = sessionStorage.getItem("guest_cart");
    if (guestCart && !STATE.user) {
      STATE.cart = JSON.parse(guestCart);
      updateCartBadge();
    }

  } catch (err) {
    console.error("INIT ERROR:", err);
    // fallback so page still works
    await loadHomeProducts();
  }
});

// ─── NAVIGATION ───────────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
  const pg = document.getElementById(`page-${name}`);
  if (!pg) return;

  pg.style.display = "block";
  STATE.currentPage = name;

  window.scrollTo(0, 0);

  if (name === "shop") loadShopProducts();
  if (name === "cart") renderCart();
  if (name === "orders") loadMyOrders();
  if (name === "profile") renderProfile();

  if (name === "payment") {
    setTimeout(() => initStripeElements(), 300);
  }
}

// ─── CART ─────────────────────────────────────────────────────

function proceedToCheckout() {
  if (STATE.cart.length === 0) return;

  showPage("shipping");

  if (STATE.shippingInfo) {
    ["address","city","state","pin","phone"].forEach(f => {
      const el = document.getElementById(`ship-${f}`);
      if (el) el.value = STATE.shippingInfo[f] || "";
    });
  }

  const emailEl = document.getElementById("guest-email");
  if (emailEl) emailEl.value = STATE.guest.email || "";
}

// ─── PAYMENT ────────────────────────────────────────────────

function initStripeElements() {
  if (!stripe) return;

  const elements = stripe.elements();

  cardElement = elements.create("card", {
    style: {
      base: {
        fontSize: "16px",
        color: "#ffffff"
      }
    }
  });

  cardElement.mount("#card-element");

  cardElement.on("change", (event) => {
    document.getElementById("card-errors").textContent =
      event.error ? event.error.message : "";
  });
}

async function processPayment() {
  const btn = document.getElementById("pay-btn");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const info = JSON.parse(sessionStorage.getItem("orderInfo") || "{}");

    const payData = await PaymentAPI.createIntent({
      amount: Math.round((info.totalPrice || 0) * 100),
      email: STATE.guest.email,
      items: STATE.cart
    });

    const clientSecret = payData.client_secret;

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          email: STATE.guest.email
        }
      }
    });

    if (result.error) throw new Error(result.error.message);

    const order = await OrderAPI.place({
      guestEmail: STATE.guest.email,
      shippingInfo: STATE.shippingInfo,
      orderItems: STATE.cart,
      itemsPrice: info.subtotal,
      taxPrice: info.tax,
      shippingPrice: info.shippingCharges,
      totalPrice: info.totalPrice,
      paymentInfo: {
        id: result.paymentIntent.id,
        status: result.paymentIntent.status
      }
    });

    STATE.currentOrderId = order.orderId || order._id;

    STATE.cart = [];
    sessionStorage.removeItem("guest_cart");
    updateCartBadge();

    document.getElementById("success-order-id").textContent =
      STATE.currentOrderId;

    showPage("success");

  } catch (e) {
    showToast("Payment failed: " + e.message, "error");
    btn.disabled = false;
    btn.textContent = "Pay";
  }
}

let cardElement = null;

function initStripeElements() {
  if (!stripe) return;

  const elements = stripe.elements();

  cardElement = elements.create("card", {
    style: {
      base: {
        fontSize: "16px",
        color: "#ffffff",
        "::placeholder": { color: "#aab7c4" }
      }
    }
  });

  cardElement.mount("#card-element");

  cardElement.on("change", function (event) {
    const displayError = document.getElementById("card-errors");
    if (event.error) {
      displayError.textContent = event.error.message;
    } else {
      displayError.textContent = "";
    }
  });
}

// ═══ MY ORDERS ═════════════════════════════════════════════════════
async function loadMyOrders() {
  const el = document.getElementById("orders-list");
  el.innerHTML = `<div class="loader-ring"></div>`;
  try {
    const data   = await OrderAPI.mine();
    const orders = data.orders || [];
    if (orders.length === 0) {
      el.innerHTML = `<div class="empty-cart"><div class="empty-icon">📦</div><h2>No orders yet</h2><p>Place your first order!</p><button class="btn-primary" onclick="showPage('shop')">Shop Now</button></div>`;
      return;
    }
    el.innerHTML = orders.map(o => `
      <div class="order-row">
        <div><span class="or-id">#${(o.orderId || o._id || "").slice(-10)}</span></div>
        <div><span style="font-size:13px;color:var(--muted)">${new Date(o.createdAt || Date.now()).toLocaleDateString()}</span></div>
        <div><span class="or-total">$${(o.totalPrice || 0).toFixed(2)}</span></div>
        <div><span class="or-status status-${(o.status || "processing").toLowerCase()}">${o.status || "Processing"}</span></div>
        <button class="or-detail-btn" onclick="showOrderDetail('${o.orderId||o._id}')">Details</button>
      </div>`).join("");
  } catch {
    el.innerHTML = `<div class="empty-cart"><div class="empty-icon">📦</div><h2>No orders yet</h2><p>Place your first order to see it here.</p><button class="btn-primary" onclick="showPage('shop')">Shop Now</button></div>`;
  }
}

function showOrderDetail(id) {
  showModal(`<h3 style="margin-bottom:12px">Order #${id.slice(-10)}</h3><p style="color:var(--muted)">Order details would appear here with items, shipping address, and tracking information.</p>`);
}

// ═══ PROFILE ═══════════════════════════════════════════════════════
function renderProfile() {
  if (!STATE.user) { showPage("login"); return; }
  const initials = STATE.user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("profile-avatar-initials").textContent = initials;
  document.getElementById("profile-name").textContent            = STATE.user.name;
  document.getElementById("profile-email-display").textContent   = STATE.user.email;
  document.getElementById("profile-role-badge").textContent      = STATE.user.role === "admin" ? "Admin" : "Customer";
  document.getElementById("profile-name-input").value  = STATE.user.name;
  document.getElementById("profile-email-input").value = STATE.user.email;
}

function switchProfileTab(t) {
  document.getElementById("profile-info-tab").style.display     = t === "info"     ? "block" : "none";
  document.getElementById("profile-password-tab").style.display = t === "password" ? "block" : "none";
  document.querySelectorAll(".p-tab").forEach(el => el.classList.remove("active"));
  event.target.classList.add("active");
}

async function updateProfile() {
  const name = document.getElementById("profile-name-input").value.trim();
  if (!name) return showToast("Name cannot be empty", "error");
  try {
    await UserAPI.updateMe({ name });
    STATE.user.name = name;
    renderProfile();
    showToast("Profile updated!", "success");
  } catch (e) { showToast(e.message, "error"); }
}

async function changePassword() {
  const newP = document.getElementById("new-password").value;
  const cnf  = document.getElementById("confirm-password").value;
  if (newP !== cnf) return showToast("Passwords do not match", "error");
  showToast("Password change requires Cognito SDK to be loaded.", "info");
}

// ═══ ADMIN ═════════════════════════════════════════════════════════
function switchAdmin(section) {
  STATE.adminSection = section;
  document.querySelectorAll(".admin-section").forEach(s => s.style.display = "none");
  document.querySelectorAll(".an-item").forEach(a => a.classList.remove("active"));
  document.getElementById(`admin-${section}`).style.display = "block";
  event.target.classList.add("active");
  if (section === "dashboard") loadAdminDashboard();
  if (section === "products")  loadAdminProducts();
  if (section === "orders")    loadAdminOrders();
  if (section === "users")     loadAdminUsers();
  if (section === "reviews")   loadAdminReviews();
}

async function loadAdminDashboard() {
  try {
    const [pData, oData, uData] = await Promise.all([
      ProductAPI.adminAll(),
      OrderAPI.adminAll(),
      UserAPI.adminAll(),
    ]);
    const products = pData.products || [];
    const orders   = oData.orders   || [];
    const users    = uData.users    || [];
    const revenue  = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    document.getElementById("dash-revenue").textContent  = `$${revenue.toFixed(2)}`;
    document.getElementById("dash-products").textContent = products.length;
    document.getElementById("dash-orders").textContent   = orders.length;
    document.getElementById("dash-users").textContent    = users.length;
    const recentTbody = document.getElementById("recent-orders-tbody");
    recentTbody.innerHTML = orders.slice(0, 5).map(o => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--green)">#${(o.orderId||o._id||"").slice(-8)}</span></td>
        <td>${o.userEmail || o.userId || "—"}</td>
        <td>$${(o.totalPrice||0).toFixed(2)}</td>
        <td><span class="status-badge sb-${(o.status||'processing').toLowerCase()}">${o.status || "Processing"}</span></td>
      </tr>`).join("") || `<tr><td colspan="4" class="loading-cell">No orders yet</td></tr>`;
    const lowTbody = document.getElementById("low-stock-tbody");
    const low = products.filter(p => (p.Stock || 0) < 10).sort((a, b) => a.Stock - b.Stock);
    lowTbody.innerHTML = low.slice(0, 5).map(p => `
      <tr>
        <td>${p.name}</td>
        <td><span style="color:${p.Stock === 0 ? "var(--red)" : "var(--yellow)"}">${p.Stock}</span></td>
        <td><button class="tbl-action" onclick="editProduct('${p.productId||p._id}')">Edit</button></td>
      </tr>`).join("") || `<tr><td colspan="3" class="loading-cell">All products well stocked</td></tr>`;
  } catch (e) { showToast("Could not load dashboard: " + e.message, "error"); }
}

async function loadAdminProducts() {
  const tbody = document.getElementById("admin-products-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading...</td></tr>`;
  try {
    const data  = await ProductAPI.adminAll();
    const prods = data.products || [];
    tbody.innerHTML = prods.map(p => `
      <tr>
        <td class="tm">${(p.productId||p._id||"").slice(-8)}</td>
        <td>${p.name}</td>
        <td>$${(p.price||0).toFixed(2)}</td>
        <td>${p.category||"—"}</td>
        <td style="color:${p.Stock===0?"var(--red)":p.Stock<10?"var(--yellow)":"inherit"}">${p.Stock||0}</td>
        <td>${renderStars(p.ratings||0)}</td>
        <td>
          <button class="tbl-action" onclick="editProduct('${p.productId||p._id}')">Edit</button>
          <button class="tbl-action danger" onclick="confirmDeleteProduct('${p.productId||p._id}','${p.name}')">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="loading-cell">No products found</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error loading products</td></tr>`; }
}

function showAddProduct() {
  document.getElementById("product-form-card").style.display = "block";
  document.getElementById("product-form-title").textContent  = "Add New Product";
  document.getElementById("edit-product-id").value = "";
  ["prod-name","prod-price","prod-stock","prod-desc"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("prod-category").value = "Electronics";
}

function editProduct(id) {
  const p = STATE.allProducts.find(x => (x.productId||x._id) === id) || {};
  document.getElementById("product-form-card").style.display = "block";
  document.getElementById("product-form-title").textContent  = "Edit Product";
  document.getElementById("edit-product-id").value = id;
  document.getElementById("prod-name").value        = p.name || "";
  document.getElementById("prod-price").value       = p.price || "";
  document.getElementById("prod-stock").value       = p.Stock || "";
  document.getElementById("prod-desc").value        = p.description || "";
  document.getElementById("prod-category").value    = p.category || "Electronics";
  switchAdmin("products");
  document.getElementById("product-form-card").scrollIntoView({ behavior: "smooth" });
}

async function saveProduct() {
  const id   = document.getElementById("edit-product-id").value;
  const data = {
  name:        document.getElementById("prod-name").value.trim(),
  price:       parseFloat(document.getElementById("prod-price").value),
  category:    document.getElementById("prod-category").value,
  Stock:       parseInt(document.getElementById("prod-stock").value),
  description: document.getElementById("prod-desc").value.trim(),
  images:      [{ url: document.getElementById("prod-image").value.trim() }],  // ADD THIS
};
  if (!data.name || isNaN(data.price)) return showToast("Name and price are required", "error");
  try {
    if (id) { await ProductAPI.update(id, data); showToast("Product updated!", "success"); }
    else     { await ProductAPI.create(data);    showToast("Product created!", "success"); }
    cancelProductForm();
    loadAdminProducts();
    loadHomeProducts();
  } catch (e) { showToast(e.message, "error"); }
}

function cancelProductForm() { document.getElementById("product-form-card").style.display = "none"; }

function confirmDeleteProduct(id, name) {
  showModal(`
    <h3 style="margin-bottom:12px">Delete Product</h3>
    <p>Are you sure you want to delete <strong>${name}</strong>? This cannot be undone.</p>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn-primary" style="background:var(--red)" onclick="doDeleteProduct('${id}')">Delete</button>
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function doDeleteProduct(id) {
  closeModal();
  try { await ProductAPI.remove(id); showToast("Product deleted", "success"); loadAdminProducts(); loadHomeProducts(); }
  catch (e) { showToast(e.message, "error"); }
}

async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading...</td></tr>`;
  try {
    const data   = await OrderAPI.adminAll();
    const orders = data.orders || [];
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td class="tm">#${(o.orderId||o._id||"").slice(-8)}</td>
        <td>${o.userEmail || o.userId || "—"}</td>
        <td>${(o.orderItems||o.items||[]).length} items</td>
        <td>$${(o.totalPrice||0).toFixed(2)}</td>
        <td>${new Date(o.createdAt||Date.now()).toLocaleDateString()}</td>
        <td><span class="status-badge sb-${(o.status||'processing').toLowerCase()}">${o.status||"Processing"}</span></td>
        <td>
          <select onchange="updateOrderStatus('${o.orderId||o._id}',this.value)" style="width:120px;font-size:11px">
            <option value="">Update</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="loading-cell">No orders yet</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error loading orders</td></tr>`; }
}

async function updateOrderStatus(id, status) {
  if (!status) return;
  try { await OrderAPI.update(id, { status }); showToast(`Order updated to ${status}`, "success"); loadAdminOrders(); }
  catch (e) { showToast(e.message, "error"); }
}

async function loadAdminUsers() {
  const tbody = document.getElementById("admin-users-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    const data  = await UserAPI.adminAll();
    const users = data.users || [];
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.name||"—"}</td>
        <td>${u.email||"—"}</td>
        <td><span class="status-badge ${u.role==="admin"?"sb-delivered":"sb-confirmed"}">${u.role||"user"}</span></td>
        <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
        <td>
          <button class="tbl-action" onclick="promoteUser('${u._id||u.userId}')">Edit</button>
          <button class="tbl-action danger" onclick="deleteUser('${u._id||u.userId}')">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="5" class="loading-cell">No users found</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Error loading users</td></tr>`; }
}

async function promoteUser(id) { showToast("User edit requires a dedicated form — coming soon", "info"); }
async function deleteUser(id) {
  try { await UserAPI.adminDel(id); showToast("User deleted", "success"); loadAdminUsers(); }
  catch (e) { showToast(e.message, "error"); }
}

async function loadAdminReviews() {
  const pid   = document.getElementById("review-filter-pid")?.value?.trim();
  const tbody = document.getElementById("admin-reviews-tbody");
  if (!pid) { tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Enter a product ID to load reviews</td></tr>`; return; }
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    const data    = await ProductAPI.getReviews(pid);
    const reviews = data.reviews || [];
    tbody.innerHTML = reviews.map(r => `
      <tr>
        <td>${r.name||"User"}</td>
        <td>${pid.slice(-8)}</td>
        <td>${renderStars(r.rating||0)}</td>
        <td>${r.comment||"—"}</td>
        <td><button class="tbl-action danger" onclick="deleteReview('${r._id}','${pid}')">Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="5" class="loading-cell">No reviews for this product</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Error loading reviews</td></tr>`; }
}

async function deleteReview(rid, pid) {
  try { await ProductAPI.delReview(rid, pid); showToast("Review deleted", "success"); loadAdminReviews(); }
  catch (e) { showToast(e.message, "error"); }
}

// ═══ CONTACT ══════════════════════════════════════════════════════
function submitContact() { showToast("Message sent! We'll get back to you soon.", "success"); }

// ═══ UTILITIES ════════════════════════════════════════════════════
let _toastTimer;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

function renderStars(n) {
  const full = Math.round(n);
  return Array.from({ length: 5 }, (_, i) => i < full ? "★" : "☆").join("");
}

function categoryEmoji(cat) {
  const m = { Electronics:"💻", Audio:"🎧", Cameras:"📷", Accessories:"⌨️", Wearables:"⌚", Gaming:"🎮", Laptops:"💻", Mobiles:"📱" };
  return m[cat] || "📦";
}

function showModal(html) {
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); }
