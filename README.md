# Rexony — Frontend (`caa900-fp-grp04`)

Serverless e-commerce storefront for the **CAA900 Capstone Project · Group 04**.
This repository owns the **client-side application only** — authentication, shop UI, cart, checkout, orders, and admin dashboard.

- Backend Lambda code → [`caa900-BE-grp04`](https://github.com/R3X0N05/caa900-BE-grp04)
- Infrastructure (Terraform) → [`caa900-IAC-grp04`](https://github.com/R3X0N05/caa900-IAC-grp04)

**Live site:** https://main.dijcvcdvudbc2.amplifyapp.com/

## Authors

- **Selva Roshan Sivagnanasundaram Rexon** (126332246) — [@R3X0N05](https://github.com/R3X0N05)
- **Tony Vu** (132798527) — [@tvu006](https://github.com/tvu006)

---

## Architecture

![Rexony Architecture Diagram](./architecture.jpg)

> Website visitors hit **CloudFront + WAF** for caching and security, then reach the **Amplify**-hosted SPA. The frontend authenticates through **Cognito**, calls **API Gateway** (JWT-protected), which routes to the appropriate **Lambda** function. Orders, products, and cart are stored in **DynamoDB**. The payment Lambda runs in a **VPC private subnet** and calls **Stripe**. Order events trigger **SES** confirmation emails via DynamoDB Streams. **CloudWatch** captures logs and alarms.

---

## Stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- AWS Cognito — sign-up, login, JWT token management (Cognito Identity JS SDK)
- AWS Amplify — static hosting, CI/CD auto-deploys on push to `main`
- API Gateway — all data fetching routed through `api.js`
- Stripe Checkout — hosted payment page

---

## Features

**Storefront**
- Browse products with live search, price-range slider, star-rating filter, and sort controls
- Search results show a bold-highlighted count: `12 results for "lamp"`
- Product detail pages with reviews and ratings

**Account**
- Sign-up with email verification, login, forgot / reset password
- Profile — update display name (saved directly to Cognito via SDK, persists across page reloads), change password

**Cart & Checkout**
- Persistent cart for logged-in users; guest cart via `localStorage`
- Stripe-powered checkout with tax and shipping calculation
- Order confirmation email triggered automatically via SES

**Admin Dashboard** *(custom:role = "admin" required)*
- Product management — create, update, delete
- Order management — view all orders, update status
- User management — view Cognito users, promote to admin, delete

---

## Project Structure

```
caa900-fp-grp04/
├── index.html          # Single-page app shell — all pages as <div> sections
├── app.js              # Core SPA logic — routing, cart, shop filters, orders, admin
├── auth.js             # Cognito SDK wrapper + offline demo-mode fallback
├── api.js              # Fetch wrapper for all API Gateway calls
├── aws-config.js       # Cognito + API Gateway environment config
└── styles.css          # Global styles
```

> **All network calls go through `api.js`.** Auth state is owned by `auth.js` and exposed to `app.js` through `STATE.user`. Components never call fetch directly.

---

## Local Development

No build step or package manager required.

```bash
git clone https://github.com/R3X0N05/caa900-fp-grp04.git
cd caa900-fp-grp04
# open index.html directly in a browser
```

### Offline / Demo Mode

When the Cognito Identity JS SDK fails to load from CDN (localhost, no internet), `auth.js` automatically falls back to **demo mode** backed by `localStorage`. The full UI — cart, checkout, admin panel — is testable without any AWS connection.

- Log in with any email and password
- Emails containing `"admin"` are granted the admin role automatically

---

## Configuration

Copy `aws-config.js` and fill in values from your Terraform outputs (see [`caa900-IAC-grp04`](https://github.com/R3X0N05/caa900-IAC-grp04)):

```js
const AWS_CONFIG = {
  USER_POOL_ID:    "us-east-1_XXXXXXXXX",       // cognito_user_pool_id
  CLIENT_ID:       "XXXXXXXXXXXXXXXXXXXXXXXXXX", // cognito_client_id
  COGNITO_DOMAIN:  "https://rexony.auth.us-east-1.amazoncognito.com",
  API_BASE:        "https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/prod", // api_gateway_url
};
```

---

## CI/CD

```
Developer
   │
   └── push to main ──► GitHub ──► AWS Amplify auto-build ──► Live site
```

Amplify is connected directly to the `main` branch via a GitHub token managed in the IAC repo. Pushes to `main` trigger an automatic deploy with no manual steps.

The `testtf` branch is the Terraform-managed Amplify branch used for infrastructure testing.

---

## Environments

| Branch | URL | Notes |
|---|---|---|
| `main` | https://main.dijcvcdvudbc2.amplifyapp.com/ | Production — auto-deploys via Amplify |
| `testtf` | Amplify-assigned URL | Terraform-managed branch (IAC repo) |
| `localhost` | Open `index.html` directly | Demo mode active, no AWS needed |

---

## Implementation Notes

**Profile name update** — `updateProfile()` in `app.js` calls `cognitoUpdateName()` in `auth.js` directly, bypassing API Gateway. This avoids CORS preflight failures on `/me/update` and uses the Cognito SDK's `user.updateAttributes()` instead. After the attribute is saved, `cognitoUpdateName` calls `u.refreshSession()` so the refreshed JWT contains the new name — meaning the name persists correctly after a page reload.

**Cognito role claim** — the custom role attribute is read as `claims["custom:role"]` throughout `auth.js` and `app.js`.

---