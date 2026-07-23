# ═══════════════════════════════════════════════════════════════
#  DynamoDB Tables
#  All tables use PAY_PER_REQUEST (on-demand) and have
#  Point-In-Time Recovery (PITR) enabled for disaster recovery.
# ═══════════════════════════════════════════════════════════════

# ─── Products ───────────────────────────────────────────────────
resource "aws_dynamodb_table" "products" {
  name         = "Products"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "productId"

  attribute {
    name = "productId"
    type = "S"
  }

  # Disaster Recovery: continuous backups with 35-day retention window
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Products"
  }
}

# ─── Orders ─────────────────────────────────────────────────────
resource "aws_dynamodb_table" "orders" {
  name         = "Orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI allows querying orders by user (used by /orders/me)
  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  # DynamoDB Streams: feeds the SES notification Lambda on INSERT
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  # Disaster Recovery: PITR enabled
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Orders"
  }
}

# ─── Cart ────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "cart" {
  name         = "Cart"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "productId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "productId"
    type = "S"
  }

  # Disaster Recovery: PITR enabled
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Cart"
  }
}
