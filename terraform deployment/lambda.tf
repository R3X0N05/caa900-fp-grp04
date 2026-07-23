# ═══════════════════════════════════════════════════════════════
#  Lambda Functions
#
#  Function names use hyphens (rexony-products) matching what is
#  deployed in AWS.  Source files in the repo root are zipped
#  by archive_file and uploaded on terraform apply.
#
#  Runtime : nodejs20.x
#  Handler : <filename-without-extension>.handler
# ═══════════════════════════════════════════════════════════════

# ─── rexony-products ─────────────────────────────────────────────
data "archive_file" "products" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_products.js"
  output_path = "${local.build_dir}/rexony_products.zip"
}

resource "aws_lambda_function" "products" {
  function_name    = "rexony-products"
  description      = "Product listing, creation, update and deletion"
  role             = aws_iam_role.products_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_products.handler"
  filename         = data.archive_file.products.output_path
  source_code_hash = data.archive_file.products.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      PRODUCTS_TABLE = aws_dynamodb_table.products.name
      REGION         = var.aws_region
    }
  }

  depends_on = [aws_iam_role_policy.products_lambda]
}

resource "aws_cloudwatch_log_group" "products" {
  name              = "/aws/lambda/rexony-products"
  retention_in_days = 14
}

# ─── rexony-orders ───────────────────────────────────────────────
data "archive_file" "orders" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_orders.js"
  output_path = "${local.build_dir}/rexony_orders.zip"
}

resource "aws_lambda_function" "orders" {
  function_name    = "rexony-orders"
  description      = "Order placement and management"
  role             = aws_iam_role.orders_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_orders.handler"
  filename         = data.archive_file.orders.output_path
  source_code_hash = data.archive_file.orders.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      ORDERS_TABLE = aws_dynamodb_table.orders.name
      REGION       = var.aws_region
    }
  }

  depends_on = [aws_iam_role_policy.orders_lambda]
}

resource "aws_cloudwatch_log_group" "orders" {
  name              = "/aws/lambda/rexony-orders"
  retention_in_days = 14
}

# ─── rexony-cart ─────────────────────────────────────────────────
data "archive_file" "cart" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_cart.js"
  output_path = "${local.build_dir}/rexony_cart.zip"
}

resource "aws_lambda_function" "cart" {
  function_name    = "rexony-cart"
  description      = "Shopping cart (get, add, update, remove, clear)"
  role             = aws_iam_role.cart_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_cart.handler"
  filename         = data.archive_file.cart.output_path
  source_code_hash = data.archive_file.cart.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      CART_TABLE = aws_dynamodb_table.cart.name
      REGION     = var.aws_region
    }
  }

  depends_on = [aws_iam_role_policy.cart_lambda]
}

resource "aws_cloudwatch_log_group" "cart" {
  name              = "/aws/lambda/rexony-cart"
  retention_in_days = 14
}

# ─── rexony-payment (runs inside VPC private subnet) ─────────────
data "archive_file" "payment" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_payment.js"
  output_path = "${local.build_dir}/rexony_payment.zip"
}

resource "aws_lambda_function" "payment" {
  function_name    = "rexony-payment"
  description      = "Stripe Checkout session creation — runs in VPC private subnet"
  role             = aws_iam_role.payment_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_payment.handler"
  filename         = data.archive_file.payment.output_path
  source_code_hash = data.archive_file.payment.output_base64sha256
  timeout          = 15
  memory_size      = 128

  vpc_config {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.payment_lambda.id]
  }

  environment {
    variables = {
      STRIPE_SECRET_KEY = var.stripe_secret_key
      SUCCESS_URL       = "https://main.dijcvcdvudbc2.amplifyapp.com?payment=success"
      CANCEL_URL        = "https://main.dijcvcdvudbc2.amplifyapp.com?payment=cancelled"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.payment_lambda_vpc,
    aws_iam_role_policy.payment_lambda,
  ]
}

resource "aws_cloudwatch_log_group" "payment" {
  name              = "/aws/lambda/rexony-payment"
  retention_in_days = 14
}

# ─── rexony-sns (order-confirmation email via SES) ───────────────
data "archive_file" "sns" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_sns"
  output_path = "${local.build_dir}/rexony_sns.zip"
}

resource "aws_lambda_function" "sns" {
  function_name    = "rexony-sns"
  description      = "Sends order-confirmation email via SES on DynamoDB Orders INSERT"
  role             = aws_iam_role.sns_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_sns.handler"
  filename         = data.archive_file.sns.output_path
  source_code_hash = data.archive_file.sns.output_base64sha256
  timeout          = 15
  memory_size      = 128

  environment {
    variables = {
      FROM_EMAIL = var.ses_from_email
      REGION     = var.aws_region
    }
  }

  depends_on = [aws_iam_role_policy.sns_lambda]
}

resource "aws_cloudwatch_log_group" "sns" {
  name              = "/aws/lambda/rexony-sns"
  retention_in_days = 14
}

# DynamoDB Streams → rexony-sns trigger (fires only on INSERT into Orders)
resource "aws_lambda_event_source_mapping" "orders_to_sns" {
  event_source_arn  = aws_dynamodb_table.orders.stream_arn
  function_name     = aws_lambda_function.sns.arn
  starting_position = "LATEST"
  batch_size        = 1

  filter_criteria {
    filter {
      pattern = jsonencode({ eventName = ["INSERT"] })
    }
  }
}

# ─── rexony-users ────────────────────────────────────────────────
data "archive_file" "users" {
  type        = "zip"
  source_file = "${var.lambda_source_dir}/rexony_users.js"
  output_path = "${local.build_dir}/rexony_users.zip"
}

resource "aws_lambda_function" "users" {
  function_name    = "rexony-users"
  description      = "Admin user management via Cognito"
  role             = aws_iam_role.users_lambda.arn
  runtime          = "nodejs20.x"
  handler          = "rexony_users.handler"
  filename         = data.archive_file.users.output_path
  source_code_hash = data.archive_file.users.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      USER_POOL_ID = aws_cognito_user_pool.main.id
      REGION       = var.aws_region
    }
  }

  depends_on = [aws_iam_role_policy.users_lambda]
}

resource "aws_cloudwatch_log_group" "users" {
  name              = "/aws/lambda/rexony-users"
  retention_in_days = 14
}
