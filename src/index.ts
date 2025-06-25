#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import http from "http";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
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

type AnkiRequestResult<T> = {
  result: T;
  error: string;
};
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
  const { result } = (await response.json()) as AnkiRequestResult<T>;
  return result;
}

type DeckNamesToIds = Record<string, number>;
type ModelNamesToIds = Record<string, number>;

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const decks = await ankiRequest<DeckNamesToIds>("deckNamesAndIds");
  const models = await ankiRequest<ModelNamesToIds>("modelNamesAndIds");

  const deckResources = Object.entries(decks).map(([name, id]) => ({
    uri: `anki://decks/${id}`,
    name,
  }));

  const modelResources = Object.entries(models).map(([name, id]) => ({
    uri: `anki://models/${id}`,
    name,
  }));

  return {
    resources: deckResources.concat(modelResources),
  };
});

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (resource) => {
  const uri = resource.params.uri;

  if (uri.startsWith("anki://decks/")) {
    const deckId = parseInt(uri.replace("anki://decks/", ""));
    // TODO: return something real
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ deckId }),
        },
      ],
    };
  } else if (uri.startsWith("anki://models/")) {
    const modelId = parseInt(uri.replace("anki://models/", ""));
    const models = await ankiRequest<object>("findModelsById", {
      modelIds: [modelId],
    });
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(models),
        },
      ],
    };
  }
  throw new Error("resource not found");
});

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
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "listDecks",
        description: "Get the names of all decks from Anki",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "listModels",
        description: "Get the names of all note models from Anki",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "getModel",
        description:
          "Get a model, including field and template definitions, from Anki",
        inputSchema: {
          type: "object",
          properties: {
            modelName: {
              type: "string",
              description: "Name of the model to get",
            },
          },
        },
      },
      {
        name: "addNote",
        description: "Create a single note",
        inputSchema: noteParameters,
      },
      {
        name: "addNotes",
        description: "Create many notes in a deck",
        inputSchema: {
          type: "object",
          properties: {
            notes: {
              type: "array",
              description: "Notes to create",
              items: noteParameters,
            },
          },
        },
      },
      {
        name: "getDueCards",
        description: "Get cards that are due for review",
        inputSchema: {
          type: "object",
          properties: {
            deckName: {
              type: "string",
              description: "Optional deck name to filter due cards. If not provided, gets due cards from all decks",
            },
          },
        },
      },
    ],
  };
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "listDecks":
      const decks = await ankiRequest<string[]>("deckNames");

      return {
        toolResult: `Here is a list of the decks in the user's Anki collection: ${decks.join(", ")}`,
      };
    case "listModels":
      const models = await ankiRequest<string[]>("modelNames");

      return {
        toolResult: `Here is the list of note models in the user's Anki collection: ${models}`,
      };
    case "getModel":
      if (!request.params.arguments) {
        throw new Error("getModel requires a model name");
      }

      const modelNames = [request.params.arguments.modelName];

      const model = await ankiRequest<string[]>("findModelsByName", {
        modelNames,
      });

      return {
        toolResult: `Here is the ${request.params.arguments.modelName} in the user's Anki collection: ${JSON.stringify(model)}`,
      };
    case "addNotes":
      const createdNoteIds = await ankiRequest<number[]>(
        "addNotes",
        request.params.arguments,
      );
      return {
        toolResult: `Created notes with the following IDs: ${createdNoteIds.join(", ")}`,
      };
    case "addNote":
      const createdNoteId = await ankiRequest<number>(
        "addNote",
        { note: request.params.arguments },
      );
      return {
        toolResult: `Created note with the following ID: ${createdNoteId}`,
      };
    case "getDueCards":
      let query = "is:due";
      if (request.params.arguments?.deckName) {
        query += ` deck:"${request.params.arguments.deckName}"`;
      }
      
      const cardIds = await ankiRequest<number[]>("findCards", { query });
      const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds });
      
      return {
        toolResult: `Found ${cardIds.length} due cards: ${JSON.stringify(cardsInfo, null, 2)}`,
      };

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using HTTP on port 45453 with both MCP SSE transport and HTTP API.
 */
