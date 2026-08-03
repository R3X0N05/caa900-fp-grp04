// ─── AUTH.JS — Cognito + demo-mode fallback ─────────────────────
// If the Cognito SDK CDN isn't loaded (local dev), falls back to
// localStorage-based fake auth so the UI is fully testable offline.

let _pool = null;

function initCognito() {
  if (typeof AmazonCognitoIdentity === "undefined") return;
  _pool = new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: AWS_CONFIG.USER_POOL_ID,
    ClientId:   AWS_CONFIG.CLIENT_ID,
  });
}

function getJwtToken() {
  return new Promise((res) => {
    if (!_pool) return res(localStorage.getItem("_demo_jwt") || null);
    const u = _pool.getCurrentUser();
    if (!u) return res(null);
    u.getSession((err, s) => res(!err && s.isValid() ? s.getIdToken().getJwtToken() : null));
  });
}

async function getAuthHeaders() {
  const t = await getJwtToken() || sessionStorage.getItem("rexony_auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: t } : {}) };
}

function loadUserFromSession() {
  return new Promise((res) => {
    if (!_pool) {
      const d = localStorage.getItem("_demo_user");
      return res(d ? JSON.parse(d) : null);
    }
    const u = _pool.getCurrentUser();
    if (!u) return res(null);
    u.getSession((err, s) => {
      if (err || !s.isValid()) return res(null);
      const c = s.getIdToken().payload;
      res({ _id: c.sub, name: c.name || c["cognito:username"] || "User", email: c.email, role: c["custom:custom:role"] || "user" });
    });
  });
}

function cognitoLogin(email, password) {
  return new Promise((res, rej) => {
    if (!_pool) {
      if (!email || !password) return rej("Enter email and password");
      const u = {
        _id:   "demo-" + Date.now(),
        name:  email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        email, role: email.toLowerCase().includes("admin") ? "admin" : "user"
      };
      localStorage.setItem("_demo_user", JSON.stringify(u));
      localStorage.setItem("_demo_jwt", "demo-jwt-" + Date.now());
      return res(u);
    }
    const cogUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: _pool });
    cogUser.authenticateUser(new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: s => {
        const c = s.getIdToken().payload;
        res({ _id: c.sub, name: c.name || email.split("@")[0], email: c.email, role: c["custom:custom:role"] || "user" });
      },
      onFailure: e => rej(e.message || "Login failed"),
    });
  });
}

function cognitoRegister(name, email, password) {
  return new Promise((res, rej) => {
    if (!_pool) {
      const u = { _id: "demo-" + Date.now(), name, email, role: "user" };
      localStorage.setItem("_demo_user", JSON.stringify(u));
      localStorage.setItem("_demo_jwt", "demo-jwt-" + Date.now());
      return res({ success: true, message: "Account created (demo mode — no verification needed)" });
    }
    const attrs = [
      new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "name",  Value: name }),
      new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: email }),
    ];
    _pool.signUp(email, password, attrs, null, (err) => {
      if (err) return rej(err.message || "Registration failed");
      res({ success: true, message: "Check your email for a verification code" });
    });
  });
}

function cognitoLogout() {
  if (_pool) { const u = _pool.getCurrentUser(); if (u) u.signOut(); }
  localStorage.removeItem("_demo_user");
  localStorage.removeItem("_demo_jwt");
}

function cognitoForgotPassword(email) {
  return new Promise((res, rej) => {
    if (!_pool) return res("Reset code sent (demo mode — use any 6-digit code)");
    const u = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: _pool });
    u.forgotPassword({ onSuccess: () => res("Code sent to your email"), onFailure: e => rej(e.message) });
  });
}

function cognitoResetPassword(email, code, newPass) {
  return new Promise((res, rej) => {
    if (!_pool) return res(true);
    const u = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: _pool });
    u.confirmPassword(code, newPass, { onSuccess: () => res(true), onFailure: e => rej(e.message) });
  });
}

function loginWithCognito() {
  const p = new URLSearchParams({ client_id: AWS_CONFIG.CLIENT_ID, response_type: "token", scope: "email openid profile", redirect_uri: window.location.origin });
  window.location.href = `${AWS_CONFIG.COGNITO_DOMAIN}/login?${p}`;
}

function cognitoVerify(email, code) {
  return new Promise((res, rej) => {
    if (!_pool) return res(true); // demo mode skip
    const u = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: _pool });
    u.confirmRegistration(code, true, (err) => {
      if (err) return rej(err.message || "Invalid code");
      res(true);
    });
  });
}

function cognitoResendCode(email) {
  return new Promise((res, rej) => {
    if (!_pool) return res(true);
    const u = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: _pool });
    u.resendConfirmationCode((err) => {
      if (err) return rej(err.message);
      res(true);
    });
  });
}
