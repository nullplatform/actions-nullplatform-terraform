#!/usr/bin/env node

/**
 * Update README with available GitHub Actions documentation
 * Uses GitHub Models to generate descriptions from workflow files
 */

const fs = require('fs');
const path = require('path');
const { callGitHubModel } = require('./core/github-models');

const WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows');
const README_PATH = path.join(__dirname, '..', '..', 'README.md');
const START_MARKER = '<!-- ACTIONS-START -->';
const END_MARKER = '<!-- ACTIONS-END -->';

/**
 * Parse a YAML workflow file and extract metadata
 */
function parseWorkflowFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // Extract name (first 'name:' at root level)
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim().replace(/['"]/g, '') : fileName;

  // Check if it's a reusable workflow (has workflow_call)
  const isReusable = content.includes('workflow_call');
  if (!isReusable) {
    return null;
  }

  // Extract inputs
  const inputs = [];
  const inputsSection = content.match(/workflow_call:\s*\n\s*inputs:\s*\n([\s\S]*?)(?=\n\s*secrets:|\n\s*jobs:|\n[a-z])/);

  if (inputsSection) {
    const inputsContent = inputsSection[1];
    const inputMatches = inputsContent.matchAll(/^\s{6}(\w+):\s*\n([\s\S]*?)(?=^\s{6}\w+:|\s*$)/gm);

    for (const match of inputMatches) {
      const inputName = match[1];
      const inputBlock = match[2];

      const descMatch = inputBlock.match(/description:\s*['"]?([^'"{\n]+)['"]?/);
      const typeMatch = inputBlock.match(/type:\s*(\w+)/);
      const requiredMatch = inputBlock.match(/required:\s*(true|false)/);
      const defaultMatch = inputBlock.match(/default:\s*['"]?([^'"\n]+)['"]?/);

      inputs.push({
        name: inputName,
        description: descMatch ? descMatch[1].trim() : '',
        type: typeMatch ? typeMatch[1] : 'string',
        required: requiredMatch ? requiredMatch[1] === 'true' : false,
        default: defaultMatch ? defaultMatch[1].trim() : undefined,
      });
    }
  }

  // Extract secrets
  const secrets = [];
  const secretsSection = content.match(/secrets:\s*\n([\s\S]*?)(?=\n\s*jobs:|\n[a-z])/);

  if (secretsSection) {
    const secretsContent = secretsSection[1];
    const secretMatches = secretsContent.matchAll(/^\s{6}(\w+):\s*\n([\s\S]*?)(?=^\s{6}\w+:|\s*$)/gm);

    for (const match of secretMatches) {
      const secretName = match[1];
      const secretBlock = match[2];

      const descMatch = secretBlock.match(/description:\s*['"]?([^'"{\n]+)['"]?/);
      const requiredMatch = secretBlock.match(/required:\s*(true|false)/);

      secrets.push({
        name: secretName,
        description: descMatch ? descMatch[1].trim() : '',
        required: requiredMatch ? requiredMatch[1] === 'true' : false,
      });
    }
  }

  return {
    fileName,
    name,
    content,
    inputs,
    secrets,
  };
}

/**
 * Get all reusable workflows from the workflows directory
 */
function getWorkflows() {
  const files = fs.readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  const workflows = [];

  for (const file of files) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    const workflow = parseWorkflowFile(filePath);
    if (workflow) {
      workflows.push(workflow);
    }
  }

  return workflows;
}

/**
 * Generate documentation using GitHub Models
 */
async function generateDocumentation(workflows) {
  const systemPrompt = `You are a technical documentation writer. Generate clear, concise documentation for GitHub Actions reusable workflows.

Output format must be valid Markdown. Use:
- Tables for inputs/secrets when they exist
- Brief descriptions (1-2 sentences max per workflow)
- Group workflows by category if patterns emerge
- Use code blocks for usage examples

Be concise and professional. No fluff or marketing language.`;

  const workflowSummaries = workflows.map(w => ({
    name: w.name,
    fileName: w.fileName,
    inputs: w.inputs,
    secrets: w.secrets,
    // Include first 100 lines of content for context
    contentPreview: w.content.split('\n').slice(0, 100).join('\n'),
  }));

  const userPrompt = `Generate documentation for these GitHub Actions reusable workflows.

The documentation should:
1. Start with a brief intro paragraph
2. List each workflow with:
   - Name and file reference
   - What it does (1-2 sentences)
   - Usage example showing how to call it
   - Table of inputs (if any) with columns: Name, Description, Required, Default
   - Table of secrets (if any) with columns: Name, Description, Required
3. Group related workflows together (e.g., "Terraform/OpenTofu", "Security", "Docker", "Documentation")

Workflows data:
${JSON.stringify(workflowSummaries, null, 2)}

Generate only the Markdown content, no explanations.`;

  console.log(`Generating documentation for ${workflows.length} workflows...`);

  const documentation = await callGitHubModel(userPrompt, systemPrompt, {
    maxTokens: 8000,
    temperature: 0.2,
  });

  return documentation;
}

/**
 * Update README with generated documentation
 */
function updateReadme(documentation) {
  let readme = fs.readFileSync(README_PATH, 'utf8');

  const startIndex = readme.indexOf(START_MARKER);
  const endIndex = readme.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found in README. Please add:');
    console.error(START_MARKER);
    console.error(END_MARKER);
    process.exit(1);
  }

  const before = readme.substring(0, startIndex + START_MARKER.length);
  const after = readme.substring(endIndex);

  const newReadme = `${before}\n\n${documentation}\n\n${after}`;

  fs.writeFileSync(README_PATH, newReadme);
  console.log('README updated successfully');
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Scanning workflows directory...');
    const workflows = getWorkflows();

    if (workflows.length === 0) {
      console.log('No reusable workflows found');
      return;
    }

    console.log(`Found ${workflows.length} reusable workflows:`);
    workflows.forEach(w => console.log(`  - ${w.name} (${w.fileName})`));

    const documentation = await generateDocumentation(workflows);
    updateReadme(documentation);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
