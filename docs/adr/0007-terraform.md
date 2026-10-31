# ADR 0007: Migrating Infrastructure from CloudFormation to Terraform

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

In Labs 4, 5, and 6, Spry added three CloudFormation templates:
- `infra/auth.yaml`: Amazon Cognito User Pool with email/password, Google OAuth federation, and Managed Login v2.
- `infra/reports.yaml`: Weekly reports pipeline (EventBridge Scheduler, SQS with DLQ, VPC-based builder Lambda, S3 bucket with notifications, and SES mailer Lambda).
- `infra/ai.yml`: Stateless AI agenda parser Lambda running Claude on Amazon Bedrock with Function URL.

While functional, CloudFormation templates presented structural limitations:
1. **Single-provider scope:** CloudFormation is confined strictly to AWS. Spry already spans across services (Google OAuth credentials, GitHub repository and Actions OIDC, external DNS).
2. **State and Preview limitations:** CloudFormation change sets are clumsy compared to Terraform's speculative plans, and drift detection is an on-demand check rather than a first-class comparison during every plan.
3. **Rigid Resource Lifecycle:** CloudFormation suffered from circular dependency workarounds (e.g., explicit S3 bucket naming required for Lambda permission and notification coupling in Lab 5).
4. **Environment replication:** Parameterizing and maintaining identical dev, stage, and prod environments across stacks is more cumbersome than Terraform's workspace and variable-driven configuration.

## Decision

Migrate Spry's supplementary infrastructure (Cognito authentication, weekly reports pipeline, and AI agenda parser) to **Terraform** managed via **HCP Terraform** (Terraform Cloud) in remote execution mode:
- Infrastructure code lives in `infra/` (`versions.tf`, `variables.tf`, `auth.tf`, `reports.tf`, `ai.tf`, `outputs.tf`, `terraform.tfvars`).
- Existing AWS resources are adopted non-destructively using CloudFormation `DeletionPolicy: Retain` followed by Terraform `import` blocks.
- The state is centrally stored, encrypted, and locked in an HCP Terraform workspace (`spry-dev`).
- Authentication between HCP Terraform and AWS uses dynamic short-lived OIDC tokens via IAM role `hcp-terraform-ooad-jul178`, eliminating static AWS access keys.

## Answers to Architectural Questions

### 1. Why Terraform and not CloudFormation, CDK, or OpenTofu?
- **CloudFormation** stops at the boundary of a single AWS account. It cannot orchestrate Google OAuth credentials, GitHub repository branch rules, or third-party DNS in the same plan.
- **AWS CDK** requires maintaining TypeScript/Python application code that synthesizes into CloudFormation templates, retaining CloudFormation's underlying deployment limitations, stack boundaries, and slow rollback cycles.
- **OpenTofu** is an excellent open-source alternative with compatible HCL syntax. However, HCP Terraform provides an integrated free-tier managed execution backend with native GitHub VCS integration, pull-request speculative plan checks, state locking, and frictionless OIDC dynamic credentials without running self-hosted runners or state-locking infrastructure.
- **Terraform** offers declarative HCL, multi-provider support (AWS, Google, GitHub, etc.), clear speculative plan previews (`+`, `~`, `-`, `-+`), granular resource lifecycles (eliminating the Lab 5 circular dependency), and first-class drift detection.

### 2. Who can change the infrastructure now, and how?
- **Nobody changes infrastructure from a personal laptop.** `terraform apply` is disabled in local Makefiles and developer scripts.
- Changes follow a controlled **GitOps workflow**:
  1. An engineer (or AI agent) drafts changes in a feature branch and opens a pull request on GitHub.
  2. HCP Terraform automatically triggers a **speculative plan** run and posts the plan summary directly as a commit check on GitHub for team review.
  3. Once approved and merged into `main`, HCP Terraform executes the `apply` using dynamic AWS credentials obtained via OIDC.
- The application deployment pipeline (GitHub Actions for backend/frontend) and the infrastructure deployment pipeline (HCP Terraform) remain distinct, audited, and traceable to commits.

### 3. Where do the secrets end up, the state included?
- **Input Secrets:** Sensitive variables (such as `google_client_secret` and Aurora `database_url`) are marked with `sensitive = true` in `variables.tf`. They are stored strictly in HCP Terraform's workspace settings (encrypted with Vault/AWS KMS). They are never committed to Git, never placed in `terraform.tfvars`, and masked in plan logs.
- **Terraform State:** The state file (`terraform.tfstate`) resides remotely in HCP Terraform's encrypted backend. It is never stored on developer laptops, never committed to Git (enforced by `.gitignore`), and access is governed by HCP Terraform team permissions.

### 4. What happens if HCP Terraform is down?
- **Existing infrastructure continues running uninterrupted.** The AWS cloud resources (Cognito, Aurora, Lambdas, S3, SQS) are independent of the management tool; an HCP Terraform outage causes zero downtime for the Spry application.
- **Infrastructure updates are paused:** Pull-request plan checks and merge applies will wait until the service is restored.
- **Emergency Break-Glass:** If an urgent infrastructure change is needed while HCP Terraform is down, an authorized engineer with temporary emergency AWS credentials can temporarily configure local state execution or import the latest state snapshot to apply emergency fixes, reconciling with HCP Terraform once restored.

## Consequences

- **Positive:**
  - Zero downtime migration with all user accounts, reports, and AI endpoints preserved.
  - Full visibility into planned infrastructure changes prior to merging.
  - Automatic drift detection on every plan.
  - Decoupled S3 notifications and Lambda permissions, cleanly eliminating Lab 5's circular dependency.
  - Zero static AWS keys in HCP Terraform or Git.
- **Trade-offs:**
  - Terraform state contains full metadata of created resources; securing access to HCP Terraform workspace is essential.
  - If a change touches both Lambda code and new infrastructure (e.g., an IAM permission or environment variable), infrastructure changes in HCP Terraform must be merged and applied before the application deployment workflow runs.
