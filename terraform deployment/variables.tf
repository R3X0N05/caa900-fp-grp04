variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix used for all resource names"
  type        = string
  default     = "rexony"
}

variable "environment" {
  description = "Deployment environment (prod / staging)"
  type        = string
  default     = "prod"
}

# ── Stripe ────────────────────────────────────────────────────────
variable "stripe_secret_key" {
  description = "Stripe secret key for payment Lambda (sk_test_...)"
  type        = string
  sensitive   = true
}

# ── SES ───────────────────────────────────────────────────────────
variable "ses_from_email" {
  description = "Verified SES sender address (must be verified in AWS SES)"
  type        = string
  default     = "noreply@rexony.ca"
}

# ── Amplify / GitHub ─────────────────────────────────────────────
variable "amplify_github_token" {
  description = "GitHub personal access token for Amplify auto-build (leave empty to skip)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "amplify_repo_url" {
  description = "GitHub repository URL for AWS Amplify"
  type        = string
  default     = "https://github.com/R3X0N05/caa900-fp-grp04"
}

variable "amplify_branch" {
  description = "Git branch for Amplify to deploy"
  type        = string
  default     = "main"
}

# ── Lambda code path ─────────────────────────────────────────────
variable "lambda_source_dir" {
  description = "Path to directory containing Lambda source files (relative to terraform/)"
  type        = string
  default     = ".."   # repo root when terraform/ is a subdirectory
}
