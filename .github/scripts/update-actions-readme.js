#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { callAI, getProviderInfo } = require('./core/ai-client');

// =============================================================================
// WORKFLOW PROCESSING
// =============================================================================

function getWorkflowFiles(workflowsDir) {
  const files = fs.readdirSync(workflowsDir);
  return files
    .filter(f => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.endsWith('.disabled'))
    .map(f => ({
      name: f,
      path: path.join(workflowsDir, f),
      content: fs.readFileSync(path.join(workflowsDir, f), 'utf-8'),
    }));
}

async function generateActionsDocumentation(workflows) {
  const repoName = process.env.GITHUB_REPOSITORY || 'nullplatform/actions-nullplatform';

  const systemPrompt = `You are a technical documentation expert. Generate clear, well-structured documentation for GitHub Actions reusable workflows.

IMPORTANT RULES:
- Return ONLY markdown content, no wrapping code blocks
- Use the workflow's "name:" field as the display name, not the filename
- Write concise, specific descriptions (avoid generic phrases like "This workflow checks...")
- Group workflows by category
- Use the exact repository path for usage examples: ${repoName}

OUTPUT STRUCTURE:

1. SUMMARY TABLE at the top with columns: Workflow (as link to section), Category, Description (one line)

2. CATEGORY SECTIONS - Group workflows into these categories with icons (use h2 ##):
   - 🔍 CI & Validation (linting, branch validation, commit validation)
   - 🔒 Security (scans, vulnerability checks)
   - 🚀 Build & Deploy (docker, ECR, builds)
   - 📦 Release & Changelog (releases, versioning, changelogs)
   - 📚 Documentation (readme generators, docs)

3. FOR EACH WORKFLOW include:
   - h3 heading (###) with descriptive name
   - One paragraph description explaining WHAT it does and WHEN to use it
   - **Inputs** table (if any): Name | Description | Required | Default
   - **Secrets required** list (analyze the workflow for secrets.* references)
   - **Usage** code block that is READY TO COPY-PASTE:
     * Must include ALL required inputs with realistic example values
     * Include commonly used optional inputs with example values
     * Format: uses: ${repoName}/.github/workflows/FILENAME@main
     * Add "with:" block if there are inputs
     * Add "secrets:" block if there are required secrets (use placeholder like \${{ secrets.SECRET_NAME }})

Example of a good usage block:
\`\`\`yaml
uses: ${repoName}/.github/workflows/docker-build-push-ecr.yml@main
with:
  image_name: my-app
  context: .
  dockerfile: Dockerfile
secrets:
  aws_role_arn: \${{ secrets.AWS_ROLE_ARN }}
\`\`\``;

  const workflowSummaries = workflows.map(w => `
=== ${w.name} ===
${w.content}
`).join('\n');

  const userPrompt = `Generate documentation for these GitHub Actions reusable workflows.

${workflowSummaries}

Remember:
- Only document workflows with "workflow_call" trigger (reusable workflows)
- Skip workflows that are only triggered by push/pull_request/workflow_dispatch without workflow_call
- Extract secrets from "secrets.*" references in the workflow
- Be specific in descriptions, avoid generic filler text`;

  return await callAI(systemPrompt, userPrompt);
}

function updateReadme(readmePath, newContent) {
  const readme = fs.readFileSync(readmePath, 'utf-8');

  const startMarker = '<!-- ACTIONS-START -->';
  const endMarker = '<!-- ACTIONS-END -->';

  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('README markers not found: <!-- ACTIONS-START --> and <!-- ACTIONS-END -->');
  }

  const updatedReadme =
    readme.substring(0, startIndex + startMarker.length) +
    '\n\n' + newContent + '\n\n' +
    readme.substring(endIndex);

  fs.writeFileSync(readmePath, updatedReadme);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const rootDir = process.cwd();
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  const readmePath = path.join(rootDir, 'README.md');

  const { name: providerName, model } = getProviderInfo();

  console.log('📂 Reading workflow files...');
  const workflows = getWorkflowFiles(workflowsDir);
  console.log(`   Found ${workflows.length} workflow files`);

  console.log(`🤖 Generating documentation with ${providerName} (${model})...`);
  const documentation = await generateActionsDocumentation(workflows);

  console.log('📝 Updating README.md...');
  updateReadme(readmePath, documentation);

  console.log('✅ Done!');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
