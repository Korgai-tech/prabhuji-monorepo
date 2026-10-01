# Remote state. The bucket is shared by both envs (keys differ) and was created
# out-of-band — a bucket that holds the state cannot be managed by the state it
# holds. It is versioned, SSE-S3 encrypted, fully public-access-blocked, and its
# policy denies non-TLS access. Recover a clobbered state from a prior version:
#
#   aws s3api list-object-versions --bucket prabhuji-tfstate-815756778705 --prefix stage/
#
# Terraform >= 1.10 locks natively via the S3 lockfile — no DynamoDB table.
terraform {
  backend "s3" {
    bucket       = "prabhuji-tfstate-815756778705"
    key          = "stage/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}
