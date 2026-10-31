# infra/imports.tf
# Used during Part 2 Step 3 to adopt existing CloudFormation resources into Terraform state.
# Run: terraform plan (shows "Plan: X to import, 0 to add, 0 to change, 0 to destroy")
# Then: terraform apply
# After successful migration, this file can be deleted.

# --- 1. Cognito Auth Resources (was spry-auth stack) ---

import {
  to = aws_cognito_user_pool.main
  id = "us-east-1_toxohTSv4"
}

import {
  to = aws_cognito_identity_provider.google[0]
  id = "us-east-1_toxohTSv4/Google"
}

import {
  to = aws_cognito_user_pool_client.web
  id = "us-east-1_toxohTSv4/37j3s1cqci8o6a7396origk93l"
}

import {
  to = aws_cognito_user_pool_domain.main
  id = "spry-auth-132568187649"
}

# --- 2. Weekly Reports Resources (was spry-reports stack) ---

import {
  to = aws_s3_bucket.reports
  id = "spry-reports-132568187649"
}

import {
  to = aws_s3_bucket_public_access_block.reports
  id = "spry-reports-132568187649"
}

import {
  to = aws_sqs_queue.dlq
  id = "https://sqs.us-east-1.amazonaws.com/132568187649/spry-report-requests-dlq"
}

import {
  to = aws_sqs_queue.reports
  id = "https://sqs.us-east-1.amazonaws.com/132568187649/spry-report-requests"
}

import {
  to = aws_iam_role.builder
  id = "spry-report-builder-role"
}

import {
  to = aws_cloudwatch_log_group.builder
  id = "/aws/lambda/spry-report-builder"
}

import {
  to = aws_lambda_function.builder
  id = "spry-report-builder"
}

import {
  to = aws_iam_role.scheduler
  id = "spry-scheduler-sqs-role"
}

import {
  to = aws_scheduler_schedule.weekly
  id = "default/spry-weekly-report-schedule"
}

import {
  to = aws_iam_role.mailer
  id = "spry-report-mailer-role"
}

import {
  to = aws_cloudwatch_log_group.mailer
  id = "/aws/lambda/spry-report-mailer"
}

import {
  to = aws_lambda_function.mailer
  id = "spry-report-mailer"
}

# --- 3. AI Agenda Parser Resources (was spry-ai stack) ---

import {
  to = aws_cloudwatch_log_group.agenda_parser
  id = "/aws/lambda/spry-agenda-parser"
}

import {
  to = aws_iam_role.agenda_parser
  id = "spry-agenda-parser-role"
}

import {
  to = aws_lambda_function.agenda_parser
  id = "spry-agenda-parser"
}

import {
  to = aws_lambda_function_url.agenda_parser
  id = "spry-agenda-parser"
}
