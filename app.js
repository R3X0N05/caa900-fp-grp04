// ─── APP.JS — Rexony Technologies e-commerce logic ───────────────
// All data comes from AWS (DynamoDB via Lambda/API Gateway).
// No hardcoded products, no localStorage for cart or orders.

// ═══ STATE ════════════════════════════════════════════════════════
let STATE = {
  user:           null,
  cart:           [],
  shippingInfo:   JSON.parse(sessionStorage.getItem("rexony_shipping") || "null"),
  products:       [],
  allProducts:    [],
  currentProduct: null,
  currentPage:    "home",
  minRating:      0,
  selectedStars:  0,
  currentOrderId: null,
  adminSection:   "dashboard",
};

let _orderSort = { key: "createdAt", dir: -1 };

// ═══ INIT ══════════════════════════════════════════════════════════
window.addEventListener("load", async () => {
  initCognito();

  try {
    STATE.user = await loadUserFromSession();
  } catch {
    STATE.user = null;
  }

  updateHeaderAuth();

  if (STATE.user) {
    await loadCart();
  } else {
    const saved = localStorage.getItem("rexony-guest-cart");
    if (saved) STATE.cart = JSON.parse(saved);
  }

  updateCartBadge();
  renderCart();
  await loadHomeProducts();

// ── Handle Stripe redirect return ──────────────────────
  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") === "success") {
    if (!STATE.user) {
      await new Promise(r => setTimeout(r, 1500));
      STATE.user = await loadUserFromSession();
      updateHeaderAuth();
    }
    try {
      const info        = JSON.parse(sessionStorage.getItem("orderInfo") || "{}");
      const pendingCart = JSON.parse(sessionStorage.getItem("rexony_pending_cart") || "[]");
      if (pendingCart.length > 0) {
        await OrderAPI.place({
          shippingInfo:  STATE.shippingInfo,
          orderItems:    pendingCart,
          itemsPrice:    info.subtotal,
          taxPrice:      info.tax,
          shippingPrice: info.shippingCharges,
          totalPrice:    info.totalPrice,
          paymentInfo:   { status: "succeeded" },
        });
        if (STATE.user) await CartAPI.clear();
        STATE.cart = [];
        localStorage.removeItem("rexony-guest-cart");
        sessionStorage.removeItem("rexony_pending_cart");
        sessionStorage.removeItem("rexony_pending_shipping");
        sessionStorage.removeItem("rexony_auth_token");
        sessionStorage.removeItem("orderInfo");
        updateCartBadge();
      }
      showToast("Payment successful! Your order has been placed.", "success");
    } catch (e) {
      showToast("Order placement failed: " + e.message, "error");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }
  if (params.get("payment") === "cancelled") {
    showToast("Payment cancelled — your cart is still saved.", "info");
    window.history.replaceState({}, "", window.location.pathname);
    showPage("cart");
  }
  // ───────────────────────────────────────────────────────

  setInterval(() => {
    const el = document.getElementById("admin-date");
    if (el) el.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }, 1000);
});


async function loadUserFromSession() {
  try {
    const poolData = {
      UserPoolId: AWS_CONFIG.COGNITO_USER_POOL_ID,
      ClientId: AWS_CONFIG.COGNITO_CLIENT_ID
    };

    const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
    const currentUser = userPool.getCurrentUser();

    if (!currentUser) return null;

    return await new Promise((resolve, reject) => {
      currentUser.getSession((err, session) => {
        if (err || !session || !session.isValid()) return resolve(null);

        const payload = session.getIdToken().decodePayload();
        resolve({
          name: payload.name || payload.email || currentUser.getUsername(),
          email: payload.email || "",
          role: payload["custom:role"] || "user",
          username: currentUser.getUsername()
        });
      });
    });
  } catch {
    return null;
  }
}

// ═══ NAVIGATION ════════════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
  const pg = document.getElementById(`page-${name}`);
  if (!pg) return;
  pg.style.display = "block";
  STATE.currentPage = name;
  closeDropdowns();
  window.scrollTo(0, 0);

  if (name === "shop")       loadShopProducts();
  if (name === "cart")       renderCart();
  if (name === "orders")     loadMyOrders();
  if (name === "profile")    renderProfile();
  if (name === "admin-dash") { if (!isAdmin()) { showPage("home"); return; } loadAdminDashboard(); }
  if (name === "confirm")    renderConfirm();
  // if (name === "shipping" && !STATE.user) { showToast("Please log in to checkout", "error"); showPage("login"); return; }
}

