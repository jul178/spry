# Non-secret configuration variables for Spry infrastructure
# Secrets (e.g. google_client_secret) are set in HCP Terraform workspace variables

project_name          = "spry"
aws_region            = "us-east-1"
architecture          = "arm64"
cognito_domain_prefix = "spry-auth-132568187649"
frontend_url          = "https://d3c60cb1w4a4z2.cloudfront.net"
local_port            = 3000
google_client_id      = "158134029694-avroa50fs66pvnf8qatc39ihh2j9to1n.apps.googleusercontent.com"
sender_email          = "juliadub2008@gmail.com"
recipient_email       = "juliadub2008@gmail.com"
create_email_identity = false
parser_model          = "anthropic.claude-opus-5-5"
log_retention_days    = 7
cors_origins          = "*"

builder_image_uri     = "132568187649.dkr.ecr.us-east-1.amazonaws.com/spry-backend:df12f243f090"
ai_image_uri          = "132568187649.dkr.ecr.us-east-1.amazonaws.com/spry-backend:df12f243f090"
