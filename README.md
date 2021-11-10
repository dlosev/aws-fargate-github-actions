# AWS Fargate + AWS CDK + GitHub Actions

This project implements the following functionality for the one of my customers:

1. When new PR is created, the [pipeline](.github/workflows/deploy-pipeline.yaml) does the following:
   * Builds Docker image and deploy it to AWS ECR; 
   * Deploys AWS Fargate (ECS) stack with AWS CDK;
   * Assigns the PR a label with AWS Cloudformation stack ID

2. When a PR is closed, the [pipeline](.github/workflows/delete-pipeline.yaml) does the following:
   * Deletes AWS Cloudformation stack by ID taken from PR's label;
   * Removes a label containing the stack's ID
