#!/usr/bin/env node

import express from "express";

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
  const result = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result;
}

/**
 * Start a simple HTTP server that provides MCP-like endpoints.
 */
async function main() {
  const app = express();
  app.use(express.json());
  
  // Enable CORS
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

  // Store active SSE connections
  const connections = new Map<string, any>();

  // MCP SSE endpoint for initial connection
  app.get('/sse', (req, res) => {
    console.log('SSE connection initiated');
    
    const sessionId = Math.random().toString(36).substring(7);
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });
    
    // Store connection
    connections.set(sessionId, res);
    
    // Send endpoint information as per MCP SSE spec
    const endpointInfo = {
      type: "endpoint",
      endpoint: `/sse?sessionId=${sessionId}`
    };
    
    res.write(`data: ${JSON.stringify(endpointInfo)}\n\n`);
    console.log(`SSE endpoint info sent for session ${sessionId}`);
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (connections.has(sessionId)) {
        try {
          res.write(`: keepalive\n\n`);
        } catch (e) {
          console.log(`Connection ${sessionId} closed`);
          connections.delete(sessionId);
          clearInterval(keepAlive);
        }
      } else {
        clearInterval(keepAlive);
      }
    }, 30000);
    
    req.on('close', () => {
      console.log(`SSE connection ${sessionId} closed`);
      connections.delete(sessionId);
      clearInterval(keepAlive);
    });
    
    req.on('error', () => {
      console.log(`SSE connection ${sessionId} error`);
      connections.delete(sessionId);
      clearInterval(keepAlive);
    });
  });

  // Handle MCP JSON-RPC calls via POST
  app.post('/sse', async (req, res) => {
    console.log('POST request received:', JSON.stringify(req.body, null, 2));
    
    try {
      const { method, params, id } = req.body;
      let result;
      
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {}
            },
            serverInfo: {
              name: "anki-mcp",
              version: "0.1.0"
            }
          };
          break;
          
        case 'tools/list':
          result = {
            tools: [
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
              {
                name: "listDecks",
                description: "Get the names of all decks from Anki",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "addNote",
                description: "Create a single note",
                inputSchema: {
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
                  },
                  required: ["deckName", "modelName", "fields"],
                },
              },
            ]
          };
          break;
          
        case 'tools/call':
          const { name, arguments: args } = params;
          
          switch (name) {
            case "getDueCards":
              let query = "is:due";
              if (args?.deckName) {
                query += ` deck:"${args.deckName}"`;
              }
              
              const cardIds = await ankiRequest<number[]>("findCards", { query });
              const cardsInfo = await ankiRequest<any[]>("cardsInfo", { cards: cardIds.slice(0, 10) });
              
              result = {
                content: [
                  {
                    type: "text",
                    text: `Found ${cardIds.length} due cards. Here are the first 10:\n${JSON.stringify(cardsInfo, null, 2)}`
                  }
                ]
              };
              break;
              
            case "listDecks":
              const decks = await ankiRequest<string[]>("deckNames");
              result = {
                content: [
                  {
                    type: "text", 
                    text: `Available decks: ${decks.join(", ")}`
                  }
                ]
              };
              break;
              
            case "addNote":
              const createdNoteId = await ankiRequest<number>("addNote", { note: args });
              result = {
                content: [
                  {
                    type: "text",
                    text: `Created note with ID: ${createdNoteId}`
                  }
                ]
              };
              break;
              
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
          break;
          
        case 'resources/list':
          result = { resources: [] };
          break;
          
        default:
          return res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${method}` },
            id
          });
      }
      
      console.log('Sending response:', JSON.stringify({ jsonrpc: "2.0", result, id }, null, 2));
      
      res.json({
        jsonrpc: "2.0",
        result,
        id
      });
      
    } catch (error) {
      console.error('Error handling request:', error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: (error as Error).message },
        id: req.body.id
      });
    }
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
  });

  const port = 45453;
  app.listen(port, () => {
    console.log(`Simple Anki MCP HTTP server running on http://localhost:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/sse`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});