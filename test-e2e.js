#!/usr/bin/env node
/**
 * E2E Test for Terraform README Generator
 * Tests the variable classification logic and README generation with the S3 module
 */

const path = require('path');
const generator = require('./.github/scripts/generators/terraform.js');

const S3_MODULE_PATH = '/Users/sebastian.correa/Documents/code/nullplatform/test-ci-tofu/infrastructure/aws/s3';

console.log('='.repeat(60));
console.log('E2E TEST: Terraform README Generator');
console.log('='.repeat(60));
console.log(`\nTesting module: ${S3_MODULE_PATH}\n`);

// Step 1: Detect module
console.log('1. Detecting Terraform module...');
const isModule = generator.detect(S3_MODULE_PATH);
console.log(`   Result: ${isModule ? '✓ Valid Terraform module' : '✗ Not a Terraform module'}`);

if (!isModule) {
  console.error('   FAILED: Directory is not a Terraform module');
  process.exit(1);
}

// Step 2: Prepare context
console.log('\n2. Preparing context and classifying variables...');
const context = generator.prepareContext(S3_MODULE_PATH);

console.log('\n   VARIABLE CLASSIFICATION:');
console.log('   ' + '-'.repeat(50));

console.log('\n   Required Variables (no default, no validation):');
if (context.requiredVars.length === 0) {
  console.log('   (none)');
} else {
  context.requiredVars.forEach(v => console.log(`   - ${v.name}`));
}

console.log('\n   Trigger Variables (no default + validation):');
if (context.triggerVars.length === 0) {
  console.log('   (none)');
} else {
  context.triggerVars.forEach(v => {
    console.log(`   - ${v.name}`);
    console.log(`     Validation: ${v.validation?.condition?.substring(0, 60)}...`);
  });
}

console.log('\n   Conditional Variables (has default + validation):');
if (context.conditionalVars.length === 0) {
  console.log('   (none)');
} else {
  context.conditionalVars.forEach(v => {
    console.log(`   - ${v.name}`);
    console.log(`     Validation: ${v.validation?.condition?.substring(0, 60)}...`);
  });
}

console.log('\n   Optional Variables (has default, no validation):');
console.log(`   (${context.optionalVars.length} variables)`);

// Step 3: Verify expectations for S3 module
console.log('\n3. Verifying expectations...');
console.log('   ' + '-'.repeat(50));

let passed = 0;
let failed = 0;

const tests = [
  {
    name: 'bucket_name is a required variable',
    test: () => context.requiredVars.some(v => v.name === 'bucket_name'),
  },
  {
    name: 'environment is a required variable',
    test: () => context.requiredVars.some(v => v.name === 'environment'),
  },
  {
    name: 'test_storage_class is a trigger variable',
    test: () => context.triggerVars.some(v => v.name === 'test_storage_class'),
  },
  {
    name: 'test_storage_class is NOT in required vars',
    test: () => !context.requiredVars.some(v => v.name === 'test_storage_class'),
  },
  {
    name: 'test_glacier_days is a conditional variable',
    test: () => context.conditionalVars.some(v => v.name === 'test_glacier_days'),
  },
  {
    name: 'force_destroy is an optional variable',
    test: () => context.optionalVars.some(v => v.name === 'force_destroy'),
  },
];

tests.forEach(t => {
  const result = t.test();
  if (result) {
    console.log(`   ✓ ${t.name}`);
    passed++;
  } else {
    console.log(`   ✗ ${t.name}`);
    failed++;
  }
});

// Step 4: Show AI prompt preview
console.log('\n4. AI Prompt Preview (variable analysis section):');
console.log('   ' + '-'.repeat(50));
const prompt = generator.getUserPrompt(context);
const analysisSection = prompt.match(/VARIABLE ANALYSIS:[\s\S]*?UNDERSTANDING TRIGGERS/)?.[0] || '';
console.log(analysisSection.split('\n').map(l => '   ' + l).join('\n'));

// Step 5: Simulate AI response and generate README with NEW triggerValue format
console.log('\n5. Generating README with mock AI response (new triggerValue format)...');
const mockAIResponse = {
  description: "Creates and manages an AWS S3 bucket with configurable storage classes and lifecycle policies",
  features: [
    "Creates S3 buckets with customizable configurations",
    "Supports multiple storage classes (Standard, Intelligent Tiering, Glacier)",
    "Configures versioning and lifecycle rules",
    "Enables server-side encryption with optional KMS",
    "Manages public access blocking and CORS rules"
  ],
  conditionalUsage: [
    {
      name: "Glacier Storage",
      triggerVar: "test_storage_class",
      triggerValue: "glacier",
      variables: ["test_glacier_days"]
    },
    {
      name: "Intelligent Tiering",
      triggerVar: "test_storage_class",
      triggerValue: "intelligent_tiering",
      variables: []
    },
    {
      name: "Standard Storage",
      triggerVar: "test_storage_class",
      triggerValue: "standard",
      variables: []
    }
  ]
};

