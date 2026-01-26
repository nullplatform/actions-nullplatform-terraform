/**
 * Generic README Generator
 * Generates documentation for any project type
 */

const fs = require('fs');
const path = require('path');
const { readFilesByPattern, extractBetweenMarkers, getNameFromPath, getLatestTag, getRepository } = require('../core/file-utils');

const config = {
  name: 'generic',
  displayName: 'Generic',
  filePatterns: ['*'],
  exclude: ['.git', 'node_modules', '.terraform', '__pycache__', 'venv', 'dist', 'build'],
};

/**
 * Detect - always returns true as fallback
 */
function detect(dir) {
  return true;
}

/**
 * Read and prepare context from project files
 */
function prepareContext(dir) {
  const files = fs.readdirSync(dir);

  // Detect project type by files present
  let projectType = 'unknown';
  let relevantPatterns = [];

  if (files.includes('Dockerfile') || files.includes('docker-compose.yml')) {
    projectType = 'docker';
    relevantPatterns = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '*.dockerfile'];
  } else if (files.includes('Makefile')) {
    projectType = 'make';
    relevantPatterns = ['Makefile', '*.mk'];
  } else if (files.some(f => f.endsWith('.go'))) {
    projectType = 'go';
    relevantPatterns = ['*.go', 'go.mod', 'go.sum'];
  } else if (files.some(f => f.endsWith('.rs'))) {
    projectType = 'rust';
    relevantPatterns = ['*.rs', 'Cargo.toml'];
  } else if (files.some(f => f.endsWith('.java'))) {
    projectType = 'java';
    relevantPatterns = ['*.java', 'pom.xml', 'build.gradle'];
  } else if (files.some(f => f.endsWith('.sh'))) {
    projectType = 'shell';
    relevantPatterns = ['*.sh', '*.bash'];
  } else {
    // Read any text files
    relevantPatterns = ['*.md', '*.txt', '*.yml', '*.yaml', '*.json'];
  }

  const sourceFiles = readFilesByPattern(dir, relevantPatterns, {
    exclude: config.exclude,
    recursive: false,
  });

  // Limit files and content
  const importantFiles = {};
  let fileCount = 0;

  for (const [filename, content] of Object.entries(sourceFiles)) {
    if (fileCount >= 5) break;
    importantFiles[filename] = content.length > 2000 ? content.slice(0, 2000) + '\n... truncated' : content;
    fileCount++;
  }

  // Format for prompt
  const filesContext = Object.entries(importantFiles)
    .map(([filename, content]) => `### ${filename}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  return {
    files: importantFiles,
    filesContext,
    projectType,
    projectName: getNameFromPath(dir),
    tag: getLatestTag(),
    repository: getRepository(),
    fileList: files.filter(f => !f.startsWith('.')).slice(0, 20),
  };
}

/**
 * Get the system prompt for AI
 */
function getSystemPrompt() {
  return `You are a technical documentation generator. You MUST respond with ONLY valid JSON, no markdown, no code blocks, no explanations. Your response must be parseable by JSON.parse().`;
}

/**
 * Get the user prompt for AI
 */
function getUserPrompt(context) {
  return `Analyze this project and return a JSON object with these exact keys:

{
  "description": "One sentence describing what this project does",
  "features": ["feature 1", "feature 2", "feature 3"],
  "installation": "How to install or set up this project",
  "usage": "Basic usage instructions or example",
  "prerequisites": ["requirement 1", "requirement 2"]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb
- installation: Actual commands to install/set up
- usage: Real usage example
- prerequisites: Array of requirements
- Be concise and professional

Project type detected: ${context.projectType}
Files in directory: ${context.fileList.join(', ')}

Project files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { projectName, projectType, repository } = context;

  // Preserve existing sections if present
  const readmePath = path.join(dir, 'README.md');
  let customSection = '';

  if (fs.existsSync(readmePath)) {
    const existingContent = fs.readFileSync(readmePath, 'utf-8');
    customSection = extractBetweenMarkers(
      existingContent,
      '<!-- BEGIN_CUSTOM -->',
      '<!-- END_CUSTOM -->'
    );
  }

  if (!customSection || customSection === '<!-- BEGIN_CUSTOM -->\n<!-- END_CUSTOM -->') {
    customSection = '<!-- BEGIN_CUSTOM -->\n<!-- END_CUSTOM -->';
  }

  return `# ${projectName}

## Description

${parsed.description}

## Features

${parsed.features.map(f => `- ${f}`).join('\n')}

## Prerequisites

${parsed.prerequisites.map(p => `- ${p}`).join('\n')}

## Installation

\`\`\`bash
${parsed.installation}
\`\`\`

## Usage

\`\`\`
${parsed.usage}
\`\`\`

${customSection}

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## License

See [LICENSE](LICENSE) for details.
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
