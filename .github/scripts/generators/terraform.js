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
  // Variables sin default y sin validation = requeridas básicas
  const requiredVars = variables.filter(v => !v.hasDefault && !v.validation);

  // Variables sin default + con validation = triggers (ej: backup_provider)
  // Estas van en Basic Usage Y generan secciones condicionales
  const triggerVars = variables.filter(v => !v.hasDefault && v.validation);

  // Variables con default + con validation = miembros de grupos (ej: backup_s3_bucket)
  const conditionalVars = variables.filter(v => v.hasDefault && v.validation);

  // Variables con default sin validation = opcionales simples
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
    triggerVars,
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
  const { requiredVars, triggerVars, conditionalVars } = context;

  // Build info about variables for the AI
  const requiredVarNames = requiredVars.map(v => v.name);
  const triggerVarInfo = triggerVars.map(v => ({
    name: v.name,
    condition: v.validation?.condition || '',
    description: v.description,
  }));
  const conditionalVarInfo = conditionalVars.map(v => ({
    name: v.name,
    condition: v.validation?.condition || '',
    description: v.description,
  }));

  return `Analyze this Terraform module and return a JSON object.

VARIABLE ANALYSIS:
- Required variables (no default, no validation): ${JSON.stringify(requiredVarNames)}
- Trigger variables (no default + validation like contains([...], var.X)): ${JSON.stringify(triggerVarInfo, null, 2)}
- Conditional variables (has default + validation referencing a trigger): ${JSON.stringify(conditionalVarInfo, null, 2)}

UNDERSTANDING TRIGGERS AND CONDITIONAL VARIABLES:
- A "trigger" variable is one WITHOUT a default that has a validation like: contains(["value1", "value2"], var.trigger_name)
- Conditional variables reference the trigger in their validation, e.g.: var.trigger_name != "value1" || var.conditional_var != null
- This means: when trigger_name = "value1", the conditional_var becomes required

TASK:
1. Analyze the module to generate description and features
2. Identify trigger variables and their possible values from the contains() validation
3. For each trigger value, identify which conditional variables become required
4. Generate usage sections showing each trigger value with its required conditional variables

Return this exact JSON structure:
{
  "description": "One sentence describing what this module does",
  "features": ["feature 1", "feature 2", "feature 3"],
  "conditionalUsage": [
    {
      "name": "S3 Backup",
      "condition": "backup_provider = \\"s3\\"",
      "triggerVar": "backup_provider",
      "variables": ["backup_s3_bucket", "backup_s3_prefix"]
    }
  ]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb (Creates, Configures, Supports, etc.)
- conditionalUsage: Array of usage groups. Each group has:
  - name: Human-readable name for the condition (e.g., "S3 Backup", "GitLab Provider")
  - condition: The HCL condition to show in comments (e.g., "backup_provider = \\"s3\\"")
  - triggerVar: The name of the trigger variable
  - variables: Array of conditional variable names that are required for this trigger value
- If there are no trigger variables or conditional validations, return empty array for conditionalUsage
- Only create conditionalUsage entries for trigger values that have associated conditional variables

Terraform files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { moduleName, requiredVars, triggerVars, outputs, tag, repository } = context;

  // Build module source URL - use relative path from repo root
  // Handle both absolute paths (/Users/.../infrastructure/aws/s3) and relative paths (infrastructure/aws/s3)
  let modulePath = dir.replace(/^\.\//, '');
  // If it's an absolute path, extract from 'infrastructure/' onwards
  const infraMatch = modulePath.match(/(?:^|\/)(infrastructure\/.*)$/);
  if (infraMatch) {
    modulePath = infraMatch[1];
  }
  const moduleSource = `git::https://github.com/${repository}.git//${modulePath}?ref=${tag}`;

  // Combine required vars and trigger vars for Basic Usage
  const basicUsageVars = [...requiredVars, ...triggerVars];

  // Build Basic Usage with required and trigger variables
  let basicUsageBlock = '';
  if (basicUsageVars.length > 0) {
    const maxVarLength = Math.max(...basicUsageVars.map(v => v.name.length));
    basicUsageBlock = '\n' + basicUsageVars.map(v =>
      `  ${v.name.padEnd(maxVarLength)} = "your-${v.name.replace(/_/g, '-')}"`
    ).join('\n') + '\n';
  }

  // Build conditional usage sections
  let conditionalUsageSections = '';
  if (parsed.conditionalUsage && parsed.conditionalUsage.length > 0) {
    conditionalUsageSections = parsed.conditionalUsage.map(usage => {
      // Include required vars, trigger vars, and the conditional variables for this usage
      const allVars = [
        ...requiredVars.map(v => v.name),
        ...triggerVars.map(v => v.name),
        ...usage.variables
      ];
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