function filterByCategory(cat) {
  showPage("shop");
  document.getElementById("cat-filter").value = cat;
  applyFilters();
}

// ═══ AUTH UI ═══════════════════════════════════════════════════════
function updateHeaderAuth() {
  const li = document.getElementById("ud-logged-in");
  const lo = document.getElementById("ud-logged-out");
  const al = document.getElementById("admin-link");
  if (STATE.user) {
    li.style.display = "block"; lo.style.display = "none";
    if (al) al.style.display = isAdmin() ? "block" : "none";
  } else {
    li.style.display = "none"; lo.style.display = "block";
  }
}

function isAdmin() { return STATE.user && STATE.user.role === "admin"; }

function toggleUserMenu() {
  document.getElementById("user-dropdown").classList.toggle("open");
}

function closeDropdowns() {
  document.getElementById("user-dropdown")?.classList.remove("open");
}

document.addEventListener("click", e => {
  if (!e.target.closest("#user-icon-btn") && !e.target.closest("#user-dropdown")) closeDropdowns();
});

function toggleSearch() {
  document.getElementById("search-bar").classList.toggle("open");
  if (document.getElementById("search-bar").classList.contains("open")) document.getElementById("search-input").focus();
}

function toggleMobileNav() {}

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";
  if (!email || !pass) { errEl.textContent = "Enter email and password."; errEl.style.display = "block"; return; }
  try {
    STATE.user = await cognitoLogin(email, pass);
    updateHeaderAuth();
    await loadCart();
    const guestCart = JSON.parse(localStorage.getItem("rexony-guest-cart") || "[]");
    if (guestCart.length > 0) {
      for (const item of guestCart) {
        const exists = STATE.cart.find(i => i.productId === item.productId);
        if (!exists) {
          await CartAPI.add({ productId: item.productId, name: item.name,
                              price: item.price, image: item.image, quantity: item.quantity });
          STATE.cart.push(item);
        }
      }
      localStorage.removeItem("rexony-guest-cart");
    }
    updateCartBadge();
    renderCart();
    showToast(`Welcome back, ${STATE.user.name}!`, "success");
    showPage("home");
  } catch (e) { errEl.textContent = e; errEl.style.display = "block"; }
}

