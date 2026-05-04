# HTTP/SSE Transport Implementation

This document describes the HTTP/SSE transport feature added to the KeeperHub MCP server to enable remote access from AI agents.

## Overview

The server now supports two transport modes:

1. **Stdio Mode** (default): Traditional stdin/stdout communication for local MCP clients
2. **HTTP/SSE Mode**: Server-Sent Events over HTTP for remote AI agents

## Architecture

### Transport Detection

The server automatically selects the transport mode based on the `PORT` environment variable:

- If `PORT` is set: HTTP/SSE mode is enabled
- If `PORT` is not set: Stdio mode is used (default)

### HTTP Server Components

#### Files Modified

1. **src/index.ts**
   - Added support for dual transport modes
   - Added environment variable validation
   - Modified main function to branch on PORT value

2. **src/http-server.ts** (new)
   - Express-based HTTP server implementation
   - SSE transport setup using MCP SDK's SSEServerTransport
   - Session management for SSE connections
   - Authentication middleware

#### Endpoints

1. **GET /health**
   - Public health check endpoint
   - Returns server status and timestamp
   - No authentication required

2. **GET /sse**
   - Establishes SSE connection for MCP protocol
   - Requires Bearer token authentication
   - Returns session ID to client
   - Creates new SSEServerTransport instance

3. **POST /message**
   - Receives messages from client
   - Requires Bearer token authentication
   - Requires sessionId query parameter
   - Routes messages to appropriate transport session

### Authentication

All HTTP endpoints (except /health) require Bearer token authentication using the `MCP_API_KEY` environment variable.

Request format:
```
Authorization: Bearer <MCP_API_KEY>
```

Authentication errors:
- 401 Unauthorized: Missing or invalid Authorization header
- 403 Forbidden: Invalid API key

### Session Management

The HTTP server maintains a Map of active SSE sessions:

```typescript
sessions: Map<string, SSEServerTransport>
```

- Each SSE connection gets a unique session ID
- Session ID is used to route POST messages to correct transport
- Sessions are cleaned up when connections close

## Environment Variables

### Existing Variables

- `KEEPERHUB_API_KEY`: API key for authenticating with KeeperHub API (required)
- `KEEPERHUB_API_URL`: Base URL for KeeperHub API (default: https://app.keeperhub.com)

### New Variables

- `PORT`: Port number for HTTP server (optional, enables HTTP mode when set)
- `MCP_API_KEY`: API key for authenticating incoming MCP requests (required when PORT is set)

## Dependencies Added

- `express@^4.21.2`: HTTP server framework
- `@types/express@^5.0.2`: TypeScript types for Express

## Usage Examples

### Running in Stdio Mode (Default)

```bash
KEEPERHUB_API_KEY=kh_xxx pnpm start
```

### Running in HTTP Mode

```bash
PORT=3000 \
MCP_API_KEY=secure_key \
KEEPERHUB_API_KEY=kh_xxx \
pnpm start
```

### Docker with HTTP Mode

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e MCP_API_KEY=secure_key \
  -e KEEPERHUB_API_KEY=kh_xxx \
  keeperhub-mcp
```

### Testing Health Endpoint

```bash
curl -H "Authorization: Bearer secure_key" \
  http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-16T15:45:00.000Z"
}
```

## MCP SDK Integration

The implementation uses the official MCP SDK's SSE transport:

- `@modelcontextprotocol/sdk/server/sse.js`: SSEServerTransport class
- `@modelcontextprotocol/sdk/server/auth/types.js`: AuthInfo interface

### SSEServerTransport Usage

```typescript
const transport = new SSEServerTransport('/message', res);

transport.onclose = () => {
  // Cleanup session
};

transport.onerror = (error) => {
  // Handle error
};

await server.connect(transport);
await transport.start();
```

## Security Considerations

1. **Authentication**: All MCP requests require Bearer token authentication
2. **API Key Separation**:
   - `KEEPERHUB_API_KEY`: For server-to-KeeperHub communication
   - `MCP_API_KEY`: For client-to-server communication
3. **Session Isolation**: Each SSE session is isolated with unique session ID
4. **No CORS**: CORS is not configured (add if needed for browser clients)
5. **No Rate Limiting**: Consider adding rate limiting for production deployments

## Error Handling

The HTTP server handles errors at multiple levels:

1. **Authentication Errors**: Returned as 401/403 with JSON error message
2. **Session Not Found**: Returned as 404 when session ID is invalid
3. **Message Processing Errors**: Returned as 500 with error details
4. **SSE Connection Errors**: Logged to stderr, session cleaned up

## Testing

A test script is provided: `test-http-mode.sh`

```bash
./test-http-mode.sh
```

This script:
1. Starts server in HTTP mode
2. Tests health endpoint with authentication
3. Tests unauthorized access
4. Cleans up server process

## Future Enhancements

Potential improvements for production use:

1. **CORS Support**: Add CORS middleware for browser clients
2. **Rate Limiting**: Implement rate limiting per session/IP
3. **Session Timeouts**: Add automatic cleanup of stale sessions
4. **Metrics**: Add Prometheus metrics for monitoring
5. **Logging**: Structured logging with correlation IDs
6. **TLS/HTTPS**: Add HTTPS support for production deployments
7. **Health Check Details**: Expand health check to include connectivity status

## Backwards Compatibility

The implementation maintains full backwards compatibility:

- Existing stdio-based deployments continue to work unchanged
- HTTP mode is opt-in via PORT environment variable
- All existing tools and resources function identically in both modes
- No changes to MCP protocol or tool interfaces

## Migration Guide

To migrate from stdio to HTTP mode:

1. Set `PORT` environment variable
2. Set `MCP_API_KEY` for authentication
3. Update deployment to expose port (e.g., Docker port mapping)
4. Update client configuration to use HTTP transport instead of stdio
5. Configure firewall/network to allow inbound connections

No code changes required to existing tools or resources.
