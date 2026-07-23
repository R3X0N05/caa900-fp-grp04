# ═══════════════════════════════════════════════════════════════
#  AWS Amplify — Frontend Hosting
#  Hosts the React SPA with auto-CI/CD from the main branch.
#  Existing app: dijcvcdvudbc2 (main.dijcvcdvudbc2.amplifyapp.com)
# ═══════════════════════════════════════════════════════════════

resource "aws_amplify_app" "main" {
  name       = "${var.project_name}-frontend"
  repository = var.amplify_repo_url

  # GitHub OAuth token (stored as sensitive variable)
  access_token = var.amplify_github_token

  # Build spec: static HTML/JS — no build step required
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        build:
          commands:
            - echo "Static site — no build step"
      artifacts:
        baseDirectory: /
        files:
          - "**/*"
      cache:
        paths: []
  EOT

  # Amplify auto-detects framework; set to WEB for plain HTML/JS
  platform = "WEB"

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = ""
  }

  tags = {
    Name = "${var.project_name}-amplify"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = var.amplify_branch

  # Auto-build on every push to main
  enable_auto_build = true

  tags = {
    Name = "${var.project_name}-amplify-${var.amplify_branch}"
  }
}