async function handleRegister() {
  const name  = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass  = document.getElementById("reg-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const errEl = document.getElementById("reg-error");
  errEl.style.display = "none";
  if (!name || !email || !pass || !confirmPassword) { errEl.textContent = "All fields are required."; errEl.style.display = "block"; return; }
  if (pass !== confirmPassword) { errEl.textContent = "Passwords do not match."; errEl.style.display = "block"; return; }
  try {
    await cognitoRegister(name, email, pass);
    sessionStorage.setItem("pendingVerifyEmail", email);
    showToast("Account created! Check your email for the verification code.", "success");
    showPage("verify");  // go to verify page
  } catch (e) { errEl.textContent = e; errEl.style.display = "block"; }
}

async function handleVerify() {
  const email = sessionStorage.getItem("pendingVerifyEmail");
  const code  = document.getElementById("verify-code").value.trim();
  const errEl = document.getElementById("verify-error");
  errEl.style.display = "none";
  if (!code) { errEl.textContent = "Enter the verification code."; errEl.style.display = "block"; return; }
  try {
    await cognitoVerify(email, code);
    showToast("Email verified! You can now log in.", "success");
    sessionStorage.removeItem("pendingVerifyEmail");
    showPage("login");
  } catch (e) { errEl.textContent = e; errEl.style.display = "block"; }
}

async function resendVerificationCode() {
  const email = sessionStorage.getItem("pendingVerifyEmail");
  try {
    await cognitoResendCode(email);
    showToast("Code resent — check your email.", "success");
  } catch (e) { showToast(e, "error"); }
}

function logout() {
  cognitoLogout();
  STATE.user = null;
  STATE.cart = [];
  localStorage.removeItem("rexony-guest-cart");  // ← add this
  updateCartBadge();
  updateHeaderAuth();
  showToast("Logged out.", "success");
  showPage("home");
}

function switchAuthTab(t) {
  document.getElementById("login-form").style.display    = t === "login"    ? "block" : "none";
  document.getElementById("register-form").style.display = t === "register" ? "block" : "none";
  document.querySelectorAll(".auth-tab").forEach(el => el.classList.remove("active"));
  document.getElementById(`${t}-tab`).classList.add("active");
}

async function sendResetCode() {
  const email = document.getElementById("fp-email").value.trim();
  if (!email) return showToast("Enter your email", "error");
  try {
    const msg = await cognitoForgotPassword(email);
    sessionStorage.setItem("resetEmail", email);
    document.getElementById("fp-send-section").style.display = "none";
    document.getElementById("fp-code-section").style.display = "block";
    showToast(msg, "success");
  } catch (e) { showToast(e, "error"); }
}

async function resetPassword() {
  const email   = sessionStorage.getItem("resetEmail") || "";
  const code    = document.getElementById("fp-code").value.trim();
  const newPass = document.getElementById("fp-new-pass").value;
  try {
    await cognitoResetPassword(email, code, newPass);
    showToast("Password reset! Please log in.", "success");
    showPage("login");
  } catch (e) { showToast(e, "error"); }
}

// ═══ PRODUCTS ══════════════════════════════════════════════════════
async function loadHomeProducts() {
  const grid = document.getElementById("home-product-grid");
  grid.innerHTML = `<div class="loader-ring"></div>`;
  try {
    const data = await ProductAPI.getAll();
    STATE.allProducts = data.products || data.items || [];
    if (!STATE.allProducts.length) {
      grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:2rem">No products available yet.</p>`;
      return;
    }
  } catch {
    grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:2rem">Could not load products. Please try again later.</p>`;
    return;
  }
  STATE.products = STATE.allProducts;
  const featured = STATE.allProducts.filter(p => p.featured);
  const toShow = featured.length > 0 ? featured : STATE.allProducts;
  grid.innerHTML = toShow.slice(0, 8).map(productCard).join("");
}

async function loadShopProducts() {
  const grid = document.getElementById("shop-product-grid");
  grid.innerHTML = `<div class="loader-ring"></div>`;
  try {
    const data = await ProductAPI.getAll();
    STATE.allProducts = data.products || data.items || [];
  } catch {
    grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:2rem">Could not load products. Please try again.</p>`;
    return;
  }
  applyFilters();
}

function applyFilters() {
  const cat    = document.getElementById("cat-filter")?.value || "";
  const minP   = parseFloat(document.getElementById("price-min")?.value || 0);
  const maxP   = parseFloat(document.getElementById("price-max")?.value || 99999);
  const sort   = document.getElementById("sort-select")?.value || "";
  const q      = document.getElementById("search-input")?.value.toLowerCase().trim() || "";
  let products = [...STATE.allProducts];
  if (q) products = products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.category || "").toLowerCase().includes(q)
  );
  if (cat) products = products.filter(p => p.category === cat);
  products = products.filter(p => (p.price || 0) >= minP && (p.price || 0) <= maxP);
  if (STATE.minRating > 0) products = products.filter(p => (p.ratings || 0) >= STATE.minRating);
  if (sort === "price-asc")  products.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") products.sort((a, b) => b.price - a.price);
  if (sort === "rating")     products.sort((a, b) => (b.ratings || 0) - (a.ratings || 0));
  STATE.products = products;
  const grid = document.getElementById("shop-product-grid");
  if (grid) {
    document.getElementById("shop-count").textContent = `${products.length} product${products.length !== 1 ? "s" : ""}`;
    grid.innerHTML = products.map(productCard).join("") || `<p style="color:var(--muted);grid-column:1/-1">No products match these filters.</p>`;
  }
  const hg = document.getElementById("home-product-grid");
  if (hg && STATE.currentPage === "home") hg.innerHTML = STATE.products.slice(0, 8).map(productCard).join("");
}

function productCard(p) {
  const id    = p.productId || p._id || "unknown";
  const img   = (p.images && p.images[0]?.url) ? `<img src="${p.images[0].url}" alt="${p.name}" loading="lazy"/>` : `<span style="font-size:48px">${categoryEmoji(p.category)}</span>`;
  const badge = p.Stock <= 5 && p.Stock > 0 ? `<span class="pc-badge">Low Stock</span>` : (p.Stock === 0 ? `<span class="pc-badge" style="background:var(--red)">Out of Stock</span>` : "");
  const stars = renderStars(p.ratings || 0);
  const inStock = (p.Stock || 0) > 0;
  return `
  <div class="product-card" onclick="openProduct('${id}')">
    <div class="pc-img">${img}${badge}</div>
    <div class="pc-body">
      <div class="pc-cat">${p.category || "Product"}</div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-rating">
        <span class="stars-sm">${stars}</span>
        <span class="pc-reviews">(${p.numOfReviews || p.reviews?.length || 0})</span>
      </div>
      <div class="pc-footer">
        <span class="pc-price">$${(p.price || 0).toFixed(2)}</span>
        ${inStock
          ? `<button class="pc-add" onclick="event.stopPropagation();addToCartQuick('${id}')" title="Add to cart">+</button>`
          : `<span class="out-of-stock">Out of stock</span>`}
      </div>
    </div>
  </div>`;
}

