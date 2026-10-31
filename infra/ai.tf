# Spry AI Agenda Parser (replaces infra/ai.yml)
# Stateless Lambda function running outside the VPC, invoking Claude on Amazon Bedrock.

locals {
  ai_image_uri = var.ai_image_uri != "" ? var.ai_image_uri : data.aws_cloudformation_stack.backend.parameters["ImageUri"]
}

resource "aws_cloudwatch_log_group" "agenda_parser" {
  name              = "/aws/lambda/${var.project_name}-agenda-parser"
  retention_in_days = var.log_retention_days

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role" "agenda_parser" {
  name = "${var.project_name}-agenda-parser-role"

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

resource "aws_iam_role_policy_attachment" "agenda_parser_basic" {
  role       = aws_iam_role.agenda_parser.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "agenda_parser_bedrock" {
  name = "BedrockAccess"
  role = aws_iam_role.agenda_parser.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "agenda_parser" {
  function_name = "${var.project_name}-agenda-parser"
  description   = "Spry AI Agenda Parser using Claude on Amazon Bedrock"
  package_type  = "Image"
  image_uri     = local.ai_image_uri

  image_config {
    command = ["app.ai.agenda_lambda.handler"]
  }

  role          = aws_iam_role.agenda_parser.arn
  timeout       = 30
  memory_size   = 512
  architectures = [var.architecture]

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.agenda_parser.name
  }

  environment {
    variables = {
      PROJECT_NAME         = var.project_name
      PARSER_MODEL         = var.parser_model
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.web.id
      COGNITO_REGION       = var.aws_region
      CORS_ORIGINS         = var.cors_origins
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_function_url" "agenda_parser" {
  function_name      = aws_lambda_function.agenda_parser.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 300
  }
}

resource "aws_lambda_permission" "agenda_parser_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.agenda_parser.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