async function main() {
  const app = express();
  app.use(express.json());
  
  // Enable CORS for the MCP Inspector
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  // Store active transports by session ID
  const transports = new Map<string, SSEServerTransport>();
  
  // SSE endpoint - establishes the connection
  app.get('/sse', async (req, res) => {
    console.log('SSE connection attempt started');
    try {
      console.log('Creating SSE transport...');
      const transport = new SSEServerTransport('/sse', res);
      console.log(`Transport created with session ID: ${transport.sessionId}`);
      
      // Store transport for POST routing
      transports.set(transport.sessionId, transport);
      
      // Set up event handlers
      transport.onclose = () => {
        transports.delete(transport.sessionId);
        console.log(`SSE connection closed for session ${transport.sessionId}`);
      };
      
      transport.onerror = (error) => {
        console.error('Transport error:', error);
      };
      
      console.log('Creating connection server...');
      // Create a new server instance for this transport connection
      const connectionServer = new Server(
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
      console.log('Connection server created');
      
      // Set up all the handlers for this connection server
      console.log('Setting up request handlers...');
      connectionServer.setRequestHandler(ListResourcesRequestSchema, async () => {
        console.log('ListResourcesRequestSchema handler called');
        try {
          const decks = await ankiRequest<DeckNamesToIds>("deckNamesAndIds");
          const models = await ankiRequest<ModelNamesToIds>("modelNamesAndIds");

          const deckResources = Object.entries(decks).map(([name, id]) => ({
            uri: `anki://decks/${id}`,
            name,
          }));

          const modelResources = Object.entries(models).map(([name, id]) => ({
            uri: `anki://models/${id}`,
            name,
          }));

          return {
            resources: deckResources.concat(modelResources),
          };
        } catch (error) {
          console.error('Error in ListResourcesRequestSchema handler:', error);
          throw error;
        }
      });
      
      connectionServer.setRequestHandler(ReadResourceRequestSchema, async (resource) => {
        const uri = resource.params.uri;

        if (uri.startsWith("anki://decks/")) {
          const deckId = parseInt(uri.replace("anki://decks/", ""));
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify({ deckId }),
              },
            ],
          };
        } else if (uri.startsWith("anki://models/")) {
          const modelId = parseInt(uri.replace("anki://models/", ""));
          const models = await ankiRequest<object>("findModelsById", {
            modelIds: [modelId],
          });
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(models),
              },
            ],
          };
        }
        throw new Error("resource not found");
      });
      
      connectionServer.setRequestHandler(ListToolsRequestSchema, async () => {
        console.log('ListToolsRequestSchema handler called');
        try {
          const tools = [
            {
              name: "listDecks",
              description: "Get the names of all decks from Anki",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "listModels",
              description: "Get the names of all note models from Anki",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "getModel",
              description: "Get a model, including field and template definitions, from Anki",
              inputSchema: {
                type: "object",
                properties: {
                  modelName: {
                    type: "string",
                    description: "Name of the model to get",
                  },
                },
              },
            },
            {
              name: "addNote",
              description: "Create a single note",
              inputSchema: noteParameters,
            },
            {
              name: "addNotes",
              description: "Create many notes in a deck",
              inputSchema: {
                type: "object",
                properties: {
                  notes: {
                    type: "array",
                    description: "Notes to create",
                    items: noteParameters,
                  },
                },
              },
            },
            {
              name: "getDueCards",
              description: "Get cards that are due for review",
              inputSchema: {
                type: "object",
                properties: {
                  deckName: {
                    type: "string",
                    description: "Optional deck name to filter due cards. If not provided, gets due cards from all decks",
                  },
                },
              },
            },
          ];
          console.log(`Returning ${tools.length} tools`);
          return { tools };
        } catch (error) {
          console.error('Error in ListToolsRequestSchema handler:', error);
          throw error;
        }
      });
      
      connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        switch (request.params.name) {
          case "listDecks":
            const decks = await ankiRequest<string[]>("deckNames");
            return {
              toolResult: `Here is a list of the decks in the user's Anki collection: ${decks.join(", ")}`,
            };
          case "listModels":
            const models = await ankiRequest<string[]>("modelNames");
            return {
              toolResult: `Here is the list of note models in the user's Anki collection: ${models}`,
            };
          case "getModel":
            if (!request.params.arguments) {
              throw new Error("getModel requires a model name");
            }
            const modelNames = [request.params.arguments.modelName];
            const model = await ankiRequest<string[]>("findModelsByName", {
              modelNames,
            });
            return {
              toolResult: `Here is the ${request.params.arguments.modelName} in the user's Anki collection: ${JSON.stringify(model)}`,
            };
          case "addNotes":
            const createdNoteIds = await ankiRequest<number[]>(
              "addNotes",
              request.params.arguments,
            );
            return {
              toolResult: `Created notes with the following IDs: ${createdNoteIds.join(", ")}`,
            };
          case "addNote":
            const createdNoteId = await ankiRequest<number>(
              "addNote",
              { note: request.params.arguments },
            );
            return {
              toolResult: `Created note with the following ID: ${createdNoteId}`,
            };
          case "getDueCards":
            let query = "is:due";
            if (request.params.arguments?.deckName) {
              query += ` deck:"${request.params.arguments.deckName}"`;
            }
            
            const cardIds = await ankiRequest<number[]>("findCards", { query });
            const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds });
            
            return {
              toolResult: `Found ${cardIds.length} due cards: ${JSON.stringify(cardsInfo, null, 2)}`,
            };
          default:
            throw new Error("Unknown tool");
        }
      });
      
      console.log('Connecting server to transport...');
      // Connect the connection server to this transport
      await connectionServer.connect(transport);
      console.log('Server connected to transport');
      
      console.log('Starting SSE transport...');
      // Start the SSE connection
      await transport.start();
      console.log(`SSE connection started successfully for session ${transport.sessionId}`);
    } catch (error) {
      console.error('Error starting SSE connection:', error);
      console.error('Error stack:', (error as Error).stack);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start SSE connection', details: (error as Error).message });
      }
    }
  });
  
  // POST endpoint - receives messages from client
  app.post('/sse', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error('Error handling POST message:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to handle message' });
      }
    }
  });
  
  // Create a simple HTTP API for Anki operations (for direct access)
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
  });
  
  app.get('/decks', async (req, res) => {
    try {
      const decks = await ankiRequest<string[]>("deckNames");
      res.json({ decks });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get decks' });
    }
  });
  
  app.get('/due-cards', async (req, res) => {
    try {
      const deckName = req.query.deck as string;
      let query = "is:due";
      if (deckName) {
        query += ` deck:"${deckName}"`;
      }
      
      const cardIds = await ankiRequest<number[]>("findCards", { query });
      const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds });
      
      res.json({ 
        count: cardIds.length, 
        cards: cardsInfo.map(card => ({
          id: card.cardId,
          question: card.question,
          answer: card.answer,
          deckName: card.deckName,
          due: card.due
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get due cards' });
    }
  });
  
  app.post('/add-note', async (req, res) => {
    try {
      const { deckName, modelName, fields, tags } = req.body;
      const createdNoteId = await ankiRequest<number>("addNote", {
        note: { deckName, modelName, fields, tags }
      });
      res.json({ noteId: createdNoteId });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add note' });
    }
  });
  
  const port = 45453;
  app.listen(port, () => {
    console.log(`Anki MCP server running on http://localhost:${port}`);
    console.log(`MCP SSE endpoint: http://localhost:${port}/sse`);
    console.log('Available HTTP API endpoints:');
    console.log('  GET /health - Health check');
    console.log('  GET /decks - List all decks');
    console.log('  GET /due-cards?deck=<name> - Get due cards (optionally filtered by deck)');
    console.log('  POST /add-note - Add a new note');
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
