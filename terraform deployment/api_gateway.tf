# ═══════════════════════════════════════════════════════════════
#  Amazon API Gateway — REST API
#
#  Uses the OpenAPI 3 definition exported directly from AWS
#  (api-definition.yaml) with hardcoded ARNs replaced by
#  Terraform template variables.  This is a 1:1 mirror of
#  the live API — every route, CORS header, and Cognito
#  authorizer setting is preserved exactly as deployed.
#
#  Existing base URL:
#    https://9ok7xa70r0.execute-api.us-east-1.amazonaws.com/prod
# ═══════════════════════════════════════════════════════════════

resource "aws_api_gateway_rest_api" "main" {
  name        = "rexony-api"
  description = "Rexony e-commerce REST API"

  # Feed the exported OpenAPI spec directly — Terraform substitutes
  # template vars with real Lambda invoke ARNs and Cognito pool ARN.
  body = templatefile("${path.module}/api-definition.yaml", {
    products_integration_uri = aws_lambda_function.products.invoke_arn
    orders_integration_uri   = aws_lambda_function.orders.invoke_arn
    cart_integration_uri     = aws_lambda_function.cart.invoke_arn
    payment_integration_uri  = aws_lambda_function.payment.invoke_arn
    users_integration_uri    = aws_lambda_function.users.invoke_arn
    cognito_user_pool_arn    = aws_cognito_user_pool.main.arn
  })

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  # Re-deploy whenever the API definition or any Lambda ARN changes
  lifecycle {
    create_before_destroy = true
  }
}

# ─── Deployment & Stage ──────────────────────────────────────────
resource "aws_api_gateway_deployment" "prod" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    # Any change to the OpenAPI body forces a new deployment
    redeployment = sha1(aws_api_gateway_rest_api.main.body)
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.prod.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = local.api_stage

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
  }

  xray_tracing_enabled = true

  tags = {
    Name = "rexony-api-prod"
  }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/rexony-api"
  retention_in_days = 14
}

# ─── Lambda invoke permissions (API Gateway → each function) ─────
resource "aws_lambda_permission" "apigw_products" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_orders" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orders.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_cart" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cart.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_payment" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.payment.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_users" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.users.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
