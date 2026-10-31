# Spry weekly meetings report architecture (replaces infra/reports.yaml):
# - EventBridge Scheduler triggered on Monday morning (Europe/Kyiv)
# - SQS queue (with dead-letter queue) buffer and backpressure
# - VPC-based Lambda report-builder querying Aurora and uploading CSV to S3 via VPC gateway endpoint
# - S3 ObjectCreated notification triggering non-VPC Lambda report-mailer
# - Report mailer sending raw email with CSV attachment via Amazon SES

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Read existing backend stack parameters if overrides are not directly provided
data "aws_cloudformation_stack" "backend" {
  name = var.backend_stack_name
}

data "aws_security_group" "backend_function" {
  count = var.security_group_id == "" ? 1 : 0
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-backend-function"]
  }
}

data "aws_secretsmanager_secret_version" "db_url" {
  count     = var.database_url == "" ? 1 : 0
  secret_id = data.aws_cloudformation_stack.backend.outputs["DatabaseUrlSecretArn"]
}

locals {
  vpc_id = var.vpc_id != "" ? var.vpc_id : data.aws_cloudformation_stack.backend.parameters["VpcId"]
  subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : split(",", data.aws_cloudformation_stack.backend.parameters["SubnetIds"])
  security_group_id = var.security_group_id != "" ? var.security_group_id : data.aws_security_group.backend_function[0].id
  database_url = var.database_url != "" ? var.database_url : data.aws_secretsmanager_secret_version.db_url[0].secret_string
  builder_image_uri = var.builder_image_uri != "" ? var.builder_image_uri : data.aws_cloudformation_stack.backend.parameters["ImageUri"]
}

data "aws_route_tables" "vpc_routes" {
  count = length(var.route_table_ids) == 0 ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }
}

locals {
  route_table_ids = length(var.route_table_ids) > 0 ? var.route_table_ids : data.aws_route_tables.vpc_routes[0].ids
}

# --- VPC Gateway Endpoint for S3 ---
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = local.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = local.route_table_ids

  tags = {
    Name         = "${var.project_name}-s3-gateway-endpoint"
    PROJECT_NAME = var.project_name
  }
}

# --- S3 Reports Bucket ---
resource "aws_s3_bucket" "reports" {
  bucket = "${var.project_name}-reports-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name         = "${var.project_name}-reports"
    PROJECT_NAME = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "DeleteReportsAfter90Days"
    status = "Enabled"

    filter {
      prefix = "reports/"
    }

    expiration {
      days = 90
    }
  }
}

# --- SQS Queues ---
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-report-requests-dlq"
  message_retention_seconds = 1209600

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_sqs_queue" "reports" {
  name                       = "${var.project_name}-report-requests"
  visibility_timeout_seconds = 360

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

# --- Builder Function (in VPC) ---
resource "aws_iam_role" "builder" {
  name = "${var.project_name}-report-builder-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "builder_vpc" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "builder_s3_sqs" {
  name = "S3AndSqsAccess"
  role = aws_iam_role.builder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.reports.arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/aws/lambda/${var.project_name}-report-builder"
  retention_in_days = var.log_retention_days

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_function" "builder" {
  function_name = "${var.project_name}-report-builder"
  description   = "${var.project_name} report builder: queries Aurora, outputs CSV to S3"
  package_type  = "Image"
  image_uri     = local.builder_image_uri

  image_config {
    command = ["app.reports.lambda_handler.handler"]
  }

  architectures = [var.architecture]
  memory_size   = 512
  timeout       = 60
  role          = aws_iam_role.builder.arn

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.builder.name
  }

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [local.security_group_id]
  }

  environment {
    variables = {
      REPORTS_BUCKET = aws_s3_bucket.reports.bucket
      DATABASE_URL   = local.database_url
      DB_POOLING     = "false"
      APP_ENV        = "production"
      LOG_LEVEL      = "info"
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_event_source_mapping" "builder_sqs" {
  event_source_arn = aws_sqs_queue.reports.arn
  function_name    = aws_lambda_function.builder.arn
  batch_size       = 1
  enabled          = true
}

# --- EventBridge Scheduler ---
resource "aws_iam_role" "scheduler" {
  name = "${var.project_name}-scheduler-sqs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "scheduler.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy" "scheduler_send" {
  name = "SendToReportQueue"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.reports.arn
    }]
  })
}

resource "aws_scheduler_schedule" "weekly" {
  name                       = "${var.project_name}-weekly-report-schedule"
  description                = "Triggers the weekly report build every Monday at 07:00 Kyiv time"
  schedule_expression        = "cron(0 7 ? * MON *)"
  schedule_expression_timezone = "Europe/Kyiv"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.reports.arn
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      week   = null
      source = "schedule"
    })
  }
}

# --- Mailer Function (outside VPC) ---
resource "aws_iam_role" "mailer" {
  name = "${var.project_name}-report-mailer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "mailer_basic" {
  role       = aws_iam_role.mailer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "mailer_s3_ses" {
  name = "S3AndSesAccess"
  role = aws_iam_role.mailer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "s3:GetObject"
        Resource = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}/reports/*"
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "mailer" {
  name              = "/aws/lambda/${var.project_name}-report-mailer"
  retention_in_days = var.log_retention_days

  tags = {
    PROJECT_NAME = var.project_name
  }
}

data "archive_file" "mailer" {
  type        = "zip"
  source_file = "${path.module}/mailer.py"
  output_path = "${path.module}/mailer.zip"
}

resource "aws_lambda_function" "mailer" {
  function_name    = "${var.project_name}-report-mailer"
  description      = "${var.project_name} report mailer: downloads CSV from S3, emails via SES"
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.mailer.arn
  timeout          = 60
  memory_size      = 256
  filename         = data.archive_file.mailer.output_path
  source_code_hash = data.archive_file.mailer.output_base64sha256

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.mailer.name
  }

  environment {
    variables = {
      SENDER_EMAIL    = var.sender_email
      RECIPIENT_EMAIL = var.recipient_email
      LOG_LEVEL       = "info"
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_permission" "s3_mailer" {
  statement_id   = "AllowS3InvokeMailer"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.mailer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.reports.arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_s3_bucket_notification" "reports" {
  bucket = aws_s3_bucket.reports.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "reports/"
    filter_suffix       = ".csv"
  }

  depends_on = [
    aws_lambda_permission.s3_mailer
  ]
}

# Optional SES Identity
resource "aws_ses_email_identity" "recipient" {
  count = var.create_email_identity ? 1 : 0
  email = var.recipient_email
}
