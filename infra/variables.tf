variable "project_name" {
  type        = string
  default     = "spry"
  description = "Prefix for every resource name and default tags"
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for resources"
}

variable "architecture" {
  type        = string
  default     = "arm64"
  description = "CPU architecture for Lambda functions (arm64 or x86_64)"
  validation {
    condition     = contains(["arm64", "x86_64"], var.architecture)
    error_message = "architecture must be either arm64 or x86_64."
  }
}

# --- Cognito / Auth variables (infra/auth.yaml) ---

variable "cognito_domain_prefix" {
  type        = string
  description = "Globally unique prefix for https://<prefix>.auth.<region>.amazoncognito.com"
}

variable "frontend_url" {
  type        = string
  description = "Base URL of the deployed frontend (e.g. https://d3c60cb1w4a4z2.cloudfront.net)"
}

variable "local_port" {
  type        = number
  default     = 3000
  description = "Local development port for http://localhost:<port>"
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Optional Google OAuth 2.0 Web Client ID from Google Cloud Console"
}

variable "google_client_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional Google OAuth 2.0 Client Secret (sensitive, stored in HCP Terraform workspace)"
}

# --- Weekly Reports variables (infra/reports.yaml) ---

variable "sender_email" {
  type        = string
  default     = "juliadub2008@gmail.com"
  description = "Sender email address (verified identity in Amazon SES)"
}

variable "recipient_email" {
  type        = string
  default     = "juliadub2008@gmail.com"
  description = "Recipient email address (verified identity in Amazon SES sandbox)"
}

variable "create_email_identity" {
  type        = bool
  default     = false
  description = "Whether to create the SES EmailIdentity resource via Terraform"
}

variable "backend_stack_name" {
  type        = string
  default     = "spry-backend"
  description = "Name of the existing backend CloudFormation stack to read VPC and DB configuration from"
}

variable "builder_image_uri" {
  type        = string
  default     = ""
  description = "ECR URI of the backend image for report builder Lambda (defaults to backend stack image if empty)"
}

variable "vpc_id" {
  type        = string
  default     = ""
  description = "VPC ID override (defaults to backend stack VPC if empty)"
}

variable "subnet_ids" {
  type        = list(string)
  default     = []
  description = "Subnet IDs override for report builder Lambda (defaults to backend stack subnets if empty)"
}

variable "route_table_ids" {
  type        = list(string)
  default     = []
  description = "Route table IDs override for S3 Gateway endpoint (auto-discovered if empty)"
}

variable "security_group_id" {
  type        = string
  default     = ""
  description = "Security group ID override for builder Lambda (auto-discovered if empty)"
}

variable "database_url" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Database connection URL override (reads from backend stack secret if empty)"
}

# --- AI Agenda Parser variables (infra/ai.yml) ---

variable "ai_image_uri" {
  type        = string
  default     = ""
  description = "ECR URI of the container image for agenda parser Lambda (defaults to backend stack image if empty)"
}

variable "parser_model" {
  type        = string
  default     = "anthropic.claude-opus-5-5"
  description = "Bedrock foundation model ID or cross-region inference profile"
}

variable "cors_origins" {
  type        = string
  default     = "*"
  description = "Comma-separated list of allowed CORS origins for agenda parser Function URL"
}

variable "log_retention_days" {
  type        = number
  default     = 7
  description = "Days to retain CloudWatch logs"
}
