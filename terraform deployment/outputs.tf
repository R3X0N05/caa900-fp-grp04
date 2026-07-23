# ═══════════════════════════════════════════════════════════════
#  Outputs — printed after terraform apply
#  Use these to update aws-config.js if recreating from scratch.
# ═══════════════════════════════════════════════════════════════

output "api_base_url" {
  description = "API Gateway base URL — update AWS_CONFIG.API_BASE in aws-config.js"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com/${local.api_stage}"
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID — update AWS_CONFIG.COGNITO_USER_POOL_ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID — update AWS_CONFIG.COGNITO_CLIENT_ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "amplify_app_url" {
  description = "Amplify hosting URL"
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.main.id}.amplifyapp.com"
}

output "cloudfront_cdn_url" {
  description = "CloudFront CDN URL for product images"
  value       = "https://${aws_cloudfront_distribution.product_images.domain_name}"
}

output "s3_product_images_bucket" {
  description = "S3 bucket name for product images"
  value       = aws_s3_bucket.product_images.id
}

output "dynamodb_table_names" {
  description = "DynamoDB table names"
  value = {
    products = aws_dynamodb_table.products.name
    orders   = aws_dynamodb_table.orders.name
    cart     = aws_dynamodb_table.cart.name
  }
}

output "ses_identity" {
  description = "SES verified email identity"
  value       = aws_ses_email_identity.sender.email
}

output "vpc_id" {
  description = "VPC ID containing the payment Lambda private subnet"
  value       = aws_vpc.main.id
}
