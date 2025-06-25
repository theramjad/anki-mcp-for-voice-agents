#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Make a request to the AnkiConnect API
 */
async function ankiRequest<T>(action: string, params: any = {}): Promise<T> {
  const response = await fetch("http://localhost:8765", {
    method: "POST",
    body: JSON.stringify({
      action,
      version: 6,
      params,
    }),
  });
  const { result } = (await response.json()) as { result: T; error: string };
  return result;
}

/**
 * Create an MCP server with capabilities for resources, tools, and prompts.
 */
const server = new Server(
  {
    name: "anki-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const noteParameters = {
  type: "object",
  properties: {
    deckName: {
      type: "string",
      description: "Name of the deck to add note to",
    },
    modelName: {
      type: "string",
      description: "Name of the note model/type to use",
    },
    fields: {
      type: "object",
      description: "Map of fields to the value in the note model being used",
    },
    tags: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Tags to apply to the note",
    },
  },
  required: ["deckName", "modelName", "fields"],
};

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "listDecks",
        description: "List all available Anki decks in your collection",
        inputSchema: { 
          type: "object", 
          properties: {},
          description: "No parameters required - returns all deck names" 
        },
      },
      {
        name: "getDueCards",
        description: "Retrieve cards that are currently due for review, with optional deck filtering",
        inputSchema: {
          type: "object",
          properties: {
            deckName: {
              type: "string",
              description: "Optional: Filter due cards by specific deck name. If omitted, returns due cards from all decks",
            },
          },
          description: "Finds cards scheduled for review today. Returns detailed card information including content, deck, and scheduling data"
        },
      },
      {
        name: "addNote",
        description: "Create a new flashcard note in your Anki collection",
        inputSchema: noteParameters,
      },
    ],
  };
});

/**
 * Handler for tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "listDecks":
      const decks = await ankiRequest<string[]>("deckNames");
      return {
        content: [
          {
            type: "text",
            text: `📚 Found ${decks.length} decks in your Anki collection:\n\n• ${decks.join("\n• ")}\n\nUse getDueCards with a specific deck name to see due cards from that deck.`,
          }
        ],
      };
      
    case "getDueCards":
      let query = "is:due";
      if (request.params.arguments?.deckName) {
        query += ` deck:"${request.params.arguments.deckName}"`;
      }
      
      const cardIds = await ankiRequest<number[]>("findCards", { query });
      
      if (cardIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🎉 No cards are due for review${request.params.arguments?.deckName ? ` in deck "${request.params.arguments.deckName}"` : ''}!`,
            }
          ],
        };
      }
      
      // Get detailed info for first 5 cards as examples
      const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds.slice(0, 5) });
      
      const deckFilter = request.params.arguments?.deckName ? ` from deck "${request.params.arguments.deckName}"` : " from all decks";
      const summary = `📝 Found ${cardIds.length} cards due for review${deckFilter}\n\nShowing details for first 5 cards:\n\n`;
      
      const cardDetails = cardsInfo.map((card, index) => {
        const deckName = card.deckName;
        const modelName = card.modelName;
        const fieldNames = Object.keys(card.fields);
        const primaryField = fieldNames.length > 0 ? card.fields[fieldNames[0]]?.value || "No content" : "No content";
        
        return `${index + 1}. Deck: ${deckName}\n   Model: ${modelName}\n   Content: ${primaryField.replace(/<[^>]*>/g, '').slice(0, 100)}${primaryField.length > 100 ? '...' : ''}\n   Due: ${card.due} | Reps: ${card.reps} | Interval: ${card.interval} days`;
      }).join('\n\n');
      
      return {
        content: [
          {
            type: "text",
            text: summary + cardDetails + (cardIds.length > 5 ? `\n\n... and ${cardIds.length - 5} more cards` : ''),
          }
        ],
      };
      
    case "addNote":
      const createdNoteId = await ankiRequest<number>(
        "addNote",
        { note: request.params.arguments },
      );
      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created new note with ID: ${createdNoteId}\n\nThe note has been added to your Anki collection and will appear in your review queue according to your deck settings.`,
          }
        ],
      };

    default:
      throw new Error("Unknown tool");
  }
});

// Minimal resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

server.setRequestHandler(ReadResourceRequestSchema, async () => {
  throw new Error("No resources available");
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Simple Anki MCP server started with stdio transport");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});