
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

