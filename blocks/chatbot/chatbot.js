/* eslint-disable class-methods-use-this */
import Conversational from './conversational.js';

class ChatBot extends EventTarget {
  constructor(element) {
    super();
    this.element = element;
    this.messagesContainer = null;
    this.inputElement = null;
    this.voiceButton = null;
    this.sendButton = null;
    this.isRecording = false;
    this.speechRecognition = null;
    this.speechSynthesis = window.speechSynthesis;
    this.messageQueue = [];
    this.messageHandlers = new Map();
    this.conversationData = {}; // Store conversation form data
    this.pendingImageFile = null;
    this.previewContainer = null;
    this.systemMessagesContainer = null;
    this.systemMessagesContent = null;
    this.toggleSystemBtn = null;
    this.closeBtn = null;
    this.init();
  }

  init() {
    this.setupHTML();
    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.setupMessageHandlers();
    this.showWelcomeMessage();
  }

  setupHTML() {
    this.element.innerHTML = `
      <div id="system-messages-container" class="system-messages-container">
        <h4>System Logs</h4>
        <div id="system-messages-content" class="system-messages-content"></div>
      </div>
      <div class="chatbot-header">
        <div class="chatbot-status"></div>
        <h3>AI Assistant</h3>
        <button id="toggle-system-btn" class="toggle-system-messages-button" title="Toggle System Messages">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </button>
        <button id="chatbot-close-btn" class="chatbot-close-button">&times;</button>
      </div>
      <div class="chatbot-messages" id="chatbot-messages">
        <!-- Messages will be added here -->
      </div>
      <div id="image-preview-container" style="display:none;"></div>
      <div class="chatbot-input-area">
        <div class="chatbot-input-container">
          <textarea 
            class="chatbot-input" 
            id="chatbot-input"
            placeholder="Type your message or click the microphone..."
            rows="1"
          ></textarea>
          <button class="upload-button" id="upload-button" title="Upload image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"></path>
            </svg>
          </button>
          <button class="voice-button" id="voice-button" title="Voice input">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
            </svg>
          </button>
        </div>
        <button class="send-button" id="send-button" title="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
      <input type="file" id="image-upload-input" style="display:none;" accept="image/*" />
    `;

    this.messagesContainer = this.element.querySelector('#chatbot-messages');
    this.inputElement = this.element.querySelector('#chatbot-input');
    this.voiceButton = this.element.querySelector('#voice-button');
    this.sendButton = this.element.querySelector('#send-button');
    this.uploadButton = this.element.querySelector('#upload-button');
    this.imageUploadInput = this.element.querySelector('#image-upload-input');
    this.previewContainer = this.element.querySelector('#image-preview-container');
    this.systemMessagesContainer = this.element.querySelector('#system-messages-container');
    this.systemMessagesContent = this.element.querySelector('#system-messages-content');
    this.toggleSystemBtn = this.element.querySelector('#toggle-system-btn');
    this.closeBtn = this.element.querySelector('#chatbot-close-btn');
  }