async function openProduct(id) {
  showPage("product");
  try {
    const data = await ProductAPI.getOne(id);
    const p = data.product || data;
    STATE.currentProduct = p;
    STATE.selectedQty = 1;
    document.getElementById("pd-cat").textContent    = p.category || "";
    document.getElementById("pd-name").textContent   = p.name || "";
    document.getElementById("pd-price").textContent  = `$${(p.price || 0).toFixed(2)}`;
    document.getElementById("pd-desc").textContent   = p.description || "";
    document.getElementById("pd-tags").innerHTML = (p.tags || []).map(t => `<span class="tag-badge">${t}</span>`).join("") ;
    document.getElementById("pd-stars").innerHTML    = renderStars(p.ratings || 0);
    document.getElementById("pd-reviews").textContent = `(${p.numOfReviews || p.reviews?.length || 0} reviews)`;
    document.getElementById("pd-qty-val").textContent = "1";
    const stock = p.Stock || p.stock || 0;
    document.getElementById("pd-stock").innerHTML = stock > 0
      ? `<span class="in-stock">✓ In Stock (${stock} available)</span>`
      : `<span class="no-stock">✗ Out of Stock</span>`;
    const imgEl = document.getElementById("pd-main-img");
    imgEl.innerHTML = p.images?.[0]?.url
      ? `<img src="${p.images[0].url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover"/>`
      : `<span style="font-size:80px">${categoryEmoji(p.category)}</span>`;
    renderProductReviews(p.reviews || []);
    document.getElementById("add-review-form").style.display = STATE.user ? "block" : "none";
  } catch (e) {
    showToast("Could not load product: " + e.message, "error");
    showPage("shop");
  }
}

function changeQty(d) {
  const el  = document.getElementById("pd-qty-val");
  const max = STATE.currentProduct?.Stock || 99;
  let v = parseInt(el.textContent) + d;
  if (v < 1) v = 1;
  if (v > max) v = max;
  el.textContent = v;
  STATE.selectedQty = v;
}

function addToCartFromDetail() {
  if (!STATE.currentProduct) return;
  addToCart(STATE.currentProduct, STATE.selectedQty || 1);
}

function buyNow() {
  addToCartFromDetail();
  showPage("cart");
}

function renderProductReviews(reviews) {
  const el = document.getElementById("reviews-list");
  el.innerHTML = reviews.length === 0
    ? `<p style="color:var(--muted)">No reviews yet. Be the first!</p>`
    : reviews.map(r => `
        <div class="review-card">
          <div class="rc-header">
            <span class="rc-user">${r.name || "User"}</span>
            <span class="rc-stars">${renderStars(r.rating)}</span>
          </div>
          <p class="rc-comment">${r.comment}</p>
        </div>`).join("");
}

function selectStar(n) {
  STATE.selectedStars = n;
  document.querySelectorAll("#star-select span").forEach((s, i) => s.classList.toggle("lit", i < n));
}

async function submitReview() {
  if (!STATE.user) return showToast("Log in to submit a review", "error");
  if (!STATE.selectedStars) return showToast("Select a star rating", "error");
  const comment   = document.getElementById("review-comment").value.trim();
  const productId = STATE.currentProduct?.productId || STATE.currentProduct?._id;
  try {
    await ProductAPI.addReview({ rating: STATE.selectedStars, comment, productId });
    showToast("Review submitted!", "success");
    document.getElementById("review-comment").value = "";
    STATE.selectedStars = 0;
    selectStar(0);
    openProduct(productId);
  } catch (e) { showToast(e.message, "error"); }
}

// ═══ SEARCH ════════════════════════════════════════════════════════
function liveSearch() {
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  if (!q) {
    STATE.products = STATE.allProducts;
    const hg = document.getElementById("home-product-grid");
    if (hg && STATE.currentPage === "home")
      hg.innerHTML = STATE.allProducts.slice(0, 8).map(productCard).join("");
    return;
  }
  const r = STATE.allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  STATE.products = r;
  const hg = document.getElementById("home-product-grid");
  if (hg && STATE.currentPage === "home") hg.innerHTML = r.slice(0, 8).map(productCard).join("") || `<p style="color:var(--muted);grid-column:1/-1">No results for "${q}"</p>`;
}

