# ═══════════════════════════════════════════════════════════════
#  CloudWatch — Alarms & Dashboards
#  Provides observability for Lambda errors and API Gateway
#  latency as required by the project brief.
# ═══════════════════════════════════════════════════════════════

# ─── Lambda Error Alarms ─────────────────────────────────────────
locals {
  # Uses function_name from the Lambda resources (rexony-products, etc.)
  lambda_functions = {
    products = aws_lambda_function.products.function_name
    orders   = aws_lambda_function.orders.function_name
    cart     = aws_lambda_function.cart.function_name
    payment  = aws_lambda_function.payment.function_name
    sns      = aws_lambda_function.sns.function_name
    users    = aws_lambda_function.users.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_functions

  alarm_name          = "${each.key}-lambda-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Lambda ${each.key} has errors in the last 5 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }
}

# ─── API Gateway 5xx Alarm ───────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project_name}-api-5xx-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "API Gateway returned 5+ server errors in 5 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = aws_api_gateway_rest_api.main.name
    Stage   = local.api_stage
  }
}

# ─── DynamoDB Throttle Alarm ─────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "dynamo_throttles" {
  for_each = {
    products = aws_dynamodb_table.products.name
    orders   = aws_dynamodb_table.orders.name
    cart     = aws_dynamodb_table.cart.name
  }

  alarm_name          = "${each.key}-dynamo-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "DynamoDB ${each.key} system errors detected"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = each.value
  }
}

# ─── CloudWatch Dashboard ─────────────────────────────────────────
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          title  = "Lambda Invocations"
          period = 300
          stat   = "Sum"
          metrics = [
            for name, fn in local.lambda_functions :
            ["AWS/Lambda", "Invocations", "FunctionName", fn]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Lambda Errors"
          period = 300
          stat   = "Sum"
          metrics = [
            for name, fn in local.lambda_functions :
            ["AWS/Lambda", "Errors", "FunctionName", fn]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "API Gateway Latency (ms)"
          period = 300
          stat   = "p99"
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", aws_api_gateway_rest_api.main.name, "Stage", local.api_stage]
          ]
        }
      },
    ]
  })
}
