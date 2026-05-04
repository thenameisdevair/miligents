#!/bin/bash

# Test script for HTTP/SSE mode

echo "Testing HTTP mode startup..."

# Set test environment variables
export KEEPERHUB_API_KEY="test_key_for_startup"
export KEEPERHUB_API_URL="https://app.keeperhub.com"
export PORT=3001
export MCP_API_KEY="test_mcp_key"

# Start the server in background
node dist/index.js &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Test health endpoint
echo -e "\nTesting health endpoint..."
curl -s -H "Authorization: Bearer test_mcp_key" http://localhost:3001/health | jq .

# Test unauthorized access
echo -e "\nTesting unauthorized access (should fail)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
echo "HTTP Status: $HTTP_CODE (should be 401)"

# Cleanup
echo -e "\nStopping server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo -e "\nTest complete!"
