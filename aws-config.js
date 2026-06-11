// ─── AWS CONFIG ─────────────────────────────────────────────────
// Fill these in after deploying to AWS Learner Lab.
// For localhost testing, leave API_BASE as the mock server URL.
const AWS_CONFIG = {
  API_BASE:      "http://localhost:4000/prod", // swap for API Gateway URL when on AWS
  USER_POOL_ID:  "us-east-1_XXXXXXXXX",
  CLIENT_ID:     "XXXXXXXXXXXXXXXXXXXXXXXXXX",
  REGION:        "us-east-1",
  COGNITO_DOMAIN:"https://rexony-auth.auth.us-east-1.amazoncognito.com",
  STRIPE_PK:     "pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
};
