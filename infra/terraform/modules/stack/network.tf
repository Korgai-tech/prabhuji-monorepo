# Dedicated per-environment VPC. Public subnets hold the ALB and the NAT
# gateway; private subnets hold the Fargate tasks and the data plane
# (RDS, Redis, MSK). Tasks have no public IPs — egress (ECR pulls, Secrets
# Manager, Kinesis) leaves via the NAT gateway.

locals {
  name_prefix        = "${var.name}-${var.env}"
  azs                = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  public_subnet_ids  = aws_subnet.public[*].id
  private_subnet_ids = aws_subnet.private[*].id
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  # DNS required so RDS/MSK/ElastiCache endpoints resolve inside the VPC
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name_prefix }
}

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name_prefix}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name_prefix}-private-${local.azs[count.index]}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = local.name_prefix }
}

# One NAT gateway per environment (not per AZ) — a cost/availability trade-off;
# an AZ outage of public[0] takes private-subnet egress down with it.
#
# THIS ADDRESS IS ALLOWLISTED AT DECENTRO. Because there is one NAT gateway per
# environment, this single Elastic IP is the egress address for EVERY outbound
# call the environment makes, and the payment gateway authorises us by it:
#
#   prod   13.200.196.105   eipalloc-00938c5b95e115cac
#   stage  13.200.188.248   eipalloc-05f03fbb8c5e8a4e8
#
# Releasing it means Decentro answers `403 IP address not allowed` on every
# call — mandate registration, pre-debit notification and presentation alike —
# until they allowlist the replacement, which is a support round-trip, not a
# redeploy. The failure has no local cause to find: nothing in this repo
# changed, and the logs show only a 403 from a host that was working an hour
# ago. That is precisely how the first live registration attempt failed
# (prod, 2026-07-30), before the address was registered at all.
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = { Name = "${local.name_prefix}-nat" }

  # An external party's allowlist now depends on this value, so Terraform must
  # stop treating it as disposable. Replacing the NAT GATEWAY is still fine —
  # it reattaches this same `allocation_id` — and so are task rolls, deploys
  # and scaling. What this blocks is destroying the address itself.
  #
  # It also makes `terraform destroy` fail for the whole environment, which is
  # deliberate: tearing down stage is rare and worth a deliberate step, whereas
  # silently losing payments is not. To genuinely retire an environment, delete
  # this block in the same commit that does it, so the decision is reviewable.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]

  tags = { Name = local.name_prefix }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public" }
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-private" }
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
