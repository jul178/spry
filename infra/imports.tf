# infra/imports.tf
# Resources retained in AWS to import into Terraform state:
# - The Cognito User Pool (preserves all registered users and passwords)
# - The S3 Reports Bucket & Public Access Block (preserves archived CSV reports)
# - The CloudWatch Log Groups (preserves historical execution logs)
#
# All other stateless resources (roles, queues, lambdas, domain, client)
# are created fresh by Terraform.

import {
  to = aws_cognito_user_pool.main
  id = "us-east-1_toxohTSv4"
}

import {
  to = aws_s3_bucket.reports
  id = "spry-reports-132568187649"
}

import {
  to = aws_s3_bucket_public_access_block.reports
  id = "spry-reports-132568187649"
}

import {
  to = aws_cloudwatch_log_group.builder
  id = "/aws/lambda/spry-report-builder"
}

import {
  to = aws_cloudwatch_log_group.mailer
  id = "/aws/lambda/spry-report-mailer"
}

import {
  to = aws_cloudwatch_log_group.agenda_parser
  id = "/aws/lambda/spry-agenda-parser"
}
