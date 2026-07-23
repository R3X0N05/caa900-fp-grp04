# ═══════════════════════════════════════════════════════════════
#  IAM Roles & Policies — Least Privilege per Lambda
#  Each function gets its own role with only the permissions it
#  actually uses. No wildcard Action or Resource values.
# ═══════════════════════════════════════════════════════════════

# ─── Shared trust policy (all Lambda roles use this) ─────────────
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ───────────────────────────────────────────────────────────────
#  rexony_products  →  DynamoDB Products (Scan, Get, Put, Delete)
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "products_lambda" {
  name               = "${var.project_name}-products-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "products_lambda" {
  name = "products-dynamodb-policy"
  role = aws_iam_role.products_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBProducts"
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]
        Resource = [aws_dynamodb_table.products.arn]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-products:*"
      },
    ]
  })
}

# ───────────────────────────────────────────────────────────────
#  rexony_orders  →  DynamoDB Orders (Put, Query, Scan, Update, Delete)
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "orders_lambda" {
  name               = "${var.project_name}-orders-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "orders_lambda" {
  name = "orders-dynamodb-policy"
  role = aws_iam_role.orders_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBOrders"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]
        Resource = [
          aws_dynamodb_table.orders.arn,
          "${aws_dynamodb_table.orders.arn}/index/*",
        ]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-orders:*"
      },
    ]
  })
}

# ───────────────────────────────────────────────────────────────
#  rexony_cart  →  DynamoDB Cart (Put, Query, Update, Delete)
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "cart_lambda" {
  name               = "${var.project_name}-cart-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "cart_lambda" {
  name = "cart-dynamodb-policy"
  role = aws_iam_role.cart_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBCart"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]
        Resource = [aws_dynamodb_table.cart.arn]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-cart:*"
      },
    ]
  })
}

# ───────────────────────────────────────────────────────────────
#  rexony_payment  →  VPC egress to Stripe, CloudWatch logs
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "payment_lambda" {
  name               = "${var.project_name}-payment-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

# Managed policy grants VPC networking permissions (ENI create/delete)
resource "aws_iam_role_policy_attachment" "payment_lambda_vpc" {
  role       = aws_iam_role.payment_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "payment_lambda" {
  name = "payment-logs-policy"
  role = aws_iam_role.payment_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-payment:*"
      },
    ]
  })
}

# ───────────────────────────────────────────────────────────────
#  rexony_sns  →  SES SendEmail + DynamoDB Streams + logs
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "sns_lambda" {
  name               = "${var.project_name}-sns-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "sns_lambda" {
  name = "sns-ses-streams-policy"
  role = aws_iam_role.sns_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SESSendEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"   # SES requires * — no resource-level ARN for SendEmail
      },
      {
        Sid    = "DynamoDBStream"
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams",
        ]
        Resource = [aws_dynamodb_table.orders.stream_arn]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-sns:*"
      },
    ]
  })
}

# ───────────────────────────────────────────────────────────────
#  rexony_users  →  Cognito admin operations
# ───────────────────────────────────────────────────────────────
resource "aws_iam_role" "users_lambda" {
  name               = "${var.project_name}-users-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "users_lambda" {
  name = "users-cognito-policy"
  role = aws_iam_role.users_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CognitoAdminOps"
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
        ]
        Resource = [aws_cognito_user_pool.main.arn]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/rexony-users:*"
      },
    ]
  })
}
