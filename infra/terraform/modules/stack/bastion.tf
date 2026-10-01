# --- Break-glass data-plane access (opt-in; default OFF) -------------------------
# RDS and Redis sit in the private subnets and their SGs admit only the api task
# SG, so a developer laptop has no path to either. This is that path: a minimal
# EC2 host in a private subnet reachable ONLY through SSM Session Manager — no
# public IP, no key pair, no inbound rule of any kind. Sessions are IAM-authorized
# and CloudTrail-logged, which is why this exists instead of a public RDS + IP
# allowlist.
#
# The SSM agent reaches the SSM endpoints outbound via the NAT gateway
# (network.tf), so no VPC endpoints are needed. ~$3/month while enabled; left
# false, nothing here is created.
#
# BOTH ENVS PIN THIS ON — `enable_bastion = true` lives in each env's
# terraform.tfvars, so no -var is needed and, more importantly, `pnpm deploy:infra
# <env>` (which passes no such var) cannot destroy a live bastion behind your back.
# That is not hypothetical: prod ran per-session `-var enable_bastion=true` until a
# routine var-less apply deleted the host on 2026-07-29. A NEW env leaves the
# default false until someone decides otherwise.
#
#   cd infra/terraform/envs/prod   # or envs/stage
#   aws ssm start-session --target "$(terraform output -raw bastion_instance_id)" \
#     --document-name AWS-StartPortForwardingSessionToRemoteHost \
#     --parameters host="$(terraform output -raw rds_address)",portNumber=5432,localPortNumber=5433
#
# Then point psql/TablePlus/Prisma at localhost:5433 with the credentials in the
# app-<env>-database-url secret.
#
# The document forwards ONE remote host per session, so Redis needs a second
# session in its own terminal (redis_host / portNumber=6379). The host itself is
# indifferent — the SG rules in main.tf are what decide what it may reach.

data "aws_ssm_parameter" "bastion_ami" {
  count = var.enable_bastion ? 1 : 0
  # AL2023 ships the SSM agent preinstalled and enabled — nothing to provision.
  # arm64 to match the t4g default instance type.
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "bastion" {
  count       = var.enable_bastion ? 1 : 0
  name_prefix = "${local.name_prefix}-bastion-"
  # ASCII only: the EC2 API rejects a GroupDescription containing anything else
  # (so no em-dash here, unlike the prose comments above).
  description = "SSM bastion: no ingress; egress for the SSM agent + data plane"
  vpc_id      = aws_vpc.main.id

  # Deliberately no ingress block: Session Manager is outbound-only (the agent
  # polls the SSM endpoints), so nothing ever needs to reach this host.

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_iam_policy_document" "bastion_assume" {
  count = var.enable_bastion ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bastion" {
  count              = var.enable_bastion ? 1 : 0
  name_prefix        = "${local.name_prefix}-bastion-"
  assume_role_policy = data.aws_iam_policy_document.bastion_assume[0].json
}

# Exactly what the SSM agent needs to register and serve sessions. Note what is
# NOT attached: no Secrets Manager, no S3, no RDS IAM auth. The host forwards a
# TCP port and knows nothing.
resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  count      = var.enable_bastion ? 1 : 0
  role       = aws_iam_role.bastion[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  count       = var.enable_bastion ? 1 : 0
  name_prefix = "${local.name_prefix}-bastion-"
  role        = aws_iam_role.bastion[0].name
}

resource "aws_instance" "bastion" {
  count                  = var.enable_bastion ? 1 : 0
  ami                    = data.aws_ssm_parameter.bastion_ami[0].value
  instance_type          = var.bastion_instance_type
  subnet_id              = local.private_subnet_ids[0]
  vpc_security_group_ids = [aws_security_group.bastion[0].id]
  iam_instance_profile   = aws_iam_instance_profile.bastion[0].name

  # Private subnet + no key_name: SSM is the only way in, by construction.
  associate_public_ip_address = false

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  root_block_device {
    volume_size = 8
    encrypted   = true
  }

  # The AMI is resolved from the "latest AL2023" SSM parameter above, which AWS
  # moves whenever it publishes a new image. Without this, EVERY untargeted apply
  # proposes REPLACING a healthy bastion — churn that also kills any port-forward
  # session running at the time, and that was tolerable only while the host was
  # ephemeral. Now that both envs keep it standing, pin to whatever AMI it booted
  # on. To take a fresh image deliberately:
  #
  #   terraform apply -replace 'module.stack.aws_instance.bastion[0]'
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "${local.name_prefix}-bastion" }
}
