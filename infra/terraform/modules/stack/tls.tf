# Custom domain + TLS on the shared ALB.
#
# THE WHOLE FILE IS INERT WHEN `domain_name = ""` (the default). That is not
# tidiness — it is what lets prod be provisioned before DNS exists, and lets
# stage cut over on its own schedule. With no domain set, this stack plans and
# applies exactly as it did before TLS existed: the :80 listener keeps its 404
# default and the three services keep their rules on it.
#
# THE HOSTED ZONE IS NOT CREATED HERE, on purpose. `route53_zone_id` is taken as
# a variable because:
#   * a zone Terraform creates for a domain registered elsewhere does NOTHING
#     until someone copies its NS records to the registrar — a step Terraform
#     cannot perform and cannot see, so owning the zone buys no automation;
#   * the zone is shared by stage AND prod and outlives both. `terraform destroy`
#     on stage is a documented, supported operation (infra/terraform/README.md);
#     it must not be able to delete prod's DNS.
# Delegate a SUBDOMAIN (app.krutyug.ai), not the apex, so the existing
# krutyug.ai site is untouched.
#
# The certificate is requested in THIS module's region because it terminates on
# a REGIONAL ALB. That is NOT the CloudFront rule (us-east-1) — media.tf's
# distribution is deliberately untouched and keeps its default certificate.

