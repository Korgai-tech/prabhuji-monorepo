# ClickPipe reader — the cross-account IAM role ClickHouse Cloud assumes to
# read this env's Kinesis click-events stream (analytics pipe, TAM-16).
# Opt-in: the trusted principal + external id come from the ClickPipe setup
# screen in the ClickHouse Cloud console, so this is applied AFTER starting the
# wizard there (runbook: docs/ANALYTICS-WAREHOUSE.md). The pipe itself is
# created manually in the console, pointed at the role ARN output.
# Variables live in variables.tf, the ARN output in outputs.tf (module convention).

resource "aws_iam_role" "clickpipe_reader" {
  count = var.enable_clickpipe && var.enable_kinesis ? 1 : 0
  name  = "${local.name_prefix}-clickpipe-reader"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { AWS = var.clickpipe_trusted_principal_arn }
      Condition = var.clickpipe_external_id != "" ? {
        StringEquals = { "sts:ExternalId" = var.clickpipe_external_id }
      } : {}
    }]
  })
}

# Least-privilege read on ONLY this env's stream (mirrors the events task's
# own-stream-only PutRecords policy in services.tf). The consumer/* resource
# covers enhanced fan-out (SubscribeToShard registers a stream consumer).
resource "aws_iam_role_policy" "clickpipe_reader" {
  count = var.enable_clickpipe && var.enable_kinesis ? 1 : 0
  name  = "kinesis-read-events-stream"
  role  = aws_iam_role.clickpipe_reader[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:RegisterStreamConsumer",
          "kinesis:DeregisterStreamConsumer",
          "kinesis:DescribeStreamConsumer",
          "kinesis:ListStreamConsumers",
          "kinesis:SubscribeToShard",
        ]
        Resource = [
          aws_kinesis_stream.events[0].arn,
          "${aws_kinesis_stream.events[0].arn}/*",
        ]
      },
      {
        # stream discovery for the console wizard's dropdown (names only)
        Effect   = "Allow"
        Action   = ["kinesis:ListStreams"]
        Resource = "*"
      },
    ]
  })
}
