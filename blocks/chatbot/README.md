# Enhanced Conversational Form

This project provides an enhanced conversational form experience that groups similar form fields and asks for information in a natural, conversational manner instead of asking questions one at a time.

## Features

### 🤖 Intelligent Field Grouping
- **LLM-powered categorization**: Uses the browser's LanguageModel API to automatically group related form fields
- **Semantic understanding**: Groups fields by topic (personal info, contact details, preferences, etc.)
- **Fallback grouping**: If LLM fails, falls back to simple type-based grouping

### 💬 Natural Conversation Flow
- **Conversational prompts**: Creates natural, friendly messages instead of formal form labels
- **Multi-field collection**: Asks for related information together in one conversation turn
- **Context-aware responses**: Understands and processes user responses intelligently
- **Follow-up questions**: Asks for clarification when needed

### 🔄 Smart Data Extraction
- **Natural language processing**: Extracts field values from conversational responses
- **Multiple field handling**: Can extract multiple field values from a single user response
- **Form integration**: Automatically updates the underlying form fields

### 📊 Progress Tracking
- **Visual progress bar**: Shows completion progress across field groups
- **Conversation history**: Maintains full conversation context
- **Form preview**: Real-time preview of collected data

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enhanced Conversational Form                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │  Form Parser    │    │  LLM Grouping   │    │ Conversation│  │
│  │                 │    │                 │    │  Manager    │  │
│  │ • Field parsing │    │ • Field         │    │ • Flow      │  │
│  │ • Type detection│    │   categorization│    │   control   │  │
│  │ • Validation    │    │ • Smart         │    │ • Response  │  │
│  │   rules         │    │   grouping      │    │   processing│  │
│  │                 │    │ • Fallback      │    │ • Data      │  │
│  └─────────────────┘    │   strategies    │    │   extraction│  │
│                         └─────────────────┘    └─────────────┘  │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │ Form Integration│    │ Browser LLM API │    │ UI Components│  │
│  │                 │    │                 │    │             │  │
│  │ • Field updates │    │ • Prompt        │    │ • Chat UI   │  │
│  │ • State sync    │    │   engineering   │    │ • Progress  │  │
│  │ • Validation    │    │ • Response      │    │   tracking  │  │
│  │ • Submission    │    │   parsing       │    │ • Form      │  │
│  │                 │    │                 │    │   preview   │  │
│  └─────────────────┘    └─────────────────┘    └─────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files Structure

```
blocks/chatbot/
├── conversational.js          # Main conversational form class
├── form.js                    # Form parsing and field management
├── README.md                  # This documentation
└── chatbot.js                 # Original chatbot implementation

aem-forms/
├── conversational-form-demo.html  # Demo page
├── sample-form.json              # Sample form for testing
```

## Usage

### Basic Usage

```javascript
import Form from './blocks/chatbot/form.js';
import Conversational from './blocks/chatbot/conversational.js';

// Create form instance
const form = new Form('path/to/form.json');

// Create conversational instance
const conversational = new Conversational(form);

// Initialize and start conversation
await conversational.init();
await conversational.start();

// Process user responses
const response = await conversational.processUserResponse(userInput);
console.log(response.message); // Display to user
```

### Advanced Usage

```javascript
// Get progress information
const progress = conversational.getProgress();
console.log(`Progress: ${progress.percentage}%`);

// Get conversation history
const history = conversational.getConversationHistory();

// Get collected data
const data = conversational.getCollectedData();

// Reset conversation
conversational.reset();
```

## How It Works

### 1. Form Analysis
The system first analyzes the form structure to extract all fillable fields:
- Identifies field types (text, email, select, etc.)
- Collects field metadata (labels, descriptions, validation rules)
- Filters visible and enabled fields

### 2. Intelligent Grouping
Using the browser's LanguageModel API, the system groups related fields:
- **Personal Information**: Name, date of birth, personal details
- **Contact Information**: Email, phone, address
- **Preferences**: Selections, choices, preferences
- **Professional Information**: Company, job title, work details

### 3. Conversational Flow
For each group, the system:
- Creates natural conversation starters
- Processes user responses to extract field values
- Asks follow-up questions when needed
- Moves to the next group when complete

### 4. Data Extraction
The LLM analyzes user responses and:
- Identifies field values in natural language
- Maps values to specific form fields
- Handles multiple fields in one response
- Validates and formats data appropriately

## Example Conversation Flow

```
Assistant: Hi! I'd like to get some basic information about you first. 
           Could you tell me your name and date of birth?

User: My name is John Smith and I was born on January 15, 1990.