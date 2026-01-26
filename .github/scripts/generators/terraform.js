/**
 * Terraform/OpenTofu README Generator
 * Generates documentation for Terraform modules
 */

const fs = require('fs');
const path = require('path');
const { readFilesByPattern, extractBetweenMarkers, getNameFromPath, getLatestTag, getRepository } = require('../core/file-utils');

const config = {
  name: 'terraform',
  displayName: 'Terraform/OpenTofu',
  filePatterns: ['*.tf'],
  exclude: ['.terraform'],
};

/**
 * Detect if directory is a Terraform module
 */
function detect(dir) {
  const files = fs.readdirSync(dir);
  return files.some(f => f.endsWith('.tf'));
}

/**
 * Read and prepare context from Terraform files
 */
function prepareContext(dir) {
  const tfFiles = readFilesByPattern(dir, config.filePatterns, { exclude: config.exclude });

  // Extract variable names
  const variables = [];
  const variableRegex = /variable\s+"([^"]+)"/g;

  // Extract output names
  const outputs = [];
  const outputRegex = /output\s+"([^"]+)"/g;

  for (const content of Object.values(tfFiles)) {
    let match;
    while ((match = variableRegex.exec(content)) !== null) {
      variables.push(match[1]);
    }
    while ((match = outputRegex.exec(content)) !== null) {
      outputs.push(match[1]);
    }
  }

  // Format files for prompt
  const filesContext = Object.entries(tfFiles)
    .map(([filename, content]) => `### ${filename}\n\`\`\`hcl\n${content}\n\`\`\``)
    .join('\n\n');

  return {
    files: tfFiles,
    filesContext,
    variables,
    outputs,
    moduleName: getNameFromPath(dir),
    tag: getLatestTag(),
    repository: getRepository(),
  };
}

/**
 * Get the system prompt for AI
 */
function getSystemPrompt() {
  return `You are a technical documentation generator for Terraform modules. You MUST respond with ONLY valid JSON, no markdown, no code blocks, no explanations. Your response must be parseable by JSON.parse().`;
}

/**
 * Get the user prompt for AI
 */
function getUserPrompt(context) {
  return `Analyze this Terraform module and return a JSON object with these exact keys:

{
  "description": "One sentence describing what this module does",
  "features": ["feature 1", "feature 2", "feature 3"]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb (Creates, Configures, Supports, etc.)
- Only include features that exist in the actual code
- Be concise and professional

Terraform files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { moduleName, variables, outputs, tag, repository } = context;

  // Build module source URL
  const modulePath = dir.replace(/^\.\//, '');
  const moduleSource = `git::https://github.com/${repository}.git//${modulePath}?ref=${tag}`;

  // Build variables block
  let variablesBlock = '';
  if (variables.length > 0) {
    const maxVarLength = Math.max(...variables.map(v => v.length));
    variablesBlock = '\n' + variables.map(v => `  ${v.padEnd(maxVarLength)} = var.${v}`).join('\n') + '\n';
  }

  const firstOutput = outputs[0] || 'id';

  // Preserve existing terraform-docs section if present
  const readmePath = path.join(dir, 'README.md');
  let tfDocsSection = '<!-- BEGIN_TF_DOCS -->\n<!-- END_TF_DOCS -->';

  if (fs.existsSync(readmePath)) {
    const existingContent = fs.readFileSync(readmePath, 'utf-8');
    tfDocsSection = extractBetweenMarkers(
      existingContent,
      '<!-- BEGIN_TF_DOCS -->',
      '<!-- END_TF_DOCS -->'
    );
  }

  return `# Module: ${moduleName}

## Description

${parsed.description}

## Features

${parsed.features.map(f => `- ${f}`).join('\n')}

## Usage

\`\`\`hcl
module "${moduleName}" {
  source = "${moduleSource}"
${variablesBlock}}
\`\`\`

## Using Outputs

\`\`\`hcl
# Reference outputs in other resources
resource "example_resource" "this" {
  example_attribute = module.${moduleName}.${firstOutput}
}
\`\`\`

${tfDocsSection}
`;
}

module.exports = {
  config,
  detect,
  prepareContext,
  getSystemPrompt,
  getUserPrompt,
  generateReadme,
};
