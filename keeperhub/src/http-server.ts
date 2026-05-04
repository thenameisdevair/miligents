import express, { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import crypto from 'crypto';

interface MCPRequest extends Request {
  auth?: AuthInfo;
}

export interface HTTPServerConfig {
  server: Server;
  port: number;
  apiKey: string;
}

let sessionCleanupInterval: NodeJS.Timeout | null = null;

function authMiddleware(apiKey: string) {
  return (req: MCPRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Invalid Authorization header format. Expected: Bearer <token>' });
      return;
    }

    // Use constant-time comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(token);
    const apiKeyBuffer = Buffer.from(apiKey);

    if (tokenBuffer.length !== apiKeyBuffer.length || !crypto.timingSafeEqual(tokenBuffer, apiKeyBuffer)) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    req.auth = {
      token,
      clientId: 'mcp-client',
      scopes: [],
    };
    next();
  };
}

interface SessionMetadata {
  transport: SSEServerTransport;
  lastActivity: number;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function createHTTPServer(config: HTTPServerConfig): express.Application {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  const sessions = new Map<string, SessionMetadata>();

  // Clear any existing cleanup interval
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
  }

  // Session cleanup interval (every 5 minutes)
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, metadata] of sessions.entries()) {
      if (now - metadata.lastActivity > SESSION_TIMEOUT_MS) {
        console.error(`Session timeout: ${sessionId}`);
        metadata.transport.close();
        sessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/sse', authMiddleware(config.apiKey), async (req: MCPRequest, res: Response) => {
    console.error('SSE connection request received');

    const transport = new SSEServerTransport('/message', res);

    // Set event handlers before adding to sessions to prevent race condition
    transport.onclose = () => {
      console.error(`SSE session closed: ${transport.sessionId}`);
      sessions.delete(transport.sessionId);
    };

    transport.onerror = (error) => {
      console.error(`SSE session error: ${transport.sessionId}`, error);
    };

    sessions.set(transport.sessionId, {
      transport,
      lastActivity: Date.now(),
    });

    try {
      // Note: connect() calls start() internally, don't call start() separately
      await config.server.connect(transport);
      console.error(`SSE session established: ${transport.sessionId}`);
    } catch (error) {
      console.error('Error establishing SSE connection:', error);
      sessions.delete(transport.sessionId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish SSE connection' });
      }
    }
  });

  app.post('/message', authMiddleware(config.apiKey), async (req: MCPRequest, res: Response) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const metadata = sessions.get(sessionId);

    if (!metadata) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Update last activity time
    metadata.lastActivity = Date.now();

    try {
      await metadata.transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling message:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process message' });
      }
    }
  });

  return app;
}

export function startHTTPServer(config: HTTPServerConfig): void {
  const app = createHTTPServer(config);

  app.listen(config.port, () => {
    console.error(`KeeperHub MCP server running on HTTP`);
    console.error(`Port: ${config.port}`);
    console.error(`Health check: http://localhost:${config.port}/health`);
    console.error(`SSE endpoint: http://localhost:${config.port}/sse`);
    console.error(`Message endpoint: http://localhost:${config.port}/message`);
  });
}
