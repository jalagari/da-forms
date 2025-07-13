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

  async getSmartQuestion(schema) {
    const prompt = `You are a conversational assistant that creates natural questions to collect form data.
        Your goal is to group related fields and ask for them in a friendly, conversational way.

        CRITICAL: You must ONLY work with the CURRENT schema provided below. Do NOT reference any previous schemas, fields, or conversation history. Only use the fields that are explicitly present in this schema.

        WARNING: If you include ANY field IDs that are not in the schema below, your response will be incorrect. Only use the exact field IDs from the provided schema.
        
        CRITICAL WARNING: The AI has been observed to hallucinate fields like "firstName", "familyName", "givenNames", "uci" when they don't exist in the schema. This is WRONG. Only use fields that are actually present in the schema above.

        JSON Schema of available fields:
        ${JSON.stringify(schema, null, 2)}

        SCHEMA VALIDATION: 
        - The schema above contains ONLY the fields that are currently available
        - Any field not listed in this schema should NEVER be referenced
        - Previous conversation fields are NOT available and should be ignored
        - You must work ONLY with the fields explicitly shown in this schema

        INSTRUCTIONS:
        1. Examine ONLY the schema's "properties" to see the CURRENTLY available fields.
        2. ALL fields provided in this schema should be included in your question.
        3. Create a single, friendly, conversational message asking for ALL the provided fields.
        4. Group the fields logically in your question (e.g., name+email+phone, address fields, preferences).
        5. NEVER include field IDs, technical names, or enum values in the conversational question.
        6. Use the field's description, placeholder, or label to create natural questions.
        7. For enum fields, don't list the options in the question - let the UI handle that.
        8. IGNORE any fields that are not in the current schema - do not reference previous fields.
        9. DOUBLE-CHECK: Ensure every field in your requestedFields array exists in the current schema.
        10. CRITICAL: If a field is not in the schema above, it does not exist and cannot be used.
        11. FALLBACK: If you can't form a natural question, use the field's description directly.
        12. NO HALLUCINATION: Never invent fields or questions that aren't based on the actual schema.
        13. EXPLICIT VERIFICATION: Before responding, explicitly state what field IDs you found in the schema.
        14. ZERO TOLERANCE: Any field ID not in the schema is completely forbidden.

        FIELD TYPE GUIDELINES:
        - Text fields: Ask naturally ("What's your name?", "What's your email?")
        - Number fields: Be specific ("How old are you?", "What's your phone number?")
        - Boolean fields: Ask yes/no questions ("Do you agree to the terms?")
        - Choice fields: Ask for preference ("What's your preferred contact method?")
        - Date fields: Be specific about the date needed ("When were you born?")
        - File fields: Be clear about what to upload ("Please upload your resume")
        
        SPECIAL CASE HANDLING:
        - If the field has a description, use it directly in your question
        - If the field has a placeholder, incorporate it into your question
        - If you can't form a natural question, use the description as-is
        - NEVER hallucinate or make up fields that don't exist

        GROUPING EXAMPLES (GOOD):
        - "Let's start with your basic information. What's your full name, email address, and phone number?"
        - "Now I need your contact details. What's your phone number, preferred contact method, and any additional notes?"
        - "Tell me about your address - what's your street address, city, state, and zip code?"
        - "Describe your specific needs so the right support can be provided." (using field description directly)
        - "Please describe your accommodation needs." (using field placeholder)

        EXAMPLES OF WHAT NOT TO DO (BAD):
        - ❌ "Could you provide your first name (textinput-400472a990), last name (textinput-5dba1787fa)?"
        - ❌ "Please enter your name (firstName) and email (emailAddress)."
        - ❌ "I need your first_name, last_name, and email_address fields."
        - ❌ "Choose from: email, phone, sms" (let the UI show options)
        - ❌ "What's your name and the address from the previous form?" (never reference previous fields)
        - ❌ "To get started, I need your family name and given name." (if these fields are not in the current schema)
        - ❌ Including field IDs like "familyName", "givenNames" if they don't exist in the current schema
        - ❌ Using ANY field IDs that are not explicitly listed in the schema properties above
        - ❌ Referencing fields from memory or previous conversations

        CRITICAL JSON FORMATTING REQUIREMENTS:
        1. ALWAYS use double quotes for all strings (never single quotes)
        2. NEVER use single quotes anywhere in the JSON response
        3. ALWAYS close all quotes, brackets, and braces
        4. NEVER include trailing commas
        5. NEVER include unescaped quotes, apostrophes, or special characters that break JSON
        6. ALWAYS ensure the JSON is valid by checking that all opening brackets/braces have matching closing ones
        7. Test your JSON mentally before returning - ensure it can be parsed

        CRITICAL: You MUST return ONLY a single, valid JSON object. No other text, explanations, or comments.

        REQUIRED JSON FORMAT:
        {
        "message": "A conversational question asking for the selected fields naturally.",
        "requestedFields": ["field_id_1", "field_id_2", "field_id_3"]
        }

        The "requestedFields" array must contain the actual field IDs from the CURRENT schema (the "id" values), not placeholder values.

        IMPORTANT: 
        - Include ALL fields provided in the CURRENT schema in your question and requestedFields array. Do not skip any fields.
        - Do NOT reference any fields that are not in the current schema.
        - Do NOT use any previous conversation history or previous schemas.
        - ONLY work with the fields provided in this specific schema.

        MANDATORY FIELD EXTRACTION:
        You MUST complete this step before creating your response:
        
        Step 1: List the exact fields available in the schema above:
        - Look at the "properties" object
        - For each property, write down: property name and its "id" value
        - Example: "otherAccommodationDetails" -> "NYKPjkn5ZLZ"
        
        Step 2: Verify these are the ONLY fields available
        - Do not add any fields that are not in the properties object
        - Do not reference any fields from memory or previous conversations
        
        Step 3: Use ONLY these extracted field IDs in your requestedFields array
        
        SINGLE FIELD HANDLING:
        - If there's only one field, use its description or placeholder directly
        - Don't try to group it with non-existent fields
        - Don't create complex questions for simple fields
        - Use the field's description as the question if it's clear and complete

        FINAL VALIDATION: Before returning your response, verify that:
        1. Every field ID in your "requestedFields" array exists in the schema above
        2. You are not referencing any fields from previous conversations
        3. Your question only asks for fields that are actually in the current schema
        4. The field IDs match exactly with the "id" values from the schema
        5. You have extracted and verified each field ID from the schema properties

        Now, create a question for ALL the provided fields and generate the JSON response.`;

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
