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
 * Parse a single variable block and extract its properties
 */
function parseVariableBlock(content, startIndex) {
  let braceCount = 0;
  let inBlock = false;
  let blockContent = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (char === '{') {
      braceCount++;
      inBlock = true;
    }
    if (char === '}') {
      braceCount--;
    }

    if (inBlock) {
      blockContent += char;
    }

    if (inBlock && braceCount === 0) {
      break;
    }
  }

  return blockContent;
}

/**
 * Extract variables with their properties from Terraform content
 */
function extractVariables(content) {
  const variables = [];
  const variableRegex = /variable\s+"([^"]+)"\s*\{/g;

  let match;
  while ((match = variableRegex.exec(content)) !== null) {
    const name = match[1];
    const blockContent = parseVariableBlock(content, match.index + match[0].length - 1);

    // Check if has default
    const hasDefault = /\bdefault\s*=/.test(blockContent);

    // Extract validation block if present
    const validationMatch = blockContent.match(/validation\s*\{[\s\S]*?condition\s*=\s*([\s\S]*?)(?:\n\s*error_message)/);
    const validation = validationMatch ? {
      condition: validationMatch[1].trim(),
      fullBlock: blockContent.match(/validation\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
    } : null;

    // Extract description
    const descMatch = blockContent.match(/description\s*=\s*"([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';

    variables.push({
      name,
      hasDefault,
      validation,
      description,
    });
  }

  return variables;
}

/**
 * Read and prepare context from Terraform files
 */
function prepareContext(dir) {
  const tfFiles = readFilesByPattern(dir, config.filePatterns, { exclude: config.exclude });

  // Extract detailed variable info
  const variables = [];
  const outputs = [];
  const outputRegex = /output\s+"([^"]+)"/g;

  for (const content of Object.values(tfFiles)) {
    // Extract variables with full details
    variables.push(...extractVariables(content));

    // Extract output names
    let match;
    while ((match = outputRegex.exec(content)) !== null) {
      outputs.push(match[1]);
    }
  }

  // Separate variables by type
  const requiredVars = variables.filter(v => !v.hasDefault);
  const conditionalVars = variables.filter(v => v.hasDefault && v.validation);
  const optionalVars = variables.filter(v => v.hasDefault && !v.validation);

  // Format files for prompt
  const filesContext = Object.entries(tfFiles)
    .map(([filename, content]) => `### ${filename}\n\`\`\`hcl\n${content}\n\`\`\``)
    .join('\n\n');

  return {
    files: tfFiles,
    filesContext,
    variables,
    requiredVars,
    conditionalVars,
    optionalVars,
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
  const { requiredVars, conditionalVars } = context;

  // Build info about variables for the AI
  const requiredVarNames = requiredVars.map(v => v.name);
  const conditionalVarInfo = conditionalVars.map(v => ({
    name: v.name,
    condition: v.validation?.condition || '',
    description: v.description,
  }));

  return `Analyze this Terraform module and return a JSON object.

VARIABLE ANALYSIS:
- Required variables (no default): ${JSON.stringify(requiredVarNames)}
- Variables with conditional validations: ${JSON.stringify(conditionalVarInfo, null, 2)}

TASK:
1. Analyze the module to generate description and features
2. For variables with validations, group them by their trigger condition (e.g., all gitlab_* vars are required when git_provider="gitlab")
3. Generate usage sections for each group

Return this exact JSON structure:
{
  "description": "One sentence describing what this module does",
  "features": ["feature 1", "feature 2", "feature 3"],
  "conditionalUsage": [
    {
      "name": "GitHub",
      "condition": "git_provider = \\"github\\"",
      "variables": ["github_organization", "github_installation_id"]
    }
  ]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb (Creates, Configures, Supports, etc.)
- conditionalUsage: Array of usage groups. Each group has:
  - name: Human-readable name for the condition (e.g., "GitHub", "Backups Enabled")
  - condition: The HCL condition to show in comments (e.g., "git_provider = \\"github\\"")
  - variables: Array of variable names that are required for this condition
- If there are no conditional validations, return empty array for conditionalUsage
- Group variables logically by their trigger condition

Terraform files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { moduleName, requiredVars, outputs, tag, repository } = context;

  // Build module source URL - use relative path from repo root
  // Handle both absolute paths (/Users/.../infrastructure/aws/s3) and relative paths (infrastructure/aws/s3)
  let modulePath = dir.replace(/^\.\//, '');
  // If it's an absolute path, extract from 'infrastructure/' onwards
  const infraMatch = modulePath.match(/(?:^|\/)(infrastructure\/.*)$/);
  if (infraMatch) {
    modulePath = infraMatch[1];
  }
  const moduleSource = `git::https://github.com/${repository}.git//${modulePath}?ref=${tag}`;

  // Build Basic Usage with only required variables
  let basicUsageBlock = '';
  if (requiredVars.length > 0) {
    const maxVarLength = Math.max(...requiredVars.map(v => v.name.length));
    basicUsageBlock = '\n' + requiredVars.map(v =>
      `  ${v.name.padEnd(maxVarLength)} = "your-${v.name.replace(/_/g, '-')}"`
    ).join('\n') + '\n';
  }

  // Build conditional usage sections
  let conditionalUsageSections = '';
  if (parsed.conditionalUsage && parsed.conditionalUsage.length > 0) {
    conditionalUsageSections = parsed.conditionalUsage.map(usage => {
      const allVars = [...requiredVars.map(v => v.name), ...usage.variables];
      const maxVarLength = Math.max(...allVars.map(v => v.length));

      const varsBlock = allVars.map(varName => {
        const isConditional = usage.variables.includes(varName);
        const comment = isConditional ? `  # Required when ${usage.condition}` : '';
        return `  ${varName.padEnd(maxVarLength)} = "your-${varName.replace(/_/g, '-')}"${comment}`;
      }).join('\n');

      return `### Usage with ${usage.name}

\`\`\`hcl
module "${moduleName}" {
  source = "${moduleSource}"

${varsBlock}
}
\`\`\``;
    }).join('\n\n');
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

  // Build the README
  let readme = `# Module: ${moduleName}

## Description

${parsed.description}

## Features

${parsed.features.map(f => `- ${f}`).join('\n')}

## Basic Usage

\`\`\`hcl
module "${moduleName}" {
  source = "${moduleSource}"
${basicUsageBlock}}
\`\`\`
`;

  // Add conditional usage sections if any
  if (conditionalUsageSections) {
    readme += `\n${conditionalUsageSections}\n`;
  }

  // Add outputs example and tf-docs
  readme += `
## Using Outputs

\`\`\`hcl
# Reference outputs in other resources
resource "example_resource" "this" {
  example_attribute = module.${moduleName}.${firstOutput}
}
\`\`\`

${tfDocsSection}
`;

  return readme;
}

module.exports = {
  config,
  detect,
  prepareContext,
  getSystemPrompt,
  getUserPrompt,
  generateReadme,
};
