# Eventbrite MCP Server

Multi-tenant Eventbrite MCP server with Firebase authentication, wrapping [@prmichaelsen/eventbrite-mcp](https://www.npmjs.com/package/@prmichaelsen/eventbrite-mcp).

## Overview

This server provides a multi-tenant Model Context Protocol (MCP) interface to the Eventbrite API. It uses:

- **Firebase Authentication** for user identity verification
- **Platform API** for secure credential management
- **@prmichaelsen/mcp-auth** for authentication wrapping
- **@prmichaelsen/eventbrite-mcp** as the base MCP server

## Architecture

```
Client (Firebase JWT)
  ↓
Firebase Auth Provider (validates JWT → userId)
  ↓
Platform Token Resolver (userId → Eventbrite token via platform)
  ↓
Eventbrite MCP Server (executes tools)
  ↓
Eventbrite API
```

## Prerequisites

- Node.js 20+
- Firebase project with authentication enabled
- Platform API that implements the credentials endpoint
- Eventbrite OAuth tokens stored in your platform

## Installation

```bash
npm install
```

## Configuration

Copy [`.env.example`](.env.example) to `.env` and configure:

```env
# Firebase (for JWT validation)
FIREBASE_PROJECT_ID=your-firebase-project-id

# Platform API (for token resolution)
PLATFORM_URL=https://your-platform.com
PLATFORM_SERVICE_TOKEN=your-service-token

# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=info
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID for JWT validation |
| `PLATFORM_URL` | Yes | Base URL of your platform API |
| `PLATFORM_SERVICE_TOKEN` | Yes | Service token for platform API authentication |
| `PORT` | No | Server port (default: 8080) |
| `NODE_ENV` | No | Environment (development/production) |
| `LOG_LEVEL` | No | Logging level (default: info) |

## Development

```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

## Docker

### Build

```bash
docker build -t eventbrite-mcp-server .
```

### Run

```bash
docker run -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=your-project \
  -e PLATFORM_URL=https://your-platform.com \
  -e PLATFORM_SERVICE_TOKEN=your-token \
  eventbrite-mcp-server
```

## Deployment

### Google Cloud Run

```bash
# Build and push to GCR
docker build -t gcr.io/YOUR_PROJECT/eventbrite-mcp-server:latest .
docker push gcr.io/YOUR_PROJECT/eventbrite-mcp-server:latest

# Generate service token
SERVICE_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")

# Create secret
echo -n "$SERVICE_TOKEN" | gcloud secrets create platform-service-token --data-file=-

# Deploy
gcloud run deploy eventbrite-mcp-server \
  --image gcr.io/YOUR_PROJECT/eventbrite-mcp-server:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="FIREBASE_PROJECT_ID=your-project,PLATFORM_URL=https://your-platform.com,NODE_ENV=production" \
  --update-secrets=PLATFORM_SERVICE_TOKEN=platform-service-token:latest \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1
```

## API Endpoints

### Health Check

```bash
GET /mcp/health
```

### MCP Message Endpoint

```bash
POST /mcp/message
Authorization: Bearer <firebase-jwt>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

## Testing

### Local Testing

```bash
# Start server
npm start

# Test health endpoint
curl http://localhost:8080/mcp/health

# Test with Firebase JWT
curl -X POST http://localhost:8080/mcp/message \
  -H "Authorization: Bearer <firebase-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Production Testing

```bash
curl -X POST https://your-server.run.app/mcp/message \
  -H "Authorization: Bearer <firebase-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Platform API Requirements

Your platform must implement the credentials endpoint:

```typescript
// GET /api/credentials/eventbrite
// Headers: 
//   Authorization: Bearer <service-token>
//   X-User-ID: <user-id>

// Response:
{
  "access_token": "user-eventbrite-token",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

## Project Structure

```
eventbrite-mcp-server/
├── src/
│   ├── index.ts                    # Main server entry point
│   └── auth/
│       ├── firebase-provider.ts    # Firebase JWT validation
│       └── platform-token-resolver.ts # Platform API integration
├── agent/
│   └── patterns/
│       └── bootstrap.md            # Bootstrap pattern documentation
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
├── .gitignore
├── .dockerignore
└── README.md
```

## Features

- ✅ Multi-tenant architecture
- ✅ Firebase authentication
- ✅ Platform-managed credentials (secure)
- ✅ Stateless server (no database)
- ✅ Token caching for performance
- ✅ Rate limiting
- ✅ Health checks
- ✅ Docker support
- ✅ Cloud Run ready

## Security

- Firebase JWT tokens are validated on every request
- Eventbrite tokens are never exposed to clients
- Service token authenticates server-to-platform communication
- All credentials are managed by the platform API
- Rate limiting prevents abuse

## Caching

The server implements two levels of caching:

1. **Auth Cache**: Firebase JWT validation results (TTL: 60s)
2. **Token Cache**: Eventbrite access tokens (TTL: 5min)

Caching improves performance and reduces external API calls.

## Troubleshooting

### TypeScript Errors

TypeScript errors about missing modules are expected before running `npm install`. Install dependencies to resolve.

### Authentication Failures

- Verify `FIREBASE_PROJECT_ID` matches your Firebase project
- Ensure Firebase JWT is valid and not expired
- Check that the JWT is sent in the `Authorization: Bearer <token>` header

### Token Resolution Failures

- Verify `PLATFORM_URL` is correct
- Ensure `PLATFORM_SERVICE_TOKEN` is valid
- Check that user has Eventbrite credentials in the platform
- Review platform API logs for errors

## License

MIT

## Related Projects

- [@prmichaelsen/eventbrite-mcp](https://www.npmjs.com/package/@prmichaelsen/eventbrite-mcp) - Base Eventbrite MCP server
- [@prmichaelsen/mcp-auth](https://www.npmjs.com/package/@prmichaelsen/mcp-auth) - MCP authentication wrapper
- [Bootstrap Pattern](agent/patterns/bootstrap.md) - Pattern documentation

## Support

For issues or questions:
- Base MCP server: [@prmichaelsen/eventbrite-mcp issues](https://github.com/prmichaelsen/eventbrite-mcp/issues)
- This wrapper: Create an issue in this repository
