// ─── API.JS — All calls to API Gateway ───────────────────────────

const API = () => AWS_CONFIG.API_BASE;

async function apiFetch(path, opts = {}) {
  const headers = opts.auth ? await getAuthHeaders() : { "Content-Type": "application/json" };
  const res = await fetch(API() + path, { ...opts, headers });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

// ── Products ─────────────────────────────────────────────────────
const ProductAPI = {
  getAll:   (q = "") => apiFetch(`/products${q}`),
  getOne:   (id)     => apiFetch(`/product/${id}`),
  create:   (d)      => apiFetch("/admin/product/new",   { method: "POST",   auth: true, body: JSON.stringify(d) }),
  update:   (id, d)  => apiFetch(`/admin/product/${id}`, { method: "PUT",    auth: true, body: JSON.stringify(d) }),
  remove:   (id)     => apiFetch(`/admin/product/${id}`, { method: "DELETE", auth: true }),
  adminAll: ()       => apiFetch("/admin/products",      { auth: true }),
  addReview:(d)      => apiFetch("/review",              { method: "PUT",    auth: true, body: JSON.stringify(d) }),
  getReviews:(id)    => apiFetch(`/reviews?id=${id}`),
  delReview:(rid,pid)=> apiFetch(`/reviews?id=${rid}&productId=${pid}`, { method: "DELETE", auth: true }),
};

// ── Cart ──────────────────────────────────────────────────────────
const CartAPI = {
  get:    ()         => apiFetch("/cart",              { auth: true }),
  add:    (d)        => apiFetch("/cart",              { method: "POST",   auth: true, body: JSON.stringify(d) }),
  update: (d)        => apiFetch("/cart",              { method: "PUT",    auth: true, body: JSON.stringify(d) }),
  remove: (productId)=> apiFetch(`/cart/${productId}`, { method: "DELETE", auth: true }),
  clear:  ()         => apiFetch("/cart/clear",        { method: "DELETE", auth: true }),
};

// ── Orders ────────────────────────────────────────────────────────
const OrderAPI = {
  place:    (d)   => apiFetch("/order/new",         { method: "POST", auth: true, body: JSON.stringify(d) }),
  mine:     ()    => apiFetch("/orders/me",          { auth: true }),
  adminAll: ()    => apiFetch("/admin/orders",       { auth: true }),
  update:   (id,d)=> apiFetch(`/admin/order/${id}`,  { method: "PUT", auth: true, body: JSON.stringify(d) }),
  remove:   (id)  => apiFetch(`/admin/order/${id}`,  { method: "DELETE", auth: true }),
};

// ── Users ─────────────────────────────────────────────────────────
const UserAPI = {
  updateMe: (d)   => apiFetch("/me/update",          { method: "PUT", auth: true, body: JSON.stringify(d) }),
  adminAll: ()    => apiFetch("/admin/users",         { auth: true }),
  adminGet: (id)  => apiFetch(`/admin/user/${id}`,   { auth: true }),
  adminUpd: (id,d)=> apiFetch(`/admin/user/${id}`,   { method: "PUT", auth: true, body: JSON.stringify(d) }),
  adminDel: (id)  => apiFetch(`/admin/user/${id}`,   { method: "DELETE", auth: true }),
};

// ── Payment ───────────────────────────────────────────────────────
const PaymentAPI = {
  createIntent: async (data) => {
    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    return res.json();
  }
};
