/**
 * AI Client - Multi-provider support
 * Supports: Groq, GitHub Models, OpenAI, Anthropic
 * Features: Automatic retry with rate limit handling
 */

// =============================================================================
// AI PROVIDERS CONFIGURATION
// =============================================================================

const PROVIDERS = {
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
    format: 'openai',
  },
  github: {
    name: 'GitHub Models',
    endpoint: 'https://models.inference.ai.azure.com/chat/completions',
    defaultModel: 'gpt-4o',
    apiKeyEnv: 'GITHUB_TOKEN',
    format: 'openai',
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    format: 'openai',
  },
  anthropic: {
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    format: 'anthropic',
  },
};

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

// =============================================================================
// RETRY UTILITIES
// =============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract wait time from rate limit error response
 * Groq returns messages like "Please try again in 5.295s"
 */
function extractWaitTimeFromError(errorText) {
  const match = errorText.match(/try again in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000); // Convert to ms and round up
  }
  return null;
}

/**
 * Calculate delay for retry with exponential backoff
 */
function calculateRetryDelay(attempt, response, errorText, config) {
  // Priority 1: Use retry-after header if available
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter) {
    const retryMs = parseInt(retryAfter, 10) * 1000;
    if (!isNaN(retryMs)) {
      return Math.min(retryMs + 500, config.maxDelayMs); // Add 500ms buffer
    }
  }

  // Priority 2: Extract wait time from error message
  const extractedWait = extractWaitTimeFromError(errorText);
  if (extractedWait) {
    return Math.min(extractedWait + 500, config.maxDelayMs); // Add 500ms buffer
  }

  // Priority 3: Exponential backoff
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  return Math.min(exponentialDelay, config.maxDelayMs);
}

// =============================================================================
// AI CLIENT FUNCTIONS
// =============================================================================

function getProvider() {
  const providerName = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const provider = PROVIDERS[providerName];

  if (!provider) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown AI provider: ${providerName}. Available: ${available}`);
  }

  return provider;
}

function getApiKey(provider) {
  const apiKey = process.env[provider.apiKeyEnv];

  if (!apiKey) {
    throw new Error(`${provider.apiKeyEnv} environment variable is required for ${provider.name}`);
  }

  return apiKey;
}

async function callOpenAIFormat(provider, apiKey, model, systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.1, maxTokens = 4000, retryConfig = DEFAULT_RETRY_CONFIG } = options;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }

      // Handle rate limiting (429) with retry
      if (response.status === 429 && attempt < retryConfig.maxRetries) {
        const errorText = await response.text();
        const delayMs = calculateRetryDelay(attempt, response, errorText, retryConfig);

        console.log(`   ⏳ Rate limited. Waiting ${(delayMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${retryConfig.maxRetries}...`);
        await sleep(delayMs);
        continue;
      }

      // Non-retryable error or max retries exceeded
      lastResponse = response;
      lastError = await response.text();

      // For non-429 errors, don't retry
      if (response.status !== 429) {
        break;
      }
    } catch (error) {
      lastError = error.message;

      // Network errors: retry with backoff
      if (attempt < retryConfig.maxRetries) {
        const delayMs = retryConfig.baseDelayMs * Math.pow(2, attempt);
        console.log(`   ⏳ Network error. Waiting ${(delayMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${retryConfig.maxRetries}...`);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw new Error(`${provider.name} API error: ${lastResponse?.status || 'unknown'} - ${lastError}`);
}

async function callAnthropicFormat(provider, apiKey, model, systemPrompt, userPrompt, options = {}) {
  const { maxTokens = 4000, retryConfig = DEFAULT_RETRY_CONFIG } = options;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.content[0].text;
      }

      // Handle rate limiting (429) with retry
      if (response.status === 429 && attempt < retryConfig.maxRetries) {
        const errorText = await response.text();
        const delayMs = calculateRetryDelay(attempt, response, errorText, retryConfig);

        console.log(`   ⏳ Rate limited. Waiting ${(delayMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${retryConfig.maxRetries}...`);
        await sleep(delayMs);
        continue;
      }

      // Non-retryable error or max retries exceeded
      lastResponse = response;
      lastError = await response.text();

      if (response.status !== 429) {
        break;
      }
    } catch (error) {
      lastError = error.message;

      if (attempt < retryConfig.maxRetries) {
        const delayMs = retryConfig.baseDelayMs * Math.pow(2, attempt);
        console.log(`   ⏳ Network error. Waiting ${(delayMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${retryConfig.maxRetries}...`);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw new Error(`${provider.name} API error: ${lastResponse?.status || 'unknown'} - ${lastError}`);
}

/**
 * Call AI with system and user prompts
 * @param {string} systemPrompt - The system prompt
 * @param {string} userPrompt - The user prompt
 * @param {object} options - Additional options (temperature, maxTokens, retryConfig)
 * @returns {Promise<string>} - The AI response
 */
async function callAI(systemPrompt, userPrompt, options = {}) {
  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const model = process.env.AI_MODEL || provider.defaultModel;

  if (provider.format === 'openai') {
    return callOpenAIFormat(provider, apiKey, model, systemPrompt, userPrompt, options);
  } else if (provider.format === 'anthropic') {
    return callAnthropicFormat(provider, apiKey, model, systemPrompt, userPrompt, options);
  }

  throw new Error(`Unknown provider format: ${provider.format}`);
}

/**
 * Parse JSON response from AI, handling common issues
 * @param {string} response - Raw response from AI
 * @returns {object} - Parsed JSON object
 */
function parseAIResponse(response) {
  // Remove markdown code blocks if present
  const cleanResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(cleanResponse);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${e.message}\nResponse: ${response}`);
  }
}

/**
 * Get current provider info
 * @returns {object} - Provider name and model
 */
function getProviderInfo() {
  const provider = getProvider();
  const model = process.env.AI_MODEL || provider.defaultModel;
  return { name: provider.name, model };
}

module.exports = {
  callAI,
  parseAIResponse,
  getProvider,
  getProviderInfo,
  PROVIDERS,
  DEFAULT_RETRY_CONFIG,
  sleep,
};
