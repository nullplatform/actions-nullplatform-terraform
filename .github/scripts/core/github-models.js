/**
 * GitHub Models API Client
 * Generic module for calling GitHub Models (Azure OpenAI) API
 */

const MODEL_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

/**
 * Call GitHub Models API with a prompt
 * @param {string} prompt - The user prompt
 * @param {string} systemPrompt - The system prompt
 * @param {object} options - Additional options
 * @returns {Promise<string>} - The model's response
 */
async function callGitHubModel(prompt, systemPrompt, options = {}) {
  const {
    token = process.env.GITHUB_TOKEN,
    model = process.env.AI_MODEL || 'gpt-4o',
    temperature = 0.1,
    maxTokens = 2000,
  } = options;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required for GitHub Models API');
  }

  const response = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Models API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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

module.exports = {
  callGitHubModel,
  parseAIResponse,
  MODEL_ENDPOINT,
};