function doSearch() {
  toggleSearch();
  showPage("shop");
  applyFilters();
}

function setMinRating(n) {
  STATE.minRating = n;
  document.querySelectorAll(".rf-star").forEach(s => s.classList.toggle("active", parseInt(s.dataset.r) === n));
  applyFilters();
}

function clearFilters() {
  document.getElementById("cat-filter").value  = "";
  document.getElementById("price-min").value   = 0;
  document.getElementById("price-max").value   = 5000;
  document.getElementById("sort-select").value = "";
  STATE.minRating = 0;
  setMinRating(0);
  updatePriceLabel();
  applyFilters();
}

function updatePriceLabel() {
  document.getElementById("price-min-lbl").textContent = "$" + document.getElementById("price-min").value;
  document.getElementById("price-max-lbl").textContent = "$" + document.getElementById("price-max").value;
}

// ═══ CART ══════════════════════════════════════════════════════════
async function loadCart() {
  try {
    const data  = await CartAPI.get();
    STATE.cart  = data.items || data.cart || [];
    updateCartBadge();
  } catch {
    STATE.cart = [];
  }
}

async function addToCart(product, qty = 1) {
  const id = product.productId || product._id;
  if (!id) { showToast("Missing product ID", "error"); return; }

  const idx = STATE.cart.findIndex(i => i.productId === id);
  if (idx >= 0) {
    STATE.cart = STATE.cart.map((item, i) =>
      i === idx ? { ...item, quantity: (item.quantity || 0) + qty } : item
    );
  } else {
    STATE.cart = [...STATE.cart, {
      productId: id,
      name:      product.name,
      price:     product.price,
      image:     product.images?.[0]?.url || "",
      quantity:  qty,
      Stock:     product.Stock
    }];
  }

  updateCartBadge();
  renderCart();
  showToast(`${product.name} added to cart`, "success");

  if (!STATE.user) {
    localStorage.setItem("rexony-guest-cart", JSON.stringify(STATE.cart));
    return;
  }
  try {
    await CartAPI.add({ productId: id, name: product.name, price: product.price,
                        image: product.images?.[0]?.url || "", quantity: qty });
  } catch (e) {
    showToast("Cart sync failed — please try again", "error");
  }
}

// async function addToCart(product, qty = 1) {
//   if (!STATE.user) {
//     showToast("Please log in to add items to your cart", "error");
//     showPage("login");
//     return;
//   }

//   const id = product.productId || product._id;
//   if (!id) {
//     showToast("Missing product ID", "error");
//     return;
//   }

//   const idx = STATE.cart.findIndex(i => i.productId === id);

//   if (idx >= 0) {
//     STATE.cart = STATE.cart.map((item, i) =>
//       i === idx ? { ...item, quantity: (item.quantity || 0) + qty } : item
//     );
//   } else {
//     STATE.cart = [
//       ...STATE.cart,
//       {
//         productId: id,
//         name: product.name,
//         price: product.price,
//         image: product.images?.[0]?.url || "",
//         quantity: qty,
//         Stock: product.Stock
//       }
//     ];
//   }

//   updateCartBadge();
//   renderCart();

//   try {
//     await CartAPI.add({
//       productId: id,
//       name: product.name,
//       price: product.price,
//       image: product.images?.[0]?.url || "",
//       quantity: qty
//     });
//   } catch (e) {
//     showToast("Cart sync failed — please try again", "error");
//   }
// }

async function addToCartQuick(id) {
  const p = STATE.allProducts.find(x => (x.productId || x._id) === id);
  if (p) await addToCart(p, 1);
}

function updateCartBadge() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = STATE.cart.reduce((s, i) => s + i.quantity, 0);
}

