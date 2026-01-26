#!/usr/bin/env node

/**
 * README Generator v2
 * Multi-project type README generator using GitHub Models API
 *
 * Usage:
 *   node generate-readme-v2.js [directories...]
 *   node generate-readme-v2.js --all --base-dir ./src
 *   node generate-readme-v2.js --type terraform ./modules/vpc
 *   node generate-readme-v2.js --type typescript ./packages/api
 *
 * Options:
 *   --all              Generate for all detected projects
 *   --base-dir <dir>   Base directory for --all (default: .)
 *   --type <type>      Force generator type (terraform, typescript, python, generic)
 *   --dry-run          Print what would be generated without writing files
 *   --verbose          Print detailed output
 */

const fs = require('fs');
const path = require('path');

const { callGitHubModel, parseAIResponse } = require('./core/github-models');
const { findDirectoriesWithFiles, getNameFromPath } = require('./core/file-utils');
const { detectGenerator, getGeneratorByName, listGenerators } = require('./generators');

// Parse command line arguments
function parseArgs(args) {
  const options = {
    directories: [],
    all: false,
    baseDir: '.',
    type: null,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--base-dir' && args[i + 1]) {
      options.baseDir = args[i + 1];
      i++;
    } else if (arg === '--type' && args[i + 1]) {
      options.type = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      options.directories.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
README Generator v2 - Multi-project type documentation generator

Usage:
  node generate-readme-v2.js [options] [directories...]

Options:
  --all              Generate for all detected projects in base-dir
  --base-dir <dir>   Base directory for --all (default: .)
  --type <type>      Force generator type instead of auto-detection
  --dry-run          Print what would be generated without writing
  --verbose          Print detailed output
  --help             Show this help message

Available generators:
${listGenerators().map(g => `  - ${g.name}: ${g.displayName}`).join('\n')}

Examples:
  # Auto-detect and generate for specific directories
  node generate-readme-v2.js ./modules/vpc ./modules/rds

  # Generate for all Terraform modules
  node generate-readme-v2.js --all --base-dir ./infrastructure --type terraform

  # Generate for a TypeScript project
  node generate-readme-v2.js --type typescript ./packages/api

Environment Variables:
  GITHUB_TOKEN       Required - GitHub token for Models API
  AI_MODEL           Optional - Model to use (default: gpt-4o)
  GITHUB_REPOSITORY  Optional - Repository name for source URLs
`);
}

// Find all project directories based on generator type
function findProjectDirectories(baseDir, generatorType) {
  const generator = generatorType ? getGeneratorByName(generatorType) : null;

  if (generator) {
    return findDirectoriesWithFiles(baseDir, generator.config.filePatterns, {
      exclude: generator.config.exclude,
    });
  }

  // Find all potential project directories
  const allPatterns = ['*.tf', 'package.json', 'pyproject.toml', 'setup.py', 'Cargo.toml', 'go.mod'];
  return findDirectoriesWithFiles(baseDir, allPatterns);
}

// Generate README for a single directory
async function generateReadmeForDirectory(dir, options) {
  const { type, dryRun, verbose } = options;

  // Determine generator
  let generator;
  if (type) {
    generator = getGeneratorByName(type);
    if (!generator) {
      console.error(`Unknown generator type: ${type}`);
      console.error(`Available types: ${listGenerators().map(g => g.config.name).join(', ')}`);
      return false;
    }
  } else {
    generator = detectGenerator(dir);
  }

  console.log(`\n📁 Processing: ${dir}`);
  console.log(`   Generator: ${generator.config.displayName}`);

  try {
    // Prepare context
    const context = generator.prepareContext(dir);

    if (verbose) {
      console.log(`   Files found: ${Object.keys(context.files).length}`);
    }

    // Get prompts
    const systemPrompt = generator.getSystemPrompt();
    const userPrompt = generator.getUserPrompt(context);

    if (verbose) {
      console.log(`   Prompt length: ${userPrompt.length} chars`);
    }

    // Call AI
    console.log(`   🤖 Calling GitHub Models API...`);
    const aiResponse = await callGitHubModel(userPrompt, systemPrompt);
    const parsed = parseAIResponse(aiResponse);

    if (verbose) {
      console.log(`   AI Response:`, JSON.stringify(parsed, null, 2));
    }

    // Generate README content
    const readmeContent = generator.generateReadme(dir, parsed, context);

    if (dryRun) {
      console.log(`   📝 Would generate README.md (${readmeContent.length} chars)`);
      console.log(`   Description: ${parsed.description}`);
      console.log(`   Features: ${parsed.features.length} items`);
    } else {
      // Write README
      const readmePath = path.join(dir, 'README.md');
      fs.writeFileSync(readmePath, readmeContent);
      console.log(`   ✅ Generated: ${readmePath}`);
    }

    return true;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (verbose) {
      console.error(error.stack);
    }
    return false;
  }
}

// Update root README with project/module table
function updateRootReadme(baseDir, directories, options) {
  const rootReadmePath = path.join(baseDir === '.' ? '' : baseDir, '..', 'README.md');

  if (!fs.existsSync(rootReadmePath)) {
    if (options.verbose) {
      console.log(`\nNo root README.md found at ${rootReadmePath}`);
    }
    return;
  }

  console.log(`\n📋 Updating root README.md...`);

  // Build table of projects
  const tableRows = directories.map(dir => {
    const name = getNameFromPath(dir);
    const generator = detectGenerator(dir);

    // Try to extract description from generated README
    const readmePath = path.join(dir, 'README.md');
    let description = '';
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf-8');
      const match = content.match(/## Description\s*\n\s*\n?([^\n]+)/);
      description = match ? match[1].trim() : '';
    }

    return `| [${name}](./${dir}) | ${generator.config.displayName} | ${description} |`;
  });

  const tableContent = `| Module | Type | Description |
|--------|------|-------------|
${tableRows.join('\n')}`;

  let rootReadme = fs.readFileSync(rootReadmePath, 'utf-8');
  const beginMarker = '<!-- BEGIN_MODULES -->';
  const endMarker = '<!-- END_MODULES -->';

  const beginIndex = rootReadme.indexOf(beginMarker);
  const endIndex = rootReadme.indexOf(endMarker);

  if (beginIndex !== -1 && endIndex !== -1) {
    rootReadme = rootReadme.substring(0, beginIndex + beginMarker.length) +
      '\n' + tableContent + '\n' +
      rootReadme.substring(endIndex);

    if (options.dryRun) {
      console.log(`   Would update root README.md with ${directories.length} entries`);
    } else {
      fs.writeFileSync(rootReadmePath, rootReadme);
      console.log(`   ✅ Updated root README.md with ${directories.length} entries`);
    }
  } else {
    console.log(`   ⚠️  Module markers not found in root README.md`);
    console.log(`   Add these markers to enable auto-update:`);
    console.log(`   ${beginMarker}`);
    console.log(`   ${endMarker}`);
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate
  if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  // Determine directories to process
  let directories = options.directories;

  if (options.all) {
    directories = findProjectDirectories(options.baseDir, options.type);
    console.log(`Found ${directories.length} projects in ${options.baseDir}`);
  }

  if (directories.length === 0) {
    console.log('No directories to process.');
    console.log('Usage: node generate-readme-v2.js [directories...] or --all --base-dir <dir>');
    process.exit(0);
  }

  // Process each directory
  let success = 0;
  let failed = 0;

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      failed++;
      continue;
    }

    const result = await generateReadmeForDirectory(dir, options);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  // Update root README
  if (options.all && success > 0) {
    updateRootReadme(options.baseDir, directories, options);
  }

  // Summary
  console.log(`\n📊 Summary: ${success} succeeded, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