  setupEventListeners() {
    // Send message on Enter key
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleUserInput();
      }
    });

    // Auto-resize textarea
    this.inputElement.addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    });

    // Send button click
    this.sendButton.addEventListener('click', () => {
      this.handleUserInput();
    });

    // Voice button click
    this.voiceButton.addEventListener('click', () => {
      this.toggleVoiceRecording();
    });

    // Upload button click
    this.uploadButton.addEventListener('click', () => {
      this.imageUploadInput.click();
    });

    // Handle image upload
    this.imageUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImageUpload(file);
      }
    });

    this.toggleSystemBtn.addEventListener('click', () => {
      this.systemMessagesContainer.classList.toggle('visible');
    });

    this.closeBtn.addEventListener('click', () => {
      this.element.dispatchEvent(new CustomEvent('close-request', { bubbles: true, composed: true }));
    });
  }

  setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        if (result.isFinal) {
          this.inputElement.value = result[0].transcript;
          this.stopVoiceRecording();
          this.handleUserInput();
        }
      };

      this.speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.stopVoiceRecording();
      };

      this.speechRecognition.onend = () => {
        this.stopVoiceRecording();
      };
    }
  }

  startConversationalForm(formUrl) {
    this.conversational = new Conversational();
    this.conversational.start(formUrl || this.formUrl);
    this.conversational.addEventListener('conversationUpdated', (e) => {
      this.postMessage(e.detail);
    });

    this.addEventListener('messageReceived', (e) => {
      this.conversational.processUserResponse(e.detail.content);
    });
  }

  setupMessageHandlers() {
    // Register default message type handlers
    this.messageHandlers.set('text', this.renderTextMessage.bind(this));
    this.messageHandlers.set('html', this.renderHtmlMessage.bind(this));
    this.messageHandlers.set('boolean', this.renderBooleanMessage.bind(this));
    this.messageHandlers.set('choice', this.renderChoiceMessage.bind(this));
    this.messageHandlers.set('field', this.renderFieldMessage.bind(this));
    this.messageHandlers.set('typing', this.renderTypingMessage.bind(this));
    this.messageHandlers.set('image_with_text', this.renderImageWithTextMessage.bind(this));
  }

  /**
   * Post a message to the chatbot
   * @param {Object} messageData - The message data
   */
  postMessage = async (messageData) => {
    const message = {
      id: messageData.id || this.generateMessageId(),
      type: messageData.type || 'text',
      sender: messageData.sender || 'assistant',
      content: messageData.content || '',
      image: messageData.image || null,
      field: messageData.field || null,
      boolean: messageData.boolean || null,
      choices: messageData.choices || null,
      onSubmit: messageData.onSubmit || null,
      timestamp: new Date(),
    };

    this.messageQueue.push(message);
    await this.renderMessage(message);
    this.scrollToBottom();

    return message.id;
  };

  /**
   * Receive a message from the user
   */
  async receivedMessage(content, options = {}) {
    if (content.sender === 'user' && content.content.includes('start')) {
      content.type = 'command';
      this.startConversationalForm();
    }
    // Post user message
    this.postMessage({
      ...content,
      ...options,
    });

    this.dispatchEvent(new CustomEvent('messageReceived', {
      detail: {
        content,
        options,
      },
    }));
  }

  async renderMessage(message) {
    if (message.sender === 'system') {
      this.renderSystemMessage(message);
      return;
    }
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(message);
    } else {
      console.warn(`No handler found for message type: ${message.type}`);
      this.renderTextMessage(message);
    }
  }

  renderTextMessage(message) {
    const messageElement = this.createMessageElement(message);
    const bubble = messageElement.querySelector('.message-bubble');

    bubble.innerHTML = `
      <div class="message-content">${message.content}</div>
      ${this.createTimestamp(message.timestamp)}
    `;

    this.messagesContainer.appendChild(messageElement);
  }

  renderHtmlMessage(message) {
    const messageElement = this.createMessageElement(message);
    const bubble = messageElement.querySelector('.message-bubble');

    bubble.innerHTML = `
      <div class="message-content">${message.content}</div>
      ${this.createTimestamp(message.timestamp)}
    `;

    this.messagesContainer.appendChild(messageElement);
  }

  async renderBooleanMessage(message) {
    const messageElement = this.createMessageElement(message);
    const bubble = messageElement.querySelector('.message-bubble');

    // Create boolean container
    const booleanContainer = document.createElement('div');
    booleanContainer.className = 'boolean-container';

    // Add question/content
    if (message.content) {
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content';
      contentElement.textContent = message.content;
      booleanContainer.appendChild(contentElement);
    }

    // Create boolean buttons
    const buttonsElement = await this.createBooleanButtons(message.field);
    booleanContainer.appendChild(buttonsElement);

    bubble.appendChild(booleanContainer);
    bubble.appendChild(this.createTimestampElement(message.timestamp));

    this.messagesContainer.appendChild(messageElement);
  }

  async renderChoiceMessage(message) {
    const messageElement = this.createMessageElement(message);
    const bubble = messageElement.querySelector('.message-bubble');

    // Create choice container
    const choiceContainer = document.createElement('div');
    choiceContainer.className = 'choice-container';

    // Add question/content
    if (message.content) {
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content';
      contentElement.textContent = message.content;
      choiceContainer.appendChild(contentElement);
    }

    // Create choice buttons
    const choicesElement = await this.createChoiceButtons(message.field);
    choiceContainer.appendChild(choicesElement);

    bubble.appendChild(choiceContainer);
    bubble.appendChild(this.createTimestampElement(message.timestamp));

    this.messagesContainer.appendChild(messageElement);
  }

  async renderFieldMessage(message) {
    const messageElement = this.createMessageElement(message);
    const bubble = messageElement.querySelector('.message-bubble');

    // Create field container
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'field-container';

    // Add question/content
    if (message.content) {
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content';
      contentElement.textContent = message.content;
      fieldContainer.appendChild(contentElement);
    }

    // Create the input field
    const fieldElement = await this.createSingleField(message.field);
    fieldContainer.appendChild(fieldElement);

    bubble.appendChild(fieldContainer);
    bubble.appendChild(this.createTimestampElement(message.timestamp));

    this.messagesContainer.appendChild(messageElement);

    // Focus on the input field
    setTimeout(() => {
      const input = fieldElement.querySelector('input, select, textarea');
      if (input) {
        input.focus();
      }
    }, 100);
  }

  renderTypingMessage(message) {
    const messageElement = this.createMessageElement(message);
    messageElement.classList.add('typing-indicator');

    const bubble = messageElement.querySelector('.message-bubble');
    bubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;

    this.messagesContainer.appendChild(messageElement);
  }

  renderImageWithTextMessage(msg) {
    const messageElement = this.createMessageElement(msg);
    const bubble = messageElement.querySelector('.message-bubble');

    const imageUrl = msg.image instanceof Blob ? URL.createObjectURL(msg.image) : msg.image;

    bubble.innerHTML = `
      <div class="message-content image-with-text-content">
        <img src="${imageUrl}" alt="User uploaded image" class="message-image">
        <div>${msg.content}</div>
      </div>
      ${this.createTimestamp(msg.timestamp)}
    `;

    this.messagesContainer.appendChild(messageElement);
  }

  createMessageElement(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-message ${message.sender}`;
    messageElement.dataset.messageId = message.id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    messageElement.appendChild(bubble);
    return messageElement;
  }

  async createBooleanButtons(field) {
    const container = document.createElement('div');
    container.className = 'boolean-buttons-container';

    const { name, enum: enumValues, enumNames } = field;

    // Use enum values if available, otherwise default to "on"/"off"
    let trueValue; let falseValue; let trueLabel; let
      falseLabel;

    if (enumValues && enumValues.length >= 2) {
      [trueValue, falseValue] = enumValues;
      trueLabel = enumNames && enumNames[0] ? enumNames[0] : trueValue;
      falseLabel = enumNames && enumNames[1] ? enumNames[1] : falseValue;
    } else {
      trueValue = 'on';
      falseValue = 'off';
      trueLabel = 'Yes';
      falseLabel = 'No';
    }

    // Create True button
    const trueButton = document.createElement('button');
    trueButton.type = 'button';
    trueButton.className = 'boolean-button true-button';
    trueButton.textContent = trueLabel;
    trueButton.dataset.value = trueValue;

    trueButton.addEventListener('click', () => {
      // Store the data
      this.conversationData[name] = trueValue;

      // Disable all buttons
      container.querySelectorAll('.boolean-button').forEach((btn) => {
        btn.disabled = true;
      });

      trueButton.classList.add('selected');
      container.style.opacity = '0.7';

      // Send message directly
      this.receivedMessage({
        type: 'text',
        sender: 'user',
        content: trueValue,
        field,
      });
    });

    // Create False button
    const falseButton = document.createElement('button');
    falseButton.type = 'button';
    falseButton.className = 'boolean-button false-button';
    falseButton.textContent = falseLabel;
    falseButton.dataset.value = falseValue;

    falseButton.addEventListener('click', () => {
      // Store the data
      this.conversationData[name] = falseValue;

      // Disable all buttons
      container.querySelectorAll('.boolean-button').forEach((btn) => {
        btn.disabled = true;
      });

      falseButton.classList.add('selected');
      container.style.opacity = '0.7';

      // Send message directly
      this.receivedMessage({
        type: 'text',
        sender: 'user',
        content: falseValue,
        field,
      });
    });

    container.appendChild(trueButton);
    container.appendChild(falseButton);

    return container;
  }

  async createSingleField(field) {
    const container = document.createElement('div');
    container.className = 'single-field-wrapper';

    // Import form utilities
    const {
      createInput, setConstraints, setPlaceholder,
    } = await import('../form/util.js');

    // Use existing form utility to create input
    const inputElement = createInput(field);
    inputElement.className = 'field-input';

    // Apply constraints and placeholder using existing utilities
    setConstraints(inputElement, field);
    setPlaceholder(inputElement, field);

    // Set required attribute
    if (field.required) {
      inputElement.setAttribute('required', 'required');
    }

    // Handle special cases that need custom logic
    if (field.fieldType === 'drop-down') {
      // Use existing dropdown creation utility
      const { createDropdownUsingEnum } = await import('../form/util.js');
      createDropdownUsingEnum(field, inputElement);
    }

    // Create submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.className = 'field-submit-button';
    submitButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    `;

    // Handle submission
    const handleSubmit = () => {
      let value;
      const { name, fieldType, required } = field;

      if (fieldType === 'file-input') {
        value = inputElement.files;
      } else {
        value = inputElement.value.trim();
      }

      if (required && (!value || (fieldType !== 'file-input' && value === ''))) {
        inputElement.style.borderColor = '#ef4444';
        inputElement.focus();
        return;
      }

      inputElement.style.borderColor = '';

      // Store the data
      this.conversationData[name] = value;

      // Disable the field
      inputElement.disabled = true;
      submitButton.disabled = true;
      container.style.opacity = '0.7';

      // Send message directly
      this.receivedMessage({
        type: 'text',
        sender: 'user',
        content: value,
        field,
      });
    };

    // Event listeners
    submitButton.addEventListener('click', handleSubmit);

    inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && field.fieldType !== 'multiline-input') {
        e.preventDefault();
        handleSubmit();
      }
    });

    // Layout
    const inputContainer = document.createElement('div');
    inputContainer.className = 'field-input-container';
    inputContainer.appendChild(inputElement);
    inputContainer.appendChild(submitButton);

    container.appendChild(inputContainer);

    return container;
  }

  async createChoiceButtons(field) {
    const container = document.createElement('div');
    container.className = 'choice-buttons-container';

    const {
      fieldType, name, enum: enumValues, enumNames,
    } = field;
    const isMultiple = fieldType === 'checkbox-group';

    if (!isMultiple) {
      // Single selection - radio-like buttons
      enumValues.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-button single-choice';
        button.textContent = enumNames && enumNames[index] ? enumNames[index] : option;
        button.dataset.value = option;

        button.addEventListener('click', () => {
          const { value } = button.dataset;

          // Store the data
          this.conversationData[name] = value;

          // Disable all buttons
          container.querySelectorAll('.choice-button').forEach((btn) => {
            btn.disabled = true;
            btn.classList.remove('selected');
          });

          button.classList.add('selected');
          container.style.opacity = '0.7';

          // Send message directly
          this.receivedMessage({
            type: 'text',
            sender: 'user',
            content: value,
            field,
          });
        });

        container.appendChild(button);
      });
    } else {
      // Multiple selection - checkbox-like buttons
      const selectedValues = [];

      enumValues.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-button multiple-choice';
        button.innerHTML = `
          <span class="choice-checkbox">☐</span>
          <span class="choice-text">${enumNames && enumNames[index] ? enumNames[index] : option}</span>
        `;
        button.dataset.value = option;

        button.addEventListener('click', () => {
          const { value } = button.dataset;
          const checkbox = button.querySelector('.choice-checkbox');

          if (selectedValues.includes(value)) {
            // Remove from selection
            selectedValues.splice(selectedValues.indexOf(value), 1);
            button.classList.remove('selected');
            checkbox.textContent = '☐';
          } else {
            // Add to selection
            selectedValues.push(value);
            button.classList.add('selected');
            checkbox.textContent = '☑';
          }
        });

        container.appendChild(button);
      });

      // Add submit button for multiple choice
      const submitButton = document.createElement('button');
      submitButton.type = 'button';
      submitButton.className = 'choice-submit-button';
      submitButton.textContent = 'Submit Selection';

      submitButton.addEventListener('click', () => {
        // Store the data
        this.conversationData[name] = selectedValues;

        // Disable all buttons
        container.querySelectorAll('button').forEach((btn) => {
          btn.disabled = true;
        });

        container.style.opacity = '0.7';

        // Send message directly
        this.receivedMessage({
          type: 'text',
          sender: 'user',
          content: selectedValues,
          field,
        });
      });

      container.appendChild(submitButton);
    }

    return container;
  }

  createTimestamp(timestamp) {
    const timeString = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `<div class="message-timestamp">${timeString}</div>`;
  }

  createTimestampElement(timestamp) {
    const timestampElement = document.createElement('div');
    timestampElement.className = 'message-timestamp';
    timestampElement.textContent = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return timestampElement;
  }

  handleUserInput() {
    const text = this.inputElement.value.trim();
    const imageFile = this.pendingImageFile;

    if (!text && !imageFile) return;

    if (text && imageFile) {
      this.receivedMessage({
        type: 'image',
        sender: 'user',
        content: text,
        image: imageFile,
      });
    } else if (text) {
      this.receivedMessage({
        type: 'text',
        sender: 'user',
        content: text,
      });
    }

    // Clear input and preview
    this.inputElement.value = '';
    this.inputElement.style.height = 'auto';
    this.clearImagePreview();
  }

  handleImageUpload(file) {
    this.pendingImageFile = file;
    this.renderImagePreview();

    // Clear the file input for next upload
    this.imageUploadInput.value = '';
  }

  renderImagePreview() {
    this.previewContainer.innerHTML = '';
    if (this.pendingImageFile) {
      const previewImage = document.createElement('img');
      previewImage.src = URL.createObjectURL(this.pendingImageFile);
      previewImage.className = 'image-preview-thumb';

      const removeButton = document.createElement('button');
      removeButton.className = 'image-preview-remove';
      removeButton.innerHTML = '&times;';
      removeButton.onclick = () => this.clearImagePreview();

      this.previewContainer.appendChild(previewImage);
      this.previewContainer.appendChild(removeButton);
      this.previewContainer.style.display = 'flex';
    } else {
      this.previewContainer.style.display = 'none';
    }
  }

  clearImagePreview() {
    this.pendingImageFile = null;
    this.imageUploadInput.value = '';
    this.renderImagePreview();
  }

  generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  removeMessage(messageId) {
    const messageElement = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.remove();
    }
  }

  showWelcomeMessage() {
    this.postMessage({
      type: 'text',
      sender: 'assistant',
      content: "👋 Hello! I'm your smart form assistant. I'll help you fill out forms intelligently - using conversation service.\n\nType 'start' to begin or load a form to get started!",
    });
  }

  // Voice functionality
  toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopVoiceRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  startVoiceRecording() {
    if (!this.speechRecognition) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    this.isRecording = true;
    this.voiceButton.classList.add('recording');
    this.voiceButton.title = 'Stop recording';

    try {
      this.speechRecognition.start();
    } catch (error) {
      console.error('Speech recognition error:', error);
      this.stopVoiceRecording();
    }
  }

  stopVoiceRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.voiceButton.classList.remove('recording');
    this.voiceButton.title = 'Voice input';

    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 100);
  }

  // Public API methods
  clearMessages() {
    this.messagesContainer.innerHTML = '';
    this.messageQueue = [];
    this.conversationData = {};
    this.clearImagePreview();
    this.inputElement.placeholder = 'Type your message or click the microphone...';
  }

  renderSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = `» ${message.content}`;
    this.systemMessagesContent.appendChild(messageElement);
    this.systemMessagesContent.scrollTop = this.systemMessagesContent.scrollHeight;
  }
}

