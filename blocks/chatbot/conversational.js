/* eslint-disable class-methods-use-this */
import Form from './form.js';
import AIModel from './model.js';

export default class Conversational extends EventTarget {
  constructor() {
    super();
    this.formUrl = null;
    this.downloadProgress = 0;
    this.params = null;
    this.collectedData = {};
    this.conversationHistory = [];
    this.form = null;
    this.form = new Form();
    this.model = new AIModel();

    // Field type classification for smart processing
    this.complexFieldTypes = new Set(['drop-down', 'radio-group', 'checkbox-group', 'checkbox', 'date-input', 'datetime-input', 'file-input', 'range', 'color']);
  }

  updateConversationHistory(content, person = 'system', type = 'text', field = null) {
    const message = {
      sender: person,
      content,
      type,
    };
    if (field) {
      message.field = field;
    }
    this.conversationHistory.push(message);
    this.dispatchEvent(new CustomEvent('conversationUpdated', {
      detail: message,
    }));
  }

  async start(formUrl) {
    this.formUrl = formUrl;
    this.updateConversationHistory('Loading Form Conversational AI...');
    const msg = await this.model.setupModel();
    this.updateConversationHistory(msg);
    this.updateConversationHistory('Loading form...');
    this.form.createFormInstance(this.formUrl);
    this.updateConversationHistory('Waiting for form to ready...');
    this.form.addEventListener('formReady', async () => {
      this.updateConversationHistory('Form ready');
      await this.identifyFields();
    });
  }

  async invalidField() {
    const invalidFields = this.form.getInvalidFields();
    if (invalidFields.length > 0) {
      const field = invalidFields[0];
      const isFieldComplex = this.complexFieldTypes.has(field.fieldType);
      const message = `Invalid field: ${field.label?.value || field.label || field.name}, reason: ${field.validationMessage}`;
      if (isFieldComplex) {
        await this.processComplexField(message, field);
      } else {
        this.updateConversationHistory(message, 'assistant');
      }
    } else {
      await this.identifyFields();
    }
  }

  getSchema(fields) {
    const schema = {
      type: 'object',
      properties: {
      },
    };

    fields.forEach((f) => {
      let field = f;
      if (typeof f === 'string') {
        field = this.form.getField(f);
      }
      schema.properties[field.name] = {
        id: field.id,
        type: field.type,
        enum: field.enum || [],
        description: field.description || '',
        placeholder: field.placeholder || '',
      };
    });

    console.log('Schema', schema);
    return schema;
  }

  async identifyFields() {
    const availableFields = this.form.getFillableFields();

    if (availableFields.length === 0) {
      await this.completeConversation();
      return;
    }

    // Get next field or group of fields
    this.currentRequestedFields = this.getNextFields(availableFields);

    if (this.currentRequestedFields.length === 0) {
      await this.completeConversation();
      return;
    }

    // Process the fields
    if (this.currentRequestedFields.length === 1
        && this.isComplexField(this.currentRequestedFields[0])) {
      await this.processComplexField(this.currentRequestedFields[0]);
    } else {
      await this.processNextFields();
    }
  }

  getNextFields(availableFields) {
    const fields = [];

    for (let i = 0; i < availableFields.length; i += 1) {
      const field = availableFields[i];

      if (this.isComplexField(field)) {
        // If we have simple fields, return them first
        if (fields.length > 0) {
          return fields;
        }
        // Otherwise, return just this complex field
        return [field];
      }
      fields.push(field);
      if (fields.length >= 4) {
        return fields;
      }
    }

    return fields;
  }

  isComplexField(field) {
    return this.complexFieldTypes.has(field.fieldType);
  }

