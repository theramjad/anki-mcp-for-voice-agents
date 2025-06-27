# Anki MCP Server for Voice Agents

A Model Context Protocol (MCP) server that enables AI voice agents to interact with Anki flashcards through the AnkiConnect plugin. This project allows you to review your Anki flashcards hands-free using voice commands with AI assistants like [11.ai](https://11.ai).

## 🎯 Use Cases

- **Hands-free flashcard review** while walking, exercising, or multitasking
- **Voice-only studying** when you can't look at a screen
- **Interactive learning** with AI explanations and additional context
- **Audio-based spaced repetition** for improved retention

## ✨ Features

### Voice Agent Integration
- Review flashcards using natural voice commands
- Mark cards as easy, good, hard, or again through speech
- Get due and new card counts by deck
- Seamless integration with voice AI assistants

### MCP Tools
- `listDecks` - Get all available Anki decks with organized structure
- `getDueCards` - Retrieve cards currently due for review (optionally filtered by deck)
- `getNewCards` - Get unlearned cards available for study (optionally filtered by deck)
- `getNoteInfo` - Get detailed information about specific notes
- `answerCard` - Mark cards with difficulty ratings (1=Again, 2=Hard, 3=Good, 4=Easy)

## 🚀 Quick Start

### Prerequisites

1. **Install Anki** and the **AnkiConnect plugin**:
   - Download AnkiConnect from [ankiweb.net/shared/info/2055492159](https://ankiweb.net/shared/info/2055492159)
   - In Anki: Tools → Add-ons → Get Add-ons → Paste code: `2055492159`
   - Restart Anki

2. **Install Node.js and npm** if not already installed

### Installation

1. **Download this project**:
   ```bash
   # Clone or download the repository
   git clone <repository-url>
   cd anki-mcp-for-voice-agents
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## 🎙️ Voice Agent Setup (11.ai)

### Step 1: Start the MCP Server

1. **Make sure Anki is running** (required for AnkiConnect to work)

2. **Start the MCP server**:
   ```bash
   npm run start
   ```
   
   This will start the server on port 45453 with an SSE endpoint at `/sse`

### Step 2: Expose Server with ngrok

1. **Install ngrok** from [ngrok.com](https://ngrok.com)

2. **Expose your server to the internet**:
   ```bash
   # For a temporary URL
   ngrok http 45453
   
   # For a static domain (after creating one in ngrok dashboard)
   ngrok http --domain=your-static-domain.ngrok-free.app 45453
   ```

3. **Copy the ngrok URL** (e.g., `https://abc123.ngrok-free.app`)

### Step 3: Configure 11.ai

1. Go to [11.ai](https://11.ai) and create an account
2. Navigate to **Settings** → **Custom MCP Servers**
3. Click **Add Server** and configure:
   - **Name**: `Anki Flashcards`
   - **Server Type**: `SSE`
   - **URL**: `https://your-ngrok-url.ngrok-free.app/sse`
   - **Tool Approval**: Set to "No approval" for seamless experience
4. **Save** and verify the connection shows as online (green light)

### Step 4: Add the Voice Agent Prompt

In 11.ai Settings, set your assistant prompt to something like:

```
You're a world-class Anki flashcard tutor with access to the user's Anki deck through MCP tools. Help users review their flashcards by:

1. Asking which deck they want to study
2. Getting due or new cards from that deck
3. Reading the question/prompt to them
4. Listening to their answer
5. Providing the correct answer and asking how difficult it was
6. Marking the card accordingly (1=Again, 2=Hard, 3=Good, 4=Easy)

Be encouraging and provide helpful explanations when they get things wrong. If they have questions about topics, you can search the web for additional context.

Always let them know how many cards are remaining in their session.
```

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install

# Build and watch for changes
npm run watch

# Start the server
npm run start
```

### Testing with MCP Inspector
```bash
npm run inspector
```

## 📋 Requirements

- **Anki** must be running during voice sessions
- **AnkiConnect plugin** must be installed and enabled
- **Node.js** 18+ and npm
- **Internet connection** for ngrok and voice agent services

## ⚠️ Limitations

- **Image cards**: Voice agents cannot see images in flashcards - you'll need to skip these or describe them verbally
- **Complex formatting**: Rich text formatting may not be read clearly by voice agents
- **Uptime**: Your computer must be running with Anki open for remote voice sessions

## 🔧 Troubleshooting

1. **"No cards due"**: Make sure you have due cards in Anki and the deck name matches exactly
2. **Connection failed**: Verify Anki is running and AnkiConnect is installed
3. **ngrok timeout**: Restart the ngrok tunnel if the connection drops
4. **Voice agent not responding**: Check that the MCP server shows as online in 11.ai settings

## 🤝 Contributing

This project was created to demonstrate voice-based Anki integration. Feel free to submit issues or pull requests to improve the functionality.

## 📺 Demo

Watch the full setup and demo video: [A NEW Way to Use Anki: AI Voice Agents](https://www.youtube.com/watch?v=r8jm0f3Y1PM)
