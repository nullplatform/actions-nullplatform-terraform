/**
 * Generator Registry
 * Exports all available generators and provides detection
 */

const terraform = require('./terraform');
const typescript = require('./typescript');
const python = require('./python');
const generic = require('./generic');

// Order matters - first match wins
const generators = [
  terraform,
  typescript,
  python,
  generic,  // Fallback - always matches
];

/**
 * Detect the appropriate generator for a directory
 * @param {string} dir - Directory to analyze
 * @returns {object} - The matching generator module
 */
function detectGenerator(dir) {
  for (const generator of generators) {
    if (generator.detect(dir)) {
      return generator;
    }
  }
  return generic; // Fallback
}

/**
 * Get generator by name
 * @param {string} name - Generator name
 * @returns {object|null} - The generator module or null
 */
function getGeneratorByName(name) {
  return generators.find(g => g.config.name === name) || null;
}

/**
 * List all available generators
 * @returns {object[]} - Array of generator configs
 */
function listGenerators() {
  return generators.map(g => g.config);
}

module.exports = {
  generators,
  detectGenerator,
  getGeneratorByName,
  listGenerators,
  // Export individual generators
  terraform,
  typescript,
  python,
  generic,
};