locals {
  # The single switch.
  wire_domain = var.domain_name != ""

  # Host-based routing. When set, the CMS gets its own hostname and the ALB
  # separates services by Host header instead of by path prefix (services.tf).
  split_host = local.wire_domain && var.admin_domain_name != ""

  # Hostnames answered by the api (and events) — everything except the CMS one.
  app_host_headers = local.split_host ? concat([var.domain_name], var.domain_aliases) : []

  # Every name on the certificate BESIDES the primary. admin_domain_name is
  # folded in here rather than being pushed into domain_aliases by the caller, so
  # the cert/DNS story stays automatic and the alias list keeps its meaning
  # ("more names for the SAME service").
  #
  # This feeds `subject_alternative_names` DIRECTLY. Deriving the SANs from
  # cert_domain_names is what makes the certificate cover the CMS host — omit it
  # and the ALB serves a certificate valid only for the api's name, so every
  # browser hitting the CMS gets ERR_CERT_COMMON_NAME_INVALID with no server-side
  # symptom at all.
  cert_alt_names = local.wire_domain ? concat(
    var.domain_aliases,
    var.admin_domain_name != "" ? [var.admin_domain_name] : [],
  ) : []

  # EVERY name the certificate and the DNS records must cover, primary first.
  cert_domain_names = local.wire_domain ? concat([var.domain_name], local.cert_alt_names) : []

  byo_cert    = var.acm_certificate_arn != ""
  create_cert = local.wire_domain && !local.byo_cert

  # Terraform can write DNS only when it owns the zone...
  manage_dns = local.wire_domain && var.route53_zone_id != ""
  # ...and can therefore validate the certificate it requested, in one apply.
  tf_validates_cert = local.create_cert && local.manage_dns

  # THE COUNT PREDICATE FOR THE 443 LISTENER.
  #
  # Derived from VARIABLES ONLY — never from a certificate attribute. Every
  # certificate ARN here is unknown until apply, and an unknown `count` is a hard
  # plan error, not a warning. This is the single most breakable line in the
  # file; keep it variable-only.
  #
  # The `cert_validated_externally` arm is what makes the registrar-hosted-DNS
  # path safe: Terraform requests the certificate, OUTPUTS the record to publish
  # by hand, and builds no listener until the operator confirms it is ISSUED. It
  # never blocks on DNS it cannot write.
  wire_https = local.wire_domain && (
    local.byo_cert || local.tf_validates_cert || var.cert_validated_externally
  )

  # Read ONLY inside the count=1 branch above. Indexing `foo[0]` under a
  # conditional whose predicate also drives `foo`'s count is the pattern this
  # module already uses (aws_msk_cluster.domain_events[0], the clickhouse
  # secrets).
  listener_certificate_arn = (
    local.byo_cert ? var.acm_certificate_arn :
    local.tf_validates_cert ? aws_acm_certificate_validation.main[0].certificate_arn :
    local.wire_https ? aws_acm_certificate.main[0].arn : ""
  )

  # ############################################################################
  # THE ONE LINE ALL THREE SERVICES DEPEND ON. services.tf hands this to every
  # fargate-service as `alb_listener_arn`: the HTTPS listener the moment one
  # exists, the plain HTTP listener otherwise.
  # ############################################################################
  app_listener_arn = local.wire_https ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn

  # Cleartext compatibility window. When the redirect is deliberately deferred,
  # each service ALSO gets an identical rule on :80 so http:// clients keep
  # working while they migrate (a staging build already on a tester's phone
  # cannot be updated instantly). "" = no second rule.
  http_compat_listener_arn = local.wire_https && !var.redirect_http_to_https ? aws_lb_listener.http.arn : ""

  # The scheme + host clients should use. The raw ALB hostname is only correct
  # while there is no certificate: once one is attached, :80 redirects to an
  # https URL on that SAME hostname, which fails the certificate name check in
  # every client.
  public_base_url = local.wire_https ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

resource "aws_acm_certificate" "main" {
  count = local.create_cert ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = local.cert_alt_names
  validation_method         = "DNS"

  tags = { Name = "${local.name_prefix}-alb" }

  # A certificate in use by a listener cannot be deleted, so any change that
  # replaces it (adding an alias, renaming the domain) must mint the new one
  # first.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  # KEYS COME FROM THE STATIC NAME LIST, NOT FROM domain_validation_options.
  # Iterating the certificate's computed set directly — the pattern in the
  # provider docs and most blog posts — makes the for_each keys UNKNOWN on a
  # first apply and the plan dies with "Invalid for_each argument" before a
  # single resource is created. Keying off the variable-derived names keeps the
  # KEYS known and lets the VALUES be known-after-apply, which is all Terraform
  # actually requires.
  for_each = local.tf_validates_cert ? toset(local.cert_domain_names) : toset([])

  zone_id = var.route53_zone_id
  ttl     = 60

  name    = one([for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.resource_record_name if dvo.domain_name == each.key])
  type    = one([for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.resource_record_type if dvo.domain_name == each.key])
  records = [one([for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.resource_record_value if dvo.domain_name == each.key])]

  # A re-requested certificate reuses the same validation record name; without
  # this, a re-apply after a certificate replacement fails on an existing RRset.
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count = local.tf_validates_cert ? 1 : 0

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]

  # The ONLY resource in this stack that blocks on the outside world. With
  # Route53 owning the zone it settles in 1-5 minutes; the provider default is 45
  # MINUTES, which is 45 minutes of a silent apply when NS delegation is wrong.
  # Fail fast instead — a bad delegation is fix-and-re-apply, and re-applying is
  # cheap because nothing else here has been touched.
  timeouts {
    create = "15m"
  }
}

resource "aws_route53_record" "alb" {
  for_each = local.manage_dns ? toset(local.cert_domain_names) : toset([])

  zone_id = var.route53_zone_id
  name    = each.key
  # A (ALIAS), not CNAME: free to resolve, legal at a zone apex (a CNAME is
  # not), and it follows the ALB's rotating addresses. No AAAA — aws_lb.main
  # sets no ip_address_type, so it is ipv4-only.
  type = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = false
  }
}

resource "aws_lb_listener" "https" {
  count = local.wire_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.alb_ssl_policy
  certificate_arn   = local.listener_certificate_arn

  # Same default as the HTTP listener it takes over from: every service attaches
  # its own path rule (services.tf); unmatched paths 404.
  #
  # No aws_lb_listener_certificate resource — that is only for a SECOND
  # certificate (SNI) on one listener. SANs on the single certificate cover the
  # aliases. It is the extension point if two independent certs are ever needed.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}
