# Outputs for Spry infrastructure (replaces CloudFormation outputs)
# Can be queried via `terraform output -raw <output_name>`

# --- Auth Outputs (was infra/auth.yaml) ---

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "client_id" {
  description = "Public User Pool Web Client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_domain_prefix" {
  description = "Prefix of the Cognito hosted domain"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "cognito_domain" {
  description = "Fully qualified domain of Cognito"
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "auth_url" {
  description = "Base HTTPS URL of Cognito managed login"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "google_redirect_uri" {
  description = "Redirect URI to register in Google Cloud Console"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
}

output "google_javascript_origin" {
  description = "Javascript origin to register in Google Cloud Console"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "google_configured" {
  description = "Whether Google IdP is configured"
  value       = nonsensitive(var.google_client_id != "" && var.google_client_secret != "")
}

# --- Reports Outputs (was infra/reports.yaml) ---

output "reports_bucket_name" {
  description = "S3 bucket holding generated reports"
  value       = aws_s3_bucket.reports.bucket
}

output "report_requests_queue_url" {
  description = "SQS queue URL for weekly report requests"
  value       = aws_sqs_queue.reports.url
}

output "report_requests_dlq_url" {
  description = "SQS dead-letter queue URL"
  value       = aws_sqs_queue.dlq.url
}

output "builder_function_name" {
  description = "Name of the report-builder Lambda function"
  value       = aws_lambda_function.builder.function_name
}

output "mailer_function_name" {
  description = "Name of the report-mailer Lambda function"
  value       = aws_lambda_function.mailer.function_name
}

output "weekly_schedule_name" {
  description = "EventBridge Scheduler schedule name"
  value       = aws_scheduler_schedule.weekly.name
}

# --- AI Outputs (was infra/ai.yml) ---

output "agenda_parser_url" {
  description = "Public Lambda Function URL for AI Agenda Parser"
  value       = aws_lambda_function_url.agenda_parser.function_url
}

output "agenda_parser_function_arn" {
  description = "ARN of the AI Agenda Parser Lambda function"
  value       = aws_lambda_function.agenda_parser.arn
}