  async processNextFields() {
    try {
      this.updateConversationHistory(`Generating question for fields: ${this.currentRequestedFields.map((f) => f.label?.value || f.label || f.name).join(', ')}`, 'system');

      // Get schema for the selected fields
      const schema = this.getSchema(this.currentRequestedFields);
      const response = await this.model.getSmartQuestion(schema);

      // Store which fields we're asking about

      this.updateConversationHistory(`Generated question: ${response.message}`, 'system');
      this.updateConversationHistory(response.message, 'assistant');
    } catch (error) {
      console.error('Error asking for fields:', error);
      // Simple fallback
      const fieldLabels = this.currentRequestedFields.map((field) => field.label?.value || field.label || field.name).join(', ');
      const fallbackMessage = `I'd like to collect some information: ${fieldLabels}. Could you please provide these details?`;

      this.updateConversationHistory(fallbackMessage, 'assistant');
    }
  }

  async processComplexField(field) {
    const messageType = this.getFieldMessageType(field);
    const message = field.label?.value || field.label || field.name;

    this.updateConversationHistory(
      message,
      'assistant',
      messageType,
      field,
    );
  }

  getFieldMessageType(field) {
    const { fieldType } = field;
    if (fieldType === 'checkbox') return 'boolean';
    if (['drop-down', 'radio-group', 'checkbox-group'].includes(fieldType)) return 'choice';
    return 'field';
  }

  async updateFormData(data) {
    this.updateConversationHistory('Updating form data...', 'system');
    await this.form.updateFormData(data);
    this.updateConversationHistory('Form data updated', 'system');
    await this.invalidField();
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      current[key] = current[key] || {};
      return current[key];
    }, obj);
    target[lastKey] = value;
    return obj;
  }

  async processUserResponse(message) {
    const {
      content, image, field, type,
    } = message;
    if (type === 'command') {
      return;
    }

    if (!this.currentRequestedFields) {
      this.updateConversationHistory(this.form.getThankYouMessage(), 'assistant', 'html');
    }

    // Handle direct field response (from widgets)
    if (field) {
      const qualifiedPath = field.qualifiedName ? field.qualifiedName.replace('$form.', '') : field.name;
      this.setNestedValue(this.collectedData, qualifiedPath, content);
      await this.updateFormData(this.collectedData);
      return;
    }

    // Handle conversational response (from text input)
    try {
      this.updateConversationHistory('Extracting data from user response...', 'system');
      const schema = this.getSchema(this.currentRequestedFields);
      const response = await this.model.extractData(schema, content, image);
      this.updateConversationHistory(`Extracted data: ${JSON.stringify(response)}`, 'system');

      if (response) {
        Object.entries(response).forEach(([fieldName, fieldData]) => {
          if (fieldData.value && fieldData.confidence > 0.5) {
            const currentField = this.form.getField(fieldData?.id);
            if (currentField?.qualifiedName) {
              const qualifiedPath = currentField.qualifiedName.replace('$form.', '');
              this.setNestedValue(this.collectedData, qualifiedPath, fieldData.value);
            } else {
              // Fallback to flat structure if no qualifiedName
              this.collectedData[fieldName] = fieldData.value;
            }
          }
        });

        await this.updateFormData(this.collectedData);
      } else {
        this.updateConversationHistory('I didn\'t quite understand that. Could you please try again?', 'assistant');
      }
    } catch (error) {
      console.error('Error processing response:', error);
      this.updateConversationHistory('I didn\'t quite understand that. Could you please try again?', 'assistant');
    }
  }

  async completeConversation() {
    const summary = Object.keys(this.collectedData).length > 0
      ? `I've collected: ${JSON.stringify(this.collectedData, null, 2)}`
      : 'All done!';

    const message = `Perfect! ${summary} \n\n Your form is now complete and ready to submit.`;

    this.updateConversationHistory(message, 'assistant');

    return {
      message,
      isComplete: true,
      collectedData: this.collectedData,
    };
  }

  getProgress() {
    const totalFields = this.form ? this.form.getFillableFields().length : 0;
    const collectedCount = Object.keys(this.collectedData).length;
    return {
      current: collectedCount,
      total: totalFields,
      percentage: totalFields > 0 ? Math.round((collectedCount / totalFields) * 100) : 0,
    };
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  getCollectedData() {
    return { ...this.collectedData };
  }

  reset() {
    this.collectedData = {};
    this.conversationHistory = [];
    this.currentRequestedFields = null;
  }
}
