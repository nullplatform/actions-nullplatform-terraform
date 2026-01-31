<h2 align="center">
    <a href="https://httpie.io" target="blank_">
        <img height="100" alt="nullplatform" src="https://nullplatform.com/favicon/android-chrome-192x192.png" />
    </a>
    <br>
    <br>
     Nullplatform Github action for Terraform/Tofu
    <br>
</h2>




# About 


## .github Directory

Reusable GitHub Actions workflows that support OpenTofu/Terraform module automation live here. Each workflow is designed to be called from other pipelines via `workflow_call`.

## Available Workflows

<!-- ACTIONS-START -->

# Summary Table
| Workflow | Category | Description |
| --- | --- | --- |
| [branch-validation](#branch-validation) | 🔍 CI & Validation | Validates branch names against a regex pattern |
| [changelog-release](#changelog-and-release) | 📦 Release & Changelog | Generates changelog and creates a GitHub Release |
| [conventional-commit](#conventional-commit) | 🔍 CI & Validation | Validates commits against conventional commit rules |
| [docker-build-push-ecr](#docker-build-and-push-to-ecr) | 🚀 Build & Deploy | Builds and pushes a Docker image to ECR |
| [docker-security-scan](#docker-security-scan) | 🔒 Security | Scans a Docker image for vulnerabilities |
| [ecr-security-scan](#ecr-security-scan) | 🔒 Security | Scans ECR images for vulnerabilities |
| [pre-release](#tofu-pre-release) | 📦 Release & Changelog | Posts a changelog preview comment |
| [readme-ai-v2](#readme-ai-generator-v2) | 📚 Documentation | Generates README files using AI |
| [release](#tofu-release) | 📦 Release & Changelog | Creates a GitHub Release |
| [tf-docs](#tofu-docs) | 📚 Documentation | Generates Terraform documentation |
| [tfsec](#tfsec-security-scan) | 🔒 Security | Scans Terraform code for security issues |
| [tofu-lint](#tofu-lint) | 🔍 CI & Validation | Lints Tofu code |
| [tofu-test](#tofu-test) | 🔍 CI & Validation | Tests Tofu modules |
| [update-readme-actions](#update-readme-actions) | 📚 Documentation | Updates the README with available actions |

## 🔍 CI & Validation
### branch-validation
Validates branch names against a regex pattern. Use this workflow to enforce consistent branch naming conventions.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| pattern | Regex pattern for branch name validation | false | `^(feat|feature|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/.+$` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/branch-validation.yml@main
with:
  pattern: '^(feat|feature|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/.+$'
```

### conventional-commit
Validates commits against conventional commit rules. Use this workflow to enforce consistent commit messages.

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/conventional-commit.yml@main
```

### tofu-lint
Lints Tofu code. Use this workflow to enforce consistent code formatting and style.

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/tofu-lint.yml@main
```

### tofu-test
Tests Tofu modules. Use this workflow to ensure that your Tofu code is working as expected.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| modules | JSON array of module paths to test | true |  |
| tofu_version | OpenTofu version to use | false | `1.10.6` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/tofu-test.yml@main
with:
  modules: '["module/a", "module/b"]'
  tofu_version: '1.10.6'
```

## 🔒 Security
### docker-security-scan
Scans a Docker image for vulnerabilities. Use this workflow to ensure that your Docker images are secure.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| context | Build context directory | true |  |
| dockerfile | Path to Dockerfile relative to context | false | `Dockerfile` |
| image_name | Name for the scanned image | true |  |
| severity | Minimum severity to report | false | `CRITICAL,HIGH` |
| exit_code | Exit code when vulnerabilities are found | false | `1` |
| upload_sarif | Upload SARIF results to GitHub Security tab | false | `true` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/docker-security-scan.yml@main
with:
  context: .
  dockerfile: Dockerfile
  image_name: my-app
  severity: CRITICAL,HIGH
  exit_code: 1
  upload_sarif: true
```

### ecr-security-scan
Scans ECR images for vulnerabilities. Use this workflow to ensure that your ECR images are secure.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| image_names | JSON array of image names to scan | true |  |
| ecr_registry | ECR registry URL | false | `public.ecr.aws/nullplatform` |
| severity | Minimum severity to report | false | `CRITICAL,HIGH` |
| aws_region | AWS region for ECR | false | `us-east-1` |

**Secrets required**

* `aws_role_arn`
* `slack_webhook_url`

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/ecr-security-scan.yml@main
with:
  image_names: '["k8s-logs-controller", "k8s-traffic-manager"]'
  ecr_registry: public.ecr.aws/nullplatform
  severity: CRITICAL,HIGH
  aws_region: us-east-1
secrets:
  aws_role_arn: ${{ secrets.AWS_ROLE_ARN }}
  slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### tfsec
Scans Terraform code for security issues. Use this workflow to ensure that your Terraform code is secure.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| minimum_severity | Minimum severity level to report | false | `HIGH` |
| upload_sarif | Upload SARIF results to GitHub Security tab | false | `true` |
| post_comment | Post comment on PR if scan fails | false | `true` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/tfsec.yml@main
with:
  minimum_severity: HIGH
  upload_sarif: true
  post_comment: true
```

## 🚀 Build & Deploy
### docker-build-push-ecr
Builds and pushes a Docker image to ECR. Use this workflow to build and deploy your Docker images.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| image_name | Name of the Docker image | true |  |
| context | Build context directory | true |  |
| dockerfile | Path to Dockerfile relative to context | false | `Dockerfile` |
| platforms | Target platforms for multi-arch build | false | `linux/amd64,linux/arm64` |
| ecr_registry | ECR registry URL | false | `public.ecr.aws/nullplatform` |
| tag | Additional tag for the image | false |  |
| aws_region | AWS region for ECR | false | `us-east-1` |

**Secrets required**

* `aws_role_arn`

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/docker-build-push-ecr.yml@main
with:
  image_name: my-app
  context: .
  dockerfile: Dockerfile
  platforms: linux/amd64,linux/arm64
  ecr_registry: public.ecr.aws/nullplatform
  tag: latest
  aws_region: us-east-1
secrets:
  aws_role_arn: ${{ secrets.AWS_ROLE_ARN }}
```

## 📦 Release & Changelog
### changelog-release
Generates changelog and creates a GitHub Release. Use this workflow to automate your release process.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| project-type | Type of project | false | `generic` |
| source-dir | Directory containing packages/charts | false | `.` |
| version-file | Version file name | false |  |
| tag-prefix | Prefix for git tags | false |  |
| create-github-release | Create a GitHub Release | false | `true` |
| commit-message | Commit message for version bump | false | `chore(release): bump version and update changelog [skip ci]` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/changelog-release.yml@main
with:
  project-type: generic
  source-dir: .
  version-file: Chart.yaml
  tag-prefix: v
  create-github-release: true
  commit-message: chore(release): bump version and update changelog [skip ci]
```

### pre-release
Posts a changelog preview comment. Use this workflow to automate your pre-release process.

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/pre-release.yml@main
```

### release
Creates a GitHub Release. Use this workflow to automate your release process.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| update_readme_versions | Update version references in README files after release | false | `true` |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/release.yml@main
with:
  update_readme_versions: true
```

## 📚 Documentation
### readme-ai-v2
Generates README files using AI. Use this workflow to automate your documentation process.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| base_dir | Base directory to search for projects | false | `.` |
| generator_type | Force generator type | false |  |
| generate_all | Generate README for all projects | false | `false` |
| file_patterns | File patterns to detect changes | false | `*.tf *.ts *.tsx *.js *.jsx *.py` |
| ai_model | AI model to use for generation | false | `gpt-4o` |
| run_post_generation | Commands to run after generation | false |  |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/readme-ai-v2.yml@main
with:
  base_dir: .
  generator_type: terraform
  generate_all: false
  file_patterns: *.tf
  ai_model: gpt-4o
  run_post_generation: terraform-docs
```

### tf-docs
Generates Terraform documentation. Use this workflow to automate your documentation process.

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/tf-docs.yml@main
```

### update-readme-actions
Updates the README with available actions. Use this workflow to automate your documentation process.

**Inputs**

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| ai_provider | AI provider to use | false | `groq` |
| ai_model | AI model to use | false |  |

**Usage**
```yml
uses: nullplatform/actions-nullplatform/.github/workflows/update-readme-actions.yml@main
with:
  ai_provider: groq
  ai_model: gpt-4o
```

<!-- ACTIONS-END -->

## Notes

### AI-Powered Documentation

This README is automatically generated using AI. The `update-readme-actions` workflow reads all workflow files and generates documentation using your configured AI provider.

#### Supported Providers

| Provider | Secret for API Key | Default Model |
|----------|-------------------|---------------|
| `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| `github` | `GITHUB_TOKEN` | `gpt-4o` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |

#### Configuration

To configure the AI provider, add these secrets in **Settings → Secrets and variables → Actions**:

1. `AI_PROVIDER` - Provider to use: `groq`, `github`, `openai`, or `anthropic`
2. `AI_MODEL` - (Optional) Specific model to use
3. The API key secret for your chosen provider (e.g., `GROQ_API_KEY`)

**Example for Groq:**
```
AI_PROVIDER = groq
GROQ_API_KEY = gsk_xxx...
```

**Example for Anthropic Claude:**
```
AI_PROVIDER = anthropic
ANTHROPIC_API_KEY = sk-ant-xxx...
```

#### Running Locally

```bash
AI_PROVIDER=groq GROQ_API_KEY=xxx node .github/scripts/update-actions-readme.js
```

---

## Contributions

If you want to add or modify a module:

1. Create a `feature/` or `fix/` branch.
2. Add tests or validations if applicable.
3. Update or generate documentation for the affected module.
4. Open a Pull Request for review.

---