// Initialize chatbot when DOM is ready
export default function decorate(block) {
  const container = block.querySelector('a[href]');
  const chatbotBlock = document.createElement('div');
  chatbotBlock.className = 'chatbot-block';

  // Create the popup wrapper and launcher
  const popupWrapper = document.createElement('div');
  popupWrapper.className = 'chatbot-popup-wrapper';
  popupWrapper.id = 'chatbot-popup';

  const launcher = document.createElement('div');
  launcher.className = 'chatbot-launcher';
  launcher.id = 'chatbot-launcher';
  launcher.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
      </svg>
  `;

  // Move the newly created chatbot block into the popup and add to body
  popupWrapper.appendChild(chatbotBlock);
  document.body.appendChild(popupWrapper);
  container.replaceWith(launcher);

  const chatbot = new ChatBot(chatbotBlock);
  chatbot.formUrl = container.href;

  // Make chatbot instance available globally for demo purposes
  window.chatbot = chatbot;

  const openChatbot = () => {
    popupWrapper.classList.add('is-open');
    launcher.classList.add('is-hidden');
  };

  const closeChatbot = () => {
    popupWrapper.classList.remove('is-open');
    launcher.classList.remove('is-hidden');
  };

  launcher.addEventListener('click', openChatbot);
  chatbotBlock.addEventListener('close-request', closeChatbot);

  // Auto-focus on input when chatbot is visible
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          chatbot.inputElement?.focus();
        }, 500);
      }
    });
  });

  observer.observe(chatbotBlock);

  return chatbot;
}