function updateCartSummary() {
  const sub = STATE.cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const shipping = sub >= 99 ? 0 : 9.99;
  const tax = sub * 0.18;
  const total = sub + shipping + tax;

  document.getElementById("cart-subtotal").textContent = `$${sub.toFixed(2)}`;
  document.getElementById("cart-shipping").textContent = shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`;
  document.getElementById("cart-tax").textContent = `$${tax.toFixed(2)}`;
  document.getElementById("cart-total").textContent = `$${total.toFixed(2)}`;

  sessionStorage.setItem("orderInfo", JSON.stringify({
    subtotal: sub,
    shippingCharges: shipping,
    tax,
    totalPrice: total
  }));
}

const EMPTY_CART_HTML = `
  <div class="empty-cart" id="empty-cart">
    <div class="empty-icon">🛒</div>
    <h2>Your cart is empty</h2>
    <p>Add some products to get started.</p>
    <button class="btn-primary" onclick="showPage('shop')">Start Shopping</button>
  </div>
`;

function renderCart() {
  const listEl = document.getElementById("cart-items-list");
  const summEl = document.getElementById("cart-summary");

  if (!STATE.cart || STATE.cart.length === 0) {
    listEl.innerHTML = EMPTY_CART_HTML;
    summEl.style.display = "none";
    updateCartSummary();
    return;
  }

  summEl.style.display = "block";
  listEl.innerHTML = STATE.cart.map((item, i) => `
    <div class="cart-item">
      <div class="ci-img">${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>` : categoryEmoji("")}</div>
      <div>
        <div class="ci-name">${item.name}</div>
        <div class="ci-price">$${(item.price * item.quantity).toFixed(2)}</div>
        <div class="ci-controls">
          <button class="ci-qty-btn" onclick="changeCartQty(${i},-1)">−</button>
          <span class="ci-qty-val">${item.quantity}</span>
          <button class="ci-qty-btn" onclick="changeCartQty(${i},1)">+</button>
        </div>
      </div>
      <button class="ci-remove" onclick="removeFromCart(${i})" title="Remove">×</button>
    </div>`).join("");

  updateCartSummary();
}

async function changeCartQty(idx, d) {
  const item = STATE.cart[idx];
  if (!item) return;

  const nextQty = (item.quantity || 0) + d;

  if (nextQty <= 0) {
    STATE.cart = STATE.cart.filter((_, i) => i !== idx);
  } else {
    STATE.cart = STATE.cart.map((it, i) =>
      i === idx ? { ...it, quantity: nextQty } : it
    );
  }

  updateCartBadge();
  renderCart();

  try {
    if (nextQty <= 0) await CartAPI.remove(item.productId);
    else await CartAPI.update({ productId: item.productId, quantity: nextQty });
  } catch {}
}

async function removeFromCart(idx) {
  const item = STATE.cart[idx];
  if (!item) return;

  STATE.cart = STATE.cart.filter((_, i) => i !== idx);
  updateCartBadge();
  try { renderCart(); } catch (e) { console.error("renderCart failed:", e); }
  if (!STATE.user) localStorage.setItem("rexony-guest-cart", JSON.stringify(STATE.cart));

  try {
    await CartAPI.remove(item.productId);
  } catch {
    showToast("Failed to remove item", "error");
  }
}

function proceedToCheckout() {
  if (STATE.cart.length === 0) return;
  if (!STATE.user) {
    showModal(`
      <h3 style="margin-bottom:12px">Sign in to Checkout</h3>
      <p style="color:var(--muted);margin-bottom:20px">Your cart is saved. Log in to complete your purchase.</p>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" onclick="closeModal();showPage('login')">Log In</button>
        <button class="btn-ghost" onclick="closeModal();showPage('register')">Register</button>
      </div>`);
    return;
  }
  showPage("shipping");
  if (STATE.shippingInfo) {
    ["address","city","state","pin","phone"].forEach(f => {
      const el = document.getElementById(`ship-${f}`);
      if (el) el.value = STATE.shippingInfo[f] || "";
    });
    const sc = document.getElementById("ship-country");
    if (sc && STATE.shippingInfo.country) sc.value = STATE.shippingInfo.country;
  }
}

// function proceedToCheckout() {
//   if (!STATE.user) { showToast("Please log in first", "error"); showPage("login"); return; }
//   if (STATE.cart.length === 0) return;
//   showPage("shipping");
//   if (STATE.shippingInfo) {
//     ["address","city","state","pin","phone"].forEach(f => {
//       const el = document.getElementById(`ship-${f}`);
//       if (el) el.value = STATE.shippingInfo[f] || "";
//     });
//     const sc = document.getElementById("ship-country");
//     if (sc && STATE.shippingInfo.country) sc.value = STATE.shippingInfo.country;
//   }
// }

// ═══ SHIPPING & CHECKOUT ══════════════════════════════════════════
function proceedToConfirm() {
  const si = {
    address: document.getElementById("ship-address").value.trim(),
    city:    document.getElementById("ship-city").value.trim(),
    state:   document.getElementById("ship-state").value.trim(),
    pinCode: document.getElementById("ship-pin").value.trim(),
    country: document.getElementById("ship-country").value,
    phoneNo: document.getElementById("ship-phone").value.trim(),
  };
  if (!si.address || !si.city || !si.pinCode) { showToast("Fill in all required fields", "error"); return; }
  STATE.shippingInfo = si;
  sessionStorage.setItem("rexony_shipping", JSON.stringify(si));
  showPage("confirm");
}

