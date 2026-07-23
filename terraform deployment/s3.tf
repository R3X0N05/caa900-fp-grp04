# ═══════════════════════════════════════════════════════════════
#  Amazon S3 — Product Images Bucket
#  Public read is served via CloudFront only (bucket is private).
# ═══════════════════════════════════════════════════════════════

resource "aws_s3_bucket" "product_images" {
  bucket = "${var.project_name}-product-images-${var.environment}"

  tags = {
    Name = "${var.project_name}-product-images"
  }
}

# Block all public access — images served through CloudFront only
resource "aws_s3_bucket_public_access_block" "product_images" {
  bucket = aws_s3_bucket.product_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "product_images" {
  bucket = aws_s3_bucket.product_images.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "product_images" {
  bucket = aws_s3_bucket.product_images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# OAC (Origin Access Control) lets CloudFront read from the private bucket
resource "aws_cloudfront_origin_access_control" "product_images" {
  name                              = "${var.project_name}-product-images-oac"
  description                       = "OAC for Rexony product images S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Allow CloudFront to GetObject from the bucket
data "aws_iam_policy_document" "s3_cloudfront" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.product_images.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.product_images.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "product_images" {
  bucket = aws_s3_bucket.product_images.id
  policy = data.aws_iam_policy_document.s3_cloudfront.json
}
