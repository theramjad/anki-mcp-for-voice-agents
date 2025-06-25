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
        name: "getNewCards",
        description: "Retrieve new (unlearned) cards from any deck that are available for learning",
        inputSchema: {
          type: "object",
          properties: {
            deckName: {
              type: "string",
              description: "Optional: Filter new cards by specific deck name. If omitted, returns new cards from all decks",
            },
          },
          description: "Finds cards that haven't been learned yet (new cards). Returns detailed card information including content, deck, and card data"
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
        name: "getNoteInfo",
        description: "Get detailed information about a specific note including all its fields",
        inputSchema: {
          type: "object",
          properties: {
            noteId: {
              type: "number",
              description: "The unique ID of the note to retrieve information for"
            }
          },
          required: ["noteId"],
          description: "Retrieves complete note information including fields, tags, model type, and associated cards"
        }
      },
      {
        name: "answerCard",
        description: "Answer a card with a specific difficulty rating during review",
        inputSchema: {
          type: "object",
          properties: {
            cardId: {
              type: "number",
              description: "The unique ID of the card to answer"
            },
            ease: {
              type: "number",
              enum: [1, 2, 3, 4],
              description: "Answer difficulty: 1=Again (failed), 2=Hard, 3=Good, 4=Easy"
            }
          },
          required: ["cardId", "ease"],
          description: "Simulates answering a card during review with the specified ease/difficulty rating"
        }
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

    case "getNewCards":
      let newQuery = "is:new";
      if (request.params.arguments?.deckName) {
        newQuery += ` deck:"${request.params.arguments.deckName}"`;
      }

      const newCardIds = await ankiRequest<number[]>("findCards", { query: newQuery });

      if (newCardIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                newCards: 0,
                deck: request.params.arguments?.deckName || "all decks",
                message: "No new cards available for learning"
              }, null, 2)
            }
          ]
        };
      }

      // Get detailed info for first 5 cards as examples
      const newCardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: newCardIds.slice(0, 5) });

      const newCardData = newCardsInfo.map(card => {
        return {
          noteId: card.note,
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
              totalNewCards: newCardIds.length,
              deck: request.params.arguments?.deckName || "all decks",
              remainingCards: Math.max(0, newCardIds.length - 5),
              sampleCards: newCardData
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
        return {
          noteId: card.note,
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

    case "getNoteInfo":
      const noteId = request.params.arguments?.noteId;
      const noteInfo = await ankiRequest<any[]>("notesInfo", { notes: [noteId] });

      if (!noteInfo || noteInfo.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Note not found",
                noteId: noteId
              }, null, 2)
            }
          ]
        };
      }

      const note = noteInfo[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              noteId: noteId,
              modelName: note.modelName,
              tags: note.tags,
              fields: note.fields,
              cards: note.cards
            }, null, 2)
          }
        ]
      };

    case "answerCard":
      const cardId = request.params.arguments?.cardId;
      const ease = request.params.arguments?.ease;

      await ankiRequest("answerCards", {
        answers: [{ cardId: cardId, ease: ease }]
      });

      const easeLabels = {
        1: "Again (failed)",
        2: "Hard",
        3: "Good",
        4: "Easy"
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              cardId: cardId,
              ease: ease,
              difficulty: easeLabels[ease as keyof typeof easeLabels],
              message: "Card answered successfully"
            }, null, 2)
          }
        ]
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
  console.error("Running server Version 0.1.0 - Simple Anki MCP server started with stdio transport");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});