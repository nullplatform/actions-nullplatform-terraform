/**
 * Python README Generator
 * Generates documentation for Python projects
 */

const fs = require('fs');
const path = require('path');
const { readFilesByPattern, extractBetweenMarkers, getNameFromPath, getLatestTag, getRepository } = require('../core/file-utils');

const config = {
  name: 'python',
  displayName: 'Python',
  filePatterns: ['*.py', 'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
  exclude: ['__pycache__', '.venv', 'venv', 'env', '.eggs', '*.egg-info', 'dist', 'build'],
};

/**
 * Detect if directory is a Python project
 */
function detect(dir) {
  const files = fs.readdirSync(dir);
  return files.includes('pyproject.toml') ||
         files.includes('setup.py') ||
         files.includes('requirements.txt') ||
         files.some(f => f.endsWith('.py'));
}

/**
 * Read and prepare context from project files
 */
function prepareContext(dir) {
  // Read pyproject.toml or setup.py for metadata
  let projectMetadata = {};
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  const setupPath = path.join(dir, 'setup.py');

  if (fs.existsSync(pyprojectPath)) {
    projectMetadata.pyproject = fs.readFileSync(pyprojectPath, 'utf-8');
  }
  if (fs.existsSync(setupPath)) {
    projectMetadata.setup = fs.readFileSync(setupPath, 'utf-8');
  }

  // Read requirements.txt
  const reqPath = path.join(dir, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    projectMetadata.requirements = fs.readFileSync(reqPath, 'utf-8');
  }

  // Read main source files (limit to avoid token limits)
  const sourceFiles = readFilesByPattern(dir, ['*.py'], {
    exclude: config.exclude,
    recursive: true,
  });

  // Limit context size - take most important files
  const importantFiles = {};
  const priorityFiles = ['__init__.py', 'main.py', 'app.py', 'cli.py', '__main__.py'];

  for (const [filename, content] of Object.entries(sourceFiles)) {
    const basename = path.basename(filename);
    if (priorityFiles.includes(basename) || Object.keys(importantFiles).length < 5) {
      // Truncate large files
      importantFiles[filename] = content.length > 3000 ? content.slice(0, 3000) + '\n# ... truncated' : content;
    }
  }

  // Format for prompt
  const filesContext = Object.entries(importantFiles)
    .map(([filename, content]) => `### ${filename}\n\`\`\`python\n${content}\n\`\`\``)
    .join('\n\n');

  let metadataContext = '';
  if (projectMetadata.pyproject) {
    metadataContext += `### pyproject.toml\n\`\`\`toml\n${projectMetadata.pyproject}\n\`\`\`\n\n`;
  }
  if (projectMetadata.requirements) {
    metadataContext += `### requirements.txt\n\`\`\`\n${projectMetadata.requirements}\n\`\`\`\n\n`;
  }

  return {
    files: importantFiles,
    filesContext: metadataContext + filesContext,
    projectMetadata,
    projectName: getNameFromPath(dir),
    tag: getLatestTag(),
    repository: getRepository(),
  };
}

/**
 * Get the system prompt for AI
 */
function getSystemPrompt() {
  return `You are a technical documentation generator for Python projects. You MUST respond with ONLY valid JSON, no markdown, no code blocks, no explanations. Your response must be parseable by JSON.parse().`;
}

/**
 * Get the user prompt for AI
 */
function getUserPrompt(context) {
  return `Analyze this Python project and return a JSON object with these exact keys:

{
  "description": "One sentence describing what this project does",
  "features": ["feature 1", "feature 2", "feature 3"],
  "installation": "Installation command (pip install, poetry install, etc.)",
  "usage": "Brief usage example with import and basic usage",
  "prerequisites": ["Python >= 3.9", "other requirements"]
}

Rules:
- description: One clear sentence, no period at the end
- features: Array of 3-7 strings, each starting with a verb
- installation: Actual pip/poetry/pdm command based on project config
- usage: Real import statement and basic usage example
- prerequisites: Array of requirements (Python version, etc.)
- Be concise and professional

Project files:
${context.filesContext}

Respond with ONLY the JSON object:`;
}

/**
 * Generate README content from AI response
 */
function generateReadme(dir, parsed, context) {
  const { projectName, tag, repository } = context;

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

  return `# ${projectName}

[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/github/license/${repository}.svg)](LICENSE)

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

\`\`\`python
${parsed.usage}
\`\`\`

${apiSection}

## Development

\`\`\`bash
# Clone the repository
git clone https://github.com/${repository}.git
cd ${projectName}

# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest
\`\`\`

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## License

MIT
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