function renderConfirm() {
  const si   = STATE.shippingInfo || {};
  const info = JSON.parse(sessionStorage.getItem("orderInfo") || "{}");
  document.getElementById("confirm-shipping-details").innerHTML = `
    <div class="confirm-addr">
      <strong>${STATE.user?.name || ""}</strong><br/>
      ${si.address}<br/>${si.city}, ${si.state} ${si.pinCode}<br/>${si.country}<br/>${si.phoneNo || ""}
    </div>`;
  document.getElementById("confirm-items").innerHTML = STATE.cart.map(i =>
    `<div class="confirm-item"><span>${i.name} × ${i.quantity}</span><span>$${(i.price * i.quantity).toFixed(2)}</span></div>`
  ).join("");
  document.getElementById("confirm-subtotal").textContent = `$${(info.subtotal || 0).toFixed(2)}`;
  document.getElementById("confirm-ship").textContent     = info.shippingCharges === 0 ? "Free" : `$${(info.shippingCharges || 0).toFixed(2)}`;
  document.getElementById("confirm-tax").textContent      = `$${(info.tax || 0).toFixed(2)}`;
  document.getElementById("confirm-total").textContent    = `$${(info.totalPrice || 0).toFixed(2)}`;
}

function proceedToPayment() {
  processPayment();
}
// function proceedToPayment() {
//   const info = JSON.parse(sessionStorage.getItem("orderInfo") || "{}");
//   document.getElementById("pay-amount").textContent   = `$${(info.totalPrice || 0).toFixed(2)}`;
//   document.getElementById("payment-total").textContent = `$${(info.totalPrice || 0).toFixed(2)}`;
//   showPage("payment");
// }

