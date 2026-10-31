# Amazon Cognito User Pool with email/password and Google OAuth federation,
# managed login version 2, and public web client. Replaces infra/auth.yaml.

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  user_pool_tier           = "ESSENTIALS"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }



  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }

  lifecycle {
    ignore_changes = [
      schema
    ]
  }
}

# Optional Google OAuth 2.0 Identity Provider
resource "aws_cognito_identity_provider" "google" {
  count         = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
  }
}

# Public Web Client
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = (
    var.google_client_id != "" && var.google_client_secret != ""
    ? ["COGNITO", "Google"]
    : ["COGNITO"]
  )

  callback_urls = [
    "${var.frontend_url}/auth/callback",
    "${var.frontend_url}/auth/callback/",
    "${var.frontend_url}/",
    "http://localhost:${var.local_port}/auth/callback",
    "http://localhost:${var.local_port}/auth/callback/",
    "http://localhost:${var.local_port}/"
  ]

  logout_urls = [
    "${var.frontend_url}/",
    "http://localhost:${var.local_port}/"
  ]

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  depends_on = [aws_cognito_identity_provider.google]
}

# User Pool Prefix Domain with Managed Login v2
resource "aws_cognito_user_pool_domain" "main" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2
}
