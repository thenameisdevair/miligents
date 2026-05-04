# Deployment Guide

This guide covers deploying the KeeperHub MCP server in HTTP/SSE mode for remote access.

## Docker Deployment

### Build Image

```bash
docker build -t keeperhub-mcp:latest .
```

### Run HTTP Mode

```bash
docker run -d \
  --name keeperhub-mcp \
  -p 3000:3000 \
  -e PORT=3000 \
  -e MCP_API_KEY="your-secure-api-key" \
  -e KEEPERHUB_API_KEY="kh_your_keeperhub_key" \
  -e KEEPERHUB_API_URL="https://app.keeperhub.com" \
  keeperhub-mcp:latest
```

### Run Stdio Mode

```bash
docker run -i --rm \
  -e KEEPERHUB_API_KEY="kh_your_keeperhub_key" \
  keeperhub-mcp:latest
```

## Kubernetes Deployment

### ConfigMap

Create a ConfigMap for configuration:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: keeperhub-mcp-config
  namespace: default
data:
  KEEPERHUB_API_URL: "https://app.keeperhub.com"
  PORT: "3000"
```

### Secret

Create a Secret for sensitive data:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: keeperhub-mcp-secrets
  namespace: default
type: Opaque
stringData:
  KEEPERHUB_API_KEY: "kh_your_keeperhub_key"
  MCP_API_KEY: "your-secure-api-key"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keeperhub-mcp
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: keeperhub-mcp
  template:
    metadata:
      labels:
        app: keeperhub-mcp
    spec:
      containers:
      - name: mcp-server
        image: keeperhub-mcp:latest
        ports:
        - containerPort: 3000
          name: http
          protocol: TCP
        env:
        - name: KEEPERHUB_API_KEY
          valueFrom:
            secretKeyRef:
              name: keeperhub-mcp-secrets
              key: KEEPERHUB_API_KEY
        - name: MCP_API_KEY
          valueFrom:
            secretKeyRef:
              name: keeperhub-mcp-secrets
              key: MCP_API_KEY
        - name: PORT
          valueFrom:
            configMapKeyRef:
              name: keeperhub-mcp-config
              key: PORT
        - name: KEEPERHUB_API_URL
          valueFrom:
            configMapKeyRef:
              name: keeperhub-mcp-config
              key: KEEPERHUB_API_URL
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
            httpHeaders:
            - name: Authorization
              value: "Bearer $(MCP_API_KEY)"
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
            httpHeaders:
            - name: Authorization
              value: "Bearer $(MCP_API_KEY)"
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: keeperhub-mcp
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: keeperhub-mcp
  ports:
  - port: 3000
    targetPort: 3000
    protocol: TCP
    name: http
```

### Ingress (Optional)

For external access via Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: keeperhub-mcp
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: mcp.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: keeperhub-mcp
            port:
              number: 3000
  tls:
  - hosts:
    - mcp.yourdomain.com
    secretName: mcp-tls-secret
```

## Docker Compose

For local testing with Docker Compose:

```yaml
version: '3.8'

services:
  keeperhub-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - MCP_API_KEY=${MCP_API_KEY}
      - KEEPERHUB_API_KEY=${KEEPERHUB_API_KEY}
      - KEEPERHUB_API_URL=https://app.keeperhub.com
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "-H", "Authorization: Bearer ${MCP_API_KEY}", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

Usage:

```bash
# Create .env file
echo "MCP_API_KEY=your-secure-api-key" > .env
echo "KEEPERHUB_API_KEY=kh_your_keeperhub_key" >> .env

# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose down
```

## Environment Variables

Required for HTTP mode:

- `PORT`: Port number (e.g., 3000)
- `MCP_API_KEY`: API key for authenticating MCP requests
- `KEEPERHUB_API_KEY`: KeeperHub API key

Optional:

- `KEEPERHUB_API_URL`: KeeperHub API URL (default: https://app.keeperhub.com)

## Health Checks

The `/health` endpoint can be used for health checks:

```bash
curl -H "Authorization: Bearer your-mcp-api-key" \
  http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-16T15:45:00.000Z"
}
```

## Security Best Practices

1. **API Key Management**
   - Use strong, randomly generated API keys
   - Store keys in Kubernetes Secrets or environment variables
   - Rotate keys periodically
   - Never commit keys to version control

2. **Network Security**
   - Use TLS/HTTPS in production (via Ingress or reverse proxy)
   - Restrict network access using Network Policies
   - Use private networks when possible

3. **Container Security**
   - Run containers as non-root user
   - Use read-only root filesystem where possible
   - Scan images for vulnerabilities
   - Keep base images updated

4. **Monitoring**
   - Monitor health endpoint
   - Set up alerts for service availability
   - Track error rates and response times
   - Monitor resource usage

## Scaling Considerations

The server is stateless except for active SSE sessions:

- Can scale horizontally with multiple replicas
- Use sticky sessions or session affinity for SSE connections
- Consider using a load balancer with SSE support
- Sessions are process-local, not shared across instances

For high availability:

```yaml
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
```

## Troubleshooting

### Connection Issues

Check server logs:
```bash
kubectl logs -f deployment/keeperhub-mcp
```

### Authentication Failures

Verify MCP_API_KEY is set correctly:
```bash
kubectl get secret keeperhub-mcp-secrets -o jsonpath='{.data.MCP_API_KEY}' | base64 -d
```

### Health Check Failures

Test health endpoint manually:
```bash
kubectl exec -it deployment/keeperhub-mcp -- curl -H "Authorization: Bearer $MCP_API_KEY" http://localhost:3000/health
```

### Port Not Listening

Verify PORT environment variable:
```bash
kubectl exec -it deployment/keeperhub-mcp -- env | grep PORT
```
