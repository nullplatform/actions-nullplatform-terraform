/**
 * File Utilities
 * Generic utilities for reading and processing files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Read files matching patterns in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} patterns - File patterns (extensions) to match
 * @param {object} options - Additional options
 * @returns {object} - Object with filename as key and content as value
 */
function readFilesByPattern(dir, patterns, options = {}) {
  const { recursive = false, exclude = [] } = options;
  const files = {};

  function shouldExclude(filePath) {
    return exclude.some(pattern => filePath.includes(pattern));
  }

  function matchesPattern(filename) {
    return patterns.some(pattern => {
      if (pattern.startsWith('*.')) {
        return filename.endsWith(pattern.slice(1));
      }
      return filename === pattern;
    });
  }

  function scanDir(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (shouldExclude(fullPath)) continue;

      if (entry.isDirectory() && recursive) {
        scanDir(fullPath);
      } else if (entry.isFile() && matchesPattern(entry.name)) {
        const relativePath = path.relative(dir, fullPath);
        files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
  }

  scanDir(dir);
  return files;
}

/**
 * Get the latest git tag
 * @returns {string} - Latest tag or 'v0.0.0' if none
 */
function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'v0.0.0';
  }
}

/**
 * Get repository name from environment or git
 * @returns {string} - Repository in format 'owner/repo'
 */
function getRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  try {
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();

    // Handle SSH or HTTPS URLs
    const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match ? match[1] : 'owner/repo';
  } catch {
    return 'owner/repo';
  }
}

/**
 * Find all directories containing specific file types
 * @param {string} baseDir - Base directory to search
 * @param {string[]} patterns - File patterns to look for
 * @param {object} options - Additional options
 * @returns {string[]} - Array of directory paths
 */
function findDirectoriesWithFiles(baseDir, patterns, options = {}) {
  const { exclude = ['.git', 'node_modules', '.terraform', 'vendor', '__pycache__'] } = options;
  const directories = new Set();

  function shouldExclude(dirPath) {
    return exclude.some(pattern => dirPath.includes(pattern));
  }

  function matchesPattern(filename) {
    return patterns.some(pattern => {
      if (pattern.startsWith('*.')) {
        return filename.endsWith(pattern.slice(1));
      }
      return filename === pattern;
    });
  }

  function scanDir(dir) {
    if (!fs.existsSync(dir) || shouldExclude(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let hasMatchingFiles = false;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && matchesPattern(entry.name)) {
        hasMatchingFiles = true;
      }
    }

    if (hasMatchingFiles) {
      directories.add(dir);
    }
  }

  scanDir(baseDir);
  return Array.from(directories).sort();
}

/**
 * Extract content between markers in a file
 * @param {string} content - File content
 * @param {string} beginMarker - Start marker
 * @param {string} endMarker - End marker
 * @returns {string} - Content between markers or default markers
 */
function extractBetweenMarkers(content, beginMarker, endMarker) {
  const beginIndex = content.indexOf(beginMarker);
  const endIndex = content.indexOf(endMarker);

  if (beginIndex !== -1 && endIndex !== -1) {
    return content.substring(beginIndex, endIndex + endMarker.length);
  }

  return `${beginMarker}\n${endMarker}`;
}

/**
 * Get project/module name from directory path
 * @param {string} dirPath - Directory path
 * @returns {string} - Name of the directory
 */
function getNameFromPath(dirPath) {
  return path.basename(dirPath);
}

module.exports = {
  readFilesByPattern,
  getLatestTag,
  getRepository,
  findDirectoriesWithFiles,
  extractBetweenMarkers,
  getNameFromPath,
};