const readme = generator.generateReadme(S3_MODULE_PATH, mockAIResponse, context);

// Check README content
console.log('\n   README Content Checks:');
const readmeTests = [
  {
    name: 'Basic Usage includes test_storage_class',
    test: () => {
      const basicUsage = readme.match(/## Basic Usage[\s\S]*?```hcl[\s\S]*?```/)?.[0] || '';
      return basicUsage.includes('test_storage_class');
    },
  },
  {
    name: 'Basic Usage variables are sorted alphabetically',
    test: () => {
      const basicUsage = readme.match(/## Basic Usage[\s\S]*?```hcl[\s\S]*?```/)?.[0] || '';
      const varMatches = basicUsage.match(/^\s{2}(\w+)\s+=/gm) || [];
      // Exclude 'source' since it's not a variable
      const varNames = varMatches.map(m => m.trim().split(/\s+/)[0]).filter(v => v !== 'source');
      const sorted = [...varNames].sort();
      return JSON.stringify(varNames) === JSON.stringify(sorted);
    },
  },
  {
    name: 'Has "Usage with Glacier Storage" section',
    test: () => readme.includes('### Usage with Glacier Storage'),
  },
  {
    name: 'Has "Usage with Intelligent Tiering" section',
    test: () => readme.includes('### Usage with Intelligent Tiering'),
  },
  {
    name: 'Has "Usage with Standard Storage" section',
    test: () => readme.includes('### Usage with Standard Storage'),
  },
  {
    name: 'Glacier section shows real trigger value "glacier"',
    test: () => {
      const glacierSection = readme.match(/### Usage with Glacier Storage[\s\S]*?```[\s\S]*?```/)?.[0] || '';
      return glacierSection.includes('test_storage_class = "glacier"');
    },
  },
  {
    name: 'Glacier section includes test_glacier_days with comment',
    test: () => {
      const glacierSection = readme.match(/### Usage with Glacier Storage[\s\S]*?```[\s\S]*?```/)?.[0] || '';
      return glacierSection.includes('test_glacier_days') &&
             glacierSection.includes('# Required when test_storage_class = "glacier"');
    },
  },
  {
    name: 'Intelligent Tiering section shows real trigger value',
    test: () => {
      const section = readme.match(/### Usage with Intelligent Tiering[\s\S]*?```[\s\S]*?```/)?.[0] || '';
      return section.includes('test_storage_class = "intelligent_tiering"');
    },
  },
  {
    name: 'Standard section shows real trigger value',
    test: () => {
      const section = readme.match(/### Usage with Standard Storage[\s\S]*?```[\s\S]*?```/)?.[0] || '';
      return section.includes('test_storage_class = "standard"');
    },
  },
  {
    name: 'Conditional sections have variables sorted alphabetically',
    test: () => {
      const glacierSection = readme.match(/### Usage with Glacier Storage[\s\S]*?```hcl[\s\S]*?```/)?.[0] || '';
      const varMatches = glacierSection.match(/^\s{2}(\w+)\s+=/gm) || [];
      // Exclude 'source' since it's not a variable
      const varNames = varMatches.map(m => m.trim().split(/\s+/)[0]).filter(v => v !== 'source');
      const sorted = [...varNames].sort();
      return JSON.stringify(varNames) === JSON.stringify(sorted);
    },
  },
];

readmeTests.forEach(t => {
  const result = t.test();
  if (result) {
    console.log(`   ✓ ${t.name}`);
    passed++;
  } else {
    console.log(`   ✗ ${t.name}`);
    failed++;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Result: ${failed === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

// Show relevant README sections
console.log('\n' + '='.repeat(60));
console.log('GENERATED README PREVIEW');
console.log('='.repeat(60));

// Basic Usage section
const basicUsageMatch = readme.match(/## Basic Usage[\s\S]*?(?=###|## Using)/);
if (basicUsageMatch) {
  console.log('\n--- Basic Usage ---');
  console.log(basicUsageMatch[0].trim());
}

// Glacier section
const glacierSectionMatch = readme.match(/### Usage with Glacier Storage[\s\S]*?```[\s\S]*?```/);
if (glacierSectionMatch) {
  console.log('\n--- Usage with Glacier Storage ---');
  console.log(glacierSectionMatch[0].trim());
}

// Intelligent Tiering section
const itSectionMatch = readme.match(/### Usage with Intelligent Tiering[\s\S]*?```[\s\S]*?```/);
if (itSectionMatch) {
  console.log('\n--- Usage with Intelligent Tiering ---');
  console.log(itSectionMatch[0].trim());
}

// Standard section
const standardSectionMatch = readme.match(/### Usage with Standard Storage[\s\S]*?```[\s\S]*?```/);
if (standardSectionMatch) {
  console.log('\n--- Usage with Standard Storage ---');
  console.log(standardSectionMatch[0].trim());
}

process.exit(failed === 0 ? 0 : 1);
