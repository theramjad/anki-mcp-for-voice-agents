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
      
      // Group decks by main category
      const mainDecks = decks.filter(deck => !deck.includes("::"));
      const subDecks = decks.filter(deck => deck.includes("::"));
      
      // Group subdecks by parent
      const organized: Record<string, string[]> = {};
      subDecks.forEach(deck => {
        const parent = deck.split("::")[0];
        if (!organized[parent]) organized[parent] = [];
        organized[parent].push(deck);
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: "Anki Decks Summary",
              totalDecks: decks.length,
              mainDecks: mainDecks,
              organizedDecks: organized
            }, null, 2)
          }
        ]
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
              text: JSON.stringify({
                dueCards: 0,
                deck: request.params.arguments?.deckName || "all decks",
                message: "No cards currently due for review"
              }, null, 2)
            }
          ]
        };
      }
      
      // Get detailed info for first 5 cards as examples
      const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds.slice(0, 5) });
      
      const cardData = cardsInfo.map(card => {
        const fieldNames = Object.keys(card.fields);
        const primaryField = fieldNames.length > 0 ? card.fields[fieldNames[0]]?.value || "No content" : "No content";
        const cleanContent = primaryField.replace(/<[^>]*>/g, '').slice(0, 100);
        
        return {
          id: card.cardId,
          content: cleanContent,
          deck: card.deckName,
          model: card.modelName,
          reviews: card.reps,
          interval: card.interval,
          due: card.due
        };
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalDueCards: cardIds.length,
              deck: request.params.arguments?.deckName || "all decks",
              remainingCards: Math.max(0, cardIds.length - 5),
              sampleCards: cardData
            }, null, 2)
          }
        ]
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
            text: JSON.stringify({
              success: true,
              noteId: createdNoteId,
              deck: request.params.arguments?.deckName,
              model: request.params.arguments?.modelName,
              message: "Note added to Anki collection"
            }, null, 2)
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