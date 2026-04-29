
## Gensyn AXL

### What worked
- Binary builds cleanly with Go 1.25.5
- TLS peering between two local nodes establishes correctly
- HTTP API (/topology, /recv) responds correctly
- Key generation with openssl works on Linux

### What doesn't work on bare metal
- Message delivery between two nodes on the same machine fails
- Error: "connect tcp [IPv6]:tcp_port: connection was refused"
- Root cause: gVisor userspace IPv6 overlay cannot route between
  two processes on the same host — needs separate network interfaces
- Solution: use Docker containers (each gets its own network interface)

### What is missing from docs
- The "Quick Two-Node Test" in official docs does not mention that
  message delivery requires internet connectivity or separate network
  interfaces. It appears to only work with Docker or two real machines.


## KeeperHub

### What worked
- MCP server builds and runs cleanly with pnpm
- SSE transport works correctly
- Tool calls succeed once session lifecycle is understood
- Workflow listing and AI generation both work
- Health endpoint responds correctly

### What was confusing
- The /message endpoint returns "Accepted" not the tool result
- Tool response comes back through the SSE stream, not the POST response
- This SSE response pattern is not documented clearly in the repo README
- The sessionId must be used while the SSE connection is still open
  — closing the connection before sending the message causes 404

### What is missing from docs
- No clear example of the full SSE → POST → SSE response cycle
- No Python client example — only Claude Code config shown
- The session lifecycle (session dies when SSE closes) is not mentioned

### Suggested improvement
- Add a Python example showing the correct SSE session flow
- Document that tool responses arrive via SSE stream, not HTTP response
