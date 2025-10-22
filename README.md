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

## Workflows

### tofu-pre-release (`workflows/pre-release.yml`)
- Prepares pull requests for release by fetching tags, setting up Node.js 20, and running `semantic-release-github-pr`.
- Works around the action's PR limitations by checking out the PR branch manually and disabling `GITHUB_ACTIONS` before invoking the tool.

### tofu-release (`workflows/release.yml`)
- Delegates tagging and GitHub release notes to `googleapis/release-please-action` using the `terraform-module` release type.
- Intended to be triggered after a successful pre-release stage to produce official releases.

### tofu-docs (`workflows/tf-docs.yml`)
- Generates or updates module documentation using `terraform-docs`, injecting content into READMEs via markers.
- Handles both pull request and push contexts, only pushing documentation changes on non-PR events.

### tofu-lint (`workflows/tofu-lint.yml`)
- Provides reusable infrastructure linting with OpenTofu v1.10.5.
- Runs `tofu init`, `tofu fmt -check`, and `tofu validate -no-color` to ensure formatting and configuration soundness.

## Using These Workflows

Reference them from another workflow with:

```yaml
jobs:
  lint:
    uses: ./.github/workflows/tofu-lint.yml
```

## Contributions

If you want to add or modify a module:

1. Create a `feature/` or `fix/` branch.
2. Add tests or validations if applicable.
3. Update or generate documentation for the affected module.
4. Open a Pull Request for review.

---
