terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # data.archive_file — zips the media-optimizer bundle (media-optimizer.tf).
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
