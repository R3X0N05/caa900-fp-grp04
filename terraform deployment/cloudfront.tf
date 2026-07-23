# ═══════════════════════════════════════════════════════════════
#  Amazon CloudFront — Product Images CDN
#  Sits in front of the private S3 bucket.
#  WAF WebACL is attached for security.
# ═══════════════════════════════════════════════════════════════

resource "aws_cloudfront_distribution" "product_images" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Rexony product images CDN"
  default_root_object = ""

  # S3 origin — private bucket accessed via OAC
  origin {
    domain_name              = aws_s3_bucket.product_images.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.product_images.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.product_images.id
  }

  default_cache_behavior {
    target_origin_id       = "S3-${aws_s3_bucket.product_images.id}"
    viewer_protocol_policy = "redirect-to-https"   # HTTPS everywhere
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # 24h TTL for product images
    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
    compress    = true
  }

  # Attach WAF
  web_acl_id = aws_wafv2_web_acl.cloudfront.arn

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-cdn"
  }
}