async function processPayment() {
  const btn = document.getElementById("pay-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Redirecting to Stripe..."; }
  try {
    const info = JSON.parse(sessionStorage.getItem("orderInfo") || "{}");
    sessionStorage.setItem("rexony_pending_cart", JSON.stringify(STATE.cart));
    sessionStorage.setItem("rexony_pending_shipping", JSON.stringify(STATE.shippingInfo || {}));
    const token = await getJwtToken();
    if (token) sessionStorage.setItem("rexony_auth_token", token);
    const payData = await PaymentAPI.createIntent({
      email:  STATE.user?.email,
      items:  STATE.cart,
      amount: Math.round((info.totalPrice || 0) * 100),
    });
    window.location.href = payData.url;
  } catch (e) {
    showToast("Payment failed: " + e.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Pay Now"; }
  }
}

// ═══ MY ORDERS ═════════════════════════════════════════════════════
async function loadMyOrders() {
  const el = document.getElementById("orders-list");
  el.innerHTML = `<div class="loader-ring"></div>`;
  try {
    const data   = await OrderAPI.mine();
    const orders = data.orders || [];
    STATE.myOrders = orders;
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
    <div style="display:flex;gap:8px">
      <button class="or-detail-btn" onclick="showOrderDetail('${o.orderId||o._id}')">Details</button>
      ${o.status === "Processing" ? `<button class="or-detail-btn" style="background:#e53935;border-color:#e53935" onclick="cancelOrder('${o.orderId||o._id}')">Cancel</button>` : ""}
    </div>
  </div>`).join("");
  } catch {
    el.innerHTML = `<div class="empty-cart"><div class="empty-icon">📦</div><h2>No orders yet</h2><p>Place your first order to see it here.</p><button class="btn-primary" onclick="showPage('shop')">Shop Now</button></div>`;
  }
}

function showOrderDetail(id) {
  const order = (STATE.myOrders || []).find(o => (o.orderId || o._id) === id);
  if (!order) return showModal(`<p>Order not found.</p>`);
  const items = order.orderItems || order.items || [];
  showModal(`
    <h3 style="margin-bottom:12px">Order #${id.slice(-10)}</h3>
    <p><strong>Status:</strong> <span class="or-status status-${(order.status||'processing').toLowerCase()}">${order.status||'Processing'}</span></p>
    <p><strong>Date:</strong> ${new Date(order.createdAt||Date.now()).toLocaleDateString()}</p>
    <hr style="margin:12px 0;border-color:var(--border)">
    <h4 style="margin-bottom:8px">Items</h4>
    ${items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${i.name} × ${i.quantity||1}</span><span>$${((i.price||0)*(i.quantity||1)).toFixed(2)}</span></div>`).join("")}
    <hr style="margin:12px 0;border-color:var(--border)">
    <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>$${(order.itemsPrice||0).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Shipping</span><span>$${(order.shippingPrice||0).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Tax</span><span>$${(order.taxPrice||0).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;margin-top:6px"><span>Total</span><span>$${(order.totalPrice||0).toFixed(2)}</span></div>
    ${order.shippingInfo ? `<hr style="margin:12px 0;border-color:var(--border)"><h4 style="margin-bottom:8px">Shipping To</h4><p>${order.shippingInfo.address||""}, ${order.shippingInfo.city||""} ${order.shippingInfo.postalCode||""}</p>` : ""}
    ${order.status === "Processing" ? `<button class="btn-primary" style="margin-top:16px;background:#e53935;border:none;border-radius:6px;padding:8px 16px;color:#fff;cursor:pointer" onclick="cancelOrder('${id}');closeModal()">Cancel Order</button>` : ""}
  `);
}

async function cancelOrder(id) {
  if (!confirm("Are you sure you want to cancel this order?")) return;
  try {
    await OrderAPI.cancel(id);
    showToast("Order cancelled", "success");
    loadMyOrders();
  } catch (e) { showToast(e.message, "error"); }
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
    const revenue = orders.reduce((s, o) => s + (o.itemsPrice || 0), 0);
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
  tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Loading...</td></tr>`;
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
        <td style="text-align:center"><input type="checkbox" ${p.featured ? "checked" : ""} onchange="toggleFeatured('${p.productId||p._id}', this.checked)"></td>
        <td>
          <button class="tbl-action" onclick="editProduct('${p.productId||p._id}')">Edit</button>
          <button class="tbl-action danger" onclick="confirmDeleteProduct('${p.productId||p._id}','${p.name}')">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="8" class="loading-cell">No products found</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Error loading products</td></tr>`; }
}

async function toggleFeatured(id, val) {
  try {
    await ProductAPI.update(id, { featured: val });
    showToast(val ? "Marked as featured" : "Removed from featured", "success");
  } catch(e) { showToast(e.message, "error"); }
}

function showAddProduct() {
  document.getElementById("product-form-card").style.display = "block";
  document.getElementById("product-form-title").textContent  = "Add New Product";
  document.getElementById("edit-product-id").value = "";
  ["prod-name","prod-price","prod-stock","prod-desc","prod-image","prod-tags","prod-id"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("prod-id").readOnly = false;
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
  document.getElementById("prod-tags").value        = (p.tags || []).join(", ");
  document.getElementById("prod-id").value          = id;
  document.getElementById("prod-id").readOnly       = true;
  switchAdmin("products");
  document.getElementById("product-form-card").scrollIntoView({ behavior: "smooth" });
}

async function saveProduct() {
  const id   = document.getElementById("edit-product-id").value;
  const customId = document.getElementById("prod-id").value.trim();
  const data = {
    name:        document.getElementById("prod-name").value.trim(),
    price:       parseFloat(document.getElementById("prod-price").value),
    category:    document.getElementById("prod-category").value,
    Stock:       parseInt(document.getElementById("prod-stock").value),
    description: document.getElementById("prod-desc").value.trim(),
    images:      [{ url: document.getElementById("prod-image").value.trim() }],
    tags:        document.getElementById("prod-tags")?.value.trim().split(",").map(t => t.trim()).filter(Boolean) || [],
  };
  if (!id && customId) data.productId = customId;
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

function sortOrders(key) {
  if (_orderSort.key === key) _orderSort.dir *= -1;
  else { _orderSort.key = key; _orderSort.dir = -1; }
  loadAdminOrders();
}

async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Loading...</td></tr>`;
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
            <option value="Cancelled">Cancelled</option>
          </select>
        </td>
        <td>
          <button class="tbl-action danger" onclick="deleteAdminOrder('${o.orderId||o._id}')">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="8" class="loading-cell">No orders yet</td></tr>`;
  } catch { tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Error loading orders</td></tr>`; }
}

async function updateOrderStatus(id, status) {
  if (!status) return;
  try { await OrderAPI.update(id, { status }); showToast(`Order updated to ${status}`, "success"); loadAdminOrders(); }
  catch (e) { showToast(e.message, "error"); }
}

async function deleteAdminOrder(id) {
  if (!confirm("Delete this order permanently?")) return;
  try {
    await OrderAPI.remove(id);
    showToast("Order deleted", "success");
    loadAdminOrders();
  } catch (e) { showToast(e.message, "error"); }
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
