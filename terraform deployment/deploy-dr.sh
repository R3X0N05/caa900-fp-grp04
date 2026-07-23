#!/bin/bash
set -e

echo "Deploying infrastructure..."
terraform apply -auto-approve

API_URL=$(terraform output -raw api_base_url)
POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_client_id)

echo "Infrastructure ready:"
echo "  API:    $API_URL"
echo "  Pool:   $POOL_ID"
echo "  Client: $CLIENT_ID"

cd ..
git checkout -B dr-test

sed -i "s|API_BASE:.*|API_BASE:             \"$API_URL\",|" aws-config.js
sed -i "s|COGNITO_USER_POOL_ID:.*|COGNITO_USER_POOL_ID: \"$POOL_ID\",|" aws-config.js
sed -i "s|USER_POOL_ID:.*|USER_POOL_ID:         \"$POOL_ID\",|" aws-config.js
sed -i "s|CLIENT_ID:.*|CLIENT_ID:            \"$CLIENT_ID\",|" aws-config.js

git add aws-config.js
git commit -m "dr: update frontend config for DR deployment"
git push origin dr-test --force

echo "Done! Amplify will redeploy automatically."