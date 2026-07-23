locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Group       = "Group-04"
    Course      = "CAA900"
  }

  # Lambda build output directory (created by archive_file resources)
  build_dir = "${path.module}/.build"

  # API Gateway stage name (matches existing deployment)
  api_stage = "prod"

  # Existing resource IDs (for reference / import)
  # existing_api_id        = "9ok7xa70r0"
  # existing_user_pool_id  = "us-east-1_Lw2Xpo4ll"
  # existing_client_id     = "72p5tpp3hq15qae4hrap8lr0l5"
  # existing_amplify_app   = "dijcvcdvudbc2"
}
