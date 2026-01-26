/**
 * TypeScript/JavaScript README Generator
 * Generates documentation for TypeScript/JavaScript projects
 */

const fs = require('fs');
const path = require('path');
const { readFilesByPattern, extractBetweenMarkers, getNameFromPath, getLatestTag, getRepository } = require('../core/file-utils');

const config = {
  name: 'typescript',
  displayName: 'TypeScript/JavaScript',
  filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', 'package.json', 'tsconfig.json'],
  exclude: ['node_modules', 'dist', 'build', '.next', 'coverage'],
};

/**
 * Detect if directory is a TypeScript/JavaScript project
 */
function detect(dir) {
  const files = fs.readdirSync(dir);
  return files.includes('package.json') ||
         files.some(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'));
}

/**
 * Read and prepare context from project files
 */
function prepareContext(dir) {
  // Read package.json for metadata
  let packageJson = {};
  const packagePath = path.join(dir, 'package.json');
  if (fs.existsSync(packagePath)) {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  }

  // Read main source files (limit to avoid token limits)
  const sourceFiles = readFilesByPattern(dir, ['*.ts', '*.tsx', '*.js', '*.jsx'], {
    exclude: config.exclude,
    recursive: true,
  });

  // Limit context size - take most important files
  const importantFiles = {};
  const priorityFiles = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'];

  for (const [filename, content] of Object.entries(sourceFiles)) {
    const basename = path.basename(filename);
    if (priorityFiles.includes(basename) || Object.keys(importantFiles).length < 5) {
      // Truncate large files
      importantFiles[filename] = content.length > 3000 ? content.slice(0, 3000) + '\n// ... truncated' : content;
    }
  }

  // Format for prompt
  const filesContext = Object.entries(importantFiles)
    .map(([filename, content]) => `### ${filename}\n\`\`\`typescript\n${content}\n\`\`\``)
    .join('\n\n');

  const packageContext = packageJson.name ? `### package.json\n\`\`\`json\n${JSON.stringify({
    name: packageJson.name,
    description: packageJson.description,
    scripts: packageJson.scripts,
    dependencies: Object.keys(packageJson.dependencies || {}),
    devDependencies: Object.keys(packageJson.devDependencies || {}),
  }, null, 2)}\n\`\`\`` : '';

  return {
    files: importantFiles,
    filesContext: packageContext + '\n\n' + filesContext,
    packageJson,
    projectName: packageJson.name || getNameFromPath(dir),
    tag: getLatestTag(),
    repository: getRepository(),
  };
}

/**
 * Get the system prompt for AI
 */
function getSystemPrompt() {
  return `You are a technical documentation generator for TypeScript/JavaScript projects. You MUST respond with ONLY valid JSON, no markdown, no code blocks, no explanations. Your response must be parseable by JSON.parse().`;
}

/**
 * Get the user prompt for AI
 */
function getUserPrompt(context) {
  return `Analyze this TypeScript/JavaScript project and return a JSON object with these exact keys:

{
  "description": "One sentence describing what this project does",
  "features": ["feature 1", "feature 2", "feature 3"],
  "installation": "Installation command (e.g., npm install package-name)",
  "usage": "Brief usage example or import statement",
  "prerequisites": ["Node.js >= 18", "other requirements"]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb
- installation: Actual npm/yarn/pnpm command based on package.json
- usage: Real import/require statement and basic usage
- prerequisites: Array of requirements
- Be concise and professional

Project files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { projectName, packageJson, tag, repository } = context;

  // Preserve existing sections if present
  const readmePath = path.join(dir, 'README.md');
  let apiSection = '';

  if (fs.existsSync(readmePath)) {
    const existingContent = fs.readFileSync(readmePath, 'utf-8');
    apiSection = extractBetweenMarkers(
      existingContent,
      '<!-- BEGIN_API_DOCS -->',
      '<!-- END_API_DOCS -->'
    );
  }

  if (!apiSection || apiSection === '<!-- BEGIN_API_DOCS -->\n<!-- END_API_DOCS -->') {
    apiSection = '<!-- BEGIN_API_DOCS -->\n<!-- END_API_DOCS -->';
  }

  const badges = [];
  if (packageJson.name) {
    badges.push(`[![npm version](https://img.shields.io/npm/v/${packageJson.name}.svg)](https://www.npmjs.com/package/${packageJson.name})`);
  }
  badges.push(`[![License](https://img.shields.io/github/license/${repository}.svg)](LICENSE)`);

  return `# ${projectName}

${badges.join(' ')}

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

\`\`\`typescript
${parsed.usage}
\`\`\`

${apiSection}

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## License

${packageJson.license || 'MIT'}
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
