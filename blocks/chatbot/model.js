/* eslint-disable class-methods-use-this */
class AIModel {
  constructor() {
    this.session = null;
    this.controller = new AbortController();
  }

  convertToJson(message) {
    console.log('message', message);

    // Helper function to clean whitespace
    const cleanWhitespace = (text) => text
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Helper function to attempt JSON parsing
    const tryParseJson = (text, attemptName) => {
      try {
        return JSON.parse(text);
      } catch (error) {
        console.log(`${attemptName} failed:`, error.message);
        return null;
      }
    };

    // Step 1: Initial cleanup
    let cleaned = message.trim();

    // Step 2: Remove markdown code blocks
    if (cleaned.includes('```json')) {
      cleaned = cleaned.replace(/```json|```/g, '').trim();
    } else if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```/g, '').trim();
    }

    // Step 3: Try to extract JSON from text if LLM added extra text
    const jsonMatch = cleaned.match(/\{.*\}/);
    if (jsonMatch) {
      [cleaned] = jsonMatch;
    }

    // Step 4: First parsing attempt
    let result = tryParseJson(cleaned, 'Initial parse');
    if (result) return result;

    // Step 5: Second attempt with whitespace cleaning
    const cleanedText = cleanWhitespace(cleaned);
    result = tryParseJson(cleanedText, 'Whitespace cleaned parse');
    if (result) return result;

    // Step 6: Final attempt with aggressive JSON extraction
    const jsonPattern = /\{[\s\S]*\}/;
    const lastMatch = message.match(jsonPattern);
    if (lastMatch) {
      const finalClean = cleanWhitespace(lastMatch[0]);
      result = tryParseJson(finalClean, 'Aggressive extraction parse');
      if (result) return result;
    }

    // All attempts failed
    console.log('Original message:', message);
    console.log('Final cleaned attempt:', cleaned);
    throw new Error('Unable to parse LLM response - all JSON parsing attempts failed');
  }

  async setupModel() {
    // Check if LanguageModel is available globally
    if (typeof LanguageModel === 'undefined') {
      console.warn('Build-in AI model is not available. Please ensure the AI model library is loaded.');
      return 'Build-in AI model is not available';
    }

    const availability = await LanguageModel.availability();
    if (availability !== 'unavailable') {
      this.params = await LanguageModel.params();
      this.session = await LanguageModel.create({
        signal: this.controller.signal,
        expectedInputs: [
          { type: 'image' },
          { type: 'text' },
        ],
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log('Download progress:', e.loaded * 100);
          });
        },
        initialPrompts: [
          {
            role: 'system',
            content: `You are a JSON-only conversational form assistant. You MUST ONLY return valid JSON responses. Never include explanatory text, comments, or conversational responses outside of JSON.

                        CRITICAL RULES:
                        1. ALWAYS return ONLY valid JSON - no other text
                        2. Never include explanations, comments, or conversational text
                        3. Never ask questions about the format - just return JSON
                        4. For questions: Create natural, friendly questions that group related fields
                        5. For extraction: Extract values accurately from user responses
                        6. Handle field types appropriately (text, number, boolean, choice, date, file)
                        7. ALWAYS use double quotes for all strings (never single quotes)
                        8. ONLY work with fields from the CURRENT schema provided - never reference previous schemas or conversation history
                        9. NEVER include single quotes, apostrophes, or special characters that break JSON
                        
                        NO OTHER TEXT ALLOWED - ONLY JSON!`,
          },
        ],
      });
      return 'AI Model is available';
    }
    return 'Built-in conversational AI is unavailable';
  }

  async getSmartQuestion(schema, fieldCount = null) {
    // Calculate field count if not provided
    const actualFieldCount = fieldCount || Object.keys(schema.properties || {}).length;

    const prompt = `You are a conversational form assistant. Create a natural question to collect data for the fields in the provided schema.

        JSON Schema (contains ${actualFieldCount} field${actualFieldCount !== 1 ? 's' : ''}):
        ${JSON.stringify(schema, null, 2)}

        CRITICAL WARNINGS:
        - Do NOT include any fields that are not explicitly listed in the schema above
        - Use the exact "id" values from the schema, not the property names
        - Only use fields that actually exist in the current schema

        RULES:
        1. Use ONLY fields that exist in the schema above
        2. Your requestedFields array must have exactly ${actualFieldCount} item${actualFieldCount !== 1 ? 's' : ''}
        3. Extract field IDs from the "id" values in the schema
        4. Group related fields into a single natural question (e.g., "What's your name and email?")
        5. Use field descriptions and placeholders to create natural questions
        6. Return valid JSON with double quotes only
        7. IMPORTANT: Use the actual field count (${actualFieldCount}) from the schema, not the example below

        MANDATORY VALIDATION:
        Before creating your response, you MUST:
        1. List each property name and its ID from the schema above
        2. Verify you have exactly ${actualFieldCount} field${actualFieldCount !== 1 ? 's' : ''}
        3. Use ONLY these exact field IDs in your requestedFields array
        4. Do not add any fields that are not in the schema

        FORMAT:
        {
          "message": "Your question here",
          "requestedFields": ["field_id_1", "field_id_2", "field_id_3"]
        }

        EXAMPLE:
        If schema has: accommodationOtherDetails (id: "r3DWcKYYrpe") and givenNames (id: "bfzaTklDFE0")
        Then requestedFields should be: ["r3DWcKYYrpe", "bfzaTklDFE0"]
        And message should be: "Please provide your given names and describe your accommodation needs."
        (Use exact field IDs, not property names)

        Create your response now.`;

    try {
      const response = await this.session.prompt(prompt);
      console.log('response from getSmartQuestion', response);

      const parsedResponse = this.convertToJson(response);
      console.log('parsedResponse from getSmartQuestion', parsedResponse);
      return parsedResponse;
    } catch (error) {
      console.error('Error getting smart question:', error);
      throw error;
    }
  }

  async extractData(schema, userInput, image) {
    const prompt = `You are an expert at extracting structured information from user input.
        Your task is to extract values for the fields defined in the provided JSON schema from the user's content.
        You must always provide your response in a valid JSON format as a SINGLE OBJECT (not an array).
        
        User provided content:
        ---
        ${userInput}
        ---
        
        JSON Schema of fields to extract:
        ---
        ${JSON.stringify(schema, null, 2)}
        ---
        
        INSTRUCTIONS:
        For each field in the JSON schema, create a JSON object where:
        - The key is the field name from the schema (e.g., "firstName", "email")
        - The value is an object with the following properties:
          1.  \`value\`: The data extracted from the user's content for that field.
          2.  \`confidence\`: A score from 0.0 (uncertain) to 1.0 (certain) of your confidence.
          3.  \`id\`: The field ID from the schema (use the "id" value from the schema).
          4.  \`reasoning\`: A brief explanation of why you extracted that value or why it's missing.
        
        EXTRACTION RULES BY FIELD TYPE:
        - **Text fields**: Extract the actual text value
        - **Number fields**: Extract numeric values, handle ranges and approximations
        - **Boolean fields**: Look for yes/no, true/false, agree/disagree patterns
        - **Choice fields**: Match user input to enum values, use closest match
        - **Date fields**: Parse various date formats (MM/DD/YYYY, DD/MM/YYYY, etc.)
        - **File fields**: Extract file names or descriptions mentioned
        
        SPECIAL HANDLING:
        - **Explicit User Refusal:** If user says "skip", "don't want to", "I won't say", etc.:
            - Set \`value\` to \`null\`
            - Set \`confidence\` to \`1.0\`
            - Set \`reasoning\` to "User explicitly refused to provide this information"
        - **Information Not Found:** If field isn't mentioned:
            - Set \`value\` to \`null\`
            - Set \`confidence\` to \`0.0\`
            - Set \`reasoning\` to "Information not found in the provided content"
        - **For enum fields:** Choose the closest matching option from the enum list
        - **For boolean fields:** Convert yes/no responses to true/false
        
        CRITICAL JSON FORMATTING REQUIREMENTS:
        1. ALWAYS use double quotes for all strings (never single quotes)
        2. NEVER use quotes, apostrophes, or special characters in reasoning text
        3. ALWAYS close all quotes, brackets, and braces
        4. NEVER include trailing commas
        5. NEVER include unescaped quotes, apostrophes, or special characters that break JSON
        6. ALWAYS ensure the JSON is valid by checking that all opening brackets/braces have matching closing ones
        7. For reasoning text: Use simple, clear explanations without quotes or apostrophes
        8. Test your JSON mentally before returning - ensure it can be parsed
        9. NEVER return an array - always return a single JSON object
        
        CRITICAL: Your final output must be a single JSON object where each field name from the schema is a key, and the value is an object containing the extracted data. Do not include any other text or explanations.
        
        REQUIRED JSON FORMAT (EXAMPLE):
        {
          "firstName": {
            "value": "John",
            "confidence": 0.95,
            "id": "fieldId",
            "reasoning": "The user stated their name is John"
          },
          "email": {
            "value": "john@example.com",
            "confidence": 0.9,
            "id": "fieldId",
            "reasoning": "The user provided their email address"
          },
          "agreement": {
            "value": null,
            "confidence": 1.0,
            "id": "fieldId",
            "reasoning": "User explicitly refused to provide this information"
          }
        }
        
        IMPORTANT: 
        - Return ONLY a single JSON object (not an array)
        - Each field from the schema should be a key in the object
        - Do not wrap the response in an array
        - Do not include any text outside the JSON object`;

    try {
      let response;
      if (image) {
        response = await this.session.prompt(
          [{
            role: 'user',
            content: [
              { type: 'text', value: prompt },
              { type: 'image', value: image },
            ],
          }],
        );
      } else {
        response = await this.session.prompt(prompt);
      }
      const responseJson = this.convertToJson(response);
      return responseJson;
    } catch (error) {
      console.error('Error extracting data:', error);
      throw error;
    }
  }
}

export default AIModel;