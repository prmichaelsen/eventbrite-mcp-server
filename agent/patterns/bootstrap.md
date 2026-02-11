# Bootstrap Pattern: Multi-Tenant MCP Server with Firebase Auth

## Overview

This document describes how to replicate the agentbase-mcp-server pattern for **any MCP server** that you want to make multi-tenant with Firebase authentication.

## Prerequisites

Your base MCP server must export a **server factory function**:

```typescript
export function createYourServer(
  accessToken: string,
  userId: string,
  options?: ServerOptions
): Server
```

This factory should:
- Accept an access token for the external API
- Accept a userId for tracking
- Return a configured MCP `Server` instance
- Register all tools internally

## Step-by-Step Bootstrap

### Step 1: Create New Multi-Tenant Server Project

```bash
mkdir your-mcp-server
cd your-mcp-server
npm init -y
```

### Step 2: Install Dependencies

```bash
npm install \
  @modelcontextprotocol/sdk \
  @prmichaelsen/mcp-auth \
  @your-org/your-mcp-base \
  firebase-auth-cloudflare-workers

npm install --save-dev \
  typescript \
  @types/node \
  tsx
```

### Step 3: Create Project Structure

```
your-mcp-server/
├── src/
│   ├── index.ts                    # Main server
│   ├── auth/
│   │   ├── firebase-provider.ts    # Firebase JWT validation
│   │   └── platform-token-resolver.ts # Platform API integration
├── agent/
│   ├── integration-plan.md
│   ├── progress.yaml
│   └── tasks/
├── package.json
├── tsconfig.json
├── Dockerfile
├── cloudbuild.yaml
├── .env.example
├── .gitignore
└── README.md
```

### Step 4: Configure package.json

```json
{
  "name": "@your-org/your-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@prmichaelsen/mcp-auth": "^0.2.0",
    "@your-org/your-mcp-base": "^1.0.0",
    "firebase-auth-cloudflare-workers": "^2.0.6"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.7.0",
    "typescript": "^5.7.2"
  }
}
```

### Step 5: Configure TypeScript

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 6: Create Firebase Auth Provider

**src/auth/firebase-provider.ts**:

```typescript
import type { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';
import { Auth } from 'firebase-auth-cloudflare-workers';
import type { KeyStorer } from 'firebase-auth-cloudflare-workers/dist/main/key-store';

class MemoryKeyStore implements KeyStorer {
  private cache = new Map<string, string>();
  
  async get<ExpectedValue = unknown>(): Promise<ExpectedValue | null> {
    const value = this.cache.get('firebase-keys');
    return (value as ExpectedValue) || null;
  }
  
  async put(value: string, expirationTtl: number): Promise<void> {
    this.cache.set('firebase-keys', value);
  }
}

export interface FirebaseAuthProviderConfig {
  projectId: string;
  cacheResults?: boolean;
  cacheTtl?: number;
}

export class FirebaseAuthProvider implements AuthProvider {
  private auth: Auth;
  private config: FirebaseAuthProviderConfig;
  private authCache = new Map<string, { result: AuthResult; expiresAt: number }>();
  
  constructor(config: FirebaseAuthProviderConfig) {
    this.config = config;
    const keyStore = new MemoryKeyStore();
    this.auth = Auth.getOrInitialize(config.projectId, keyStore);
  }
  
  async initialize(): Promise<void> {
    console.log('Firebase auth provider initialized');
  }
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      const authHeader = context.headers?.['authorization'];
      
      if (!authHeader || Array.isArray(authHeader)) {
        return { authenticated: false, error: 'No authorization header' };
      }
      
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return { authenticated: false, error: 'Invalid authorization format' };
      }
      
      const idToken = parts[1];
      
      // Check cache
      if (this.config.cacheResults) {
        const cached = this.authCache.get(idToken);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.result;
        }
      }
      
      // Verify token
      const decodedToken = await this.auth.verifyIdToken(idToken);
      
      const result: AuthResult = {
        authenticated: true,
        userId: decodedToken.sub,
        metadata: {
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified
        }
      };
      
      // Cache result
      if (this.config.cacheResults) {
        const ttl = this.config.cacheTtl || 60000;
        this.authCache.set(idToken, {
          result,
          expiresAt: Date.now() + ttl
        });
      }
      
      return result;
    } catch (error) {
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  async cleanup(): Promise<void> {
    this.authCache.clear();
  }
}
```

### Step 7: Create Platform Token Resolver

**src/auth/platform-token-resolver.ts**:

```typescript
import type {
  ResourceTokenResolver,
  CredentialsAPIResponse,
  CredentialsAPIHeaders,
  TenantAPIErrorResponse
} from '@prmichaelsen/mcp-auth';

export interface PlatformTokenResolverConfig {
  platformUrl: string;
  serviceToken: string;
  cacheTokens?: boolean;
  cacheTtl?: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class PlatformTokenResolver implements ResourceTokenResolver {
  private config: PlatformTokenResolverConfig;
  private tokenCache = new Map<string, CachedToken>();
  
  constructor(config: PlatformTokenResolverConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log('Platform token resolver initialized');
  }
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    try {
      const cacheKey = `${userId}:${resourceType}`;
      
      // Check cache
      if (this.config.cacheTokens !== false) {
        const cached = this.tokenCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.token;
        }
      }
      
      // Call platform API
      const url = `${this.config.platformUrl}/api/credentials/${resourceType}`;
      const headers: CredentialsAPIHeaders = {
        'Authorization': `Bearer ${this.config.serviceToken}`,
        'X-User-ID': userId
      };
      
      const response = await fetch(url, {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json() as TenantAPIErrorResponse;
        
        if (response.status === 404) {
          console.warn(`No ${resourceType} credentials for user ${userId}`);
          return null;
        }
        
        console.error('Platform API error:', errorData);
        throw new Error(`Platform API error: ${errorData.error || response.status}`);
      }
      
      const data = await response.json() as CredentialsAPIResponse;
      const token = data.access_token;
      
      if (!token) {
        console.warn('Token field missing');
        return null;
      }
      
      // Cache token
      if (this.config.cacheTokens !== false) {
        const ttl = this.config.cacheTtl || 300000;
        this.tokenCache.set(cacheKey, {
          token,
          expiresAt: Date.now() + ttl
        });
      }
      
      return token;
    } catch (error) {
      console.error('Failed to resolve token:', error);
      return null;
    }
  }
  
  async cleanup(): Promise<void> {
    this.tokenCache.clear();
  }
}
```

### Step 8: Create Main Server

**src/index.ts**:

```typescript
#!/usr/bin/env node

import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createYourServer } from '@your-org/your-mcp-base/factory';
import { FirebaseAuthProvider } from './auth/firebase-provider.js';
import { PlatformTokenResolver } from './auth/platform-token-resolver.js';

// Configuration
const config = {
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID!
  },
  platform: {
    url: process.env.PLATFORM_URL!,
    serviceToken: process.env.PLATFORM_SERVICE_TOKEN || 'dev-token'
  },
  server: {
    port: parseInt(process.env.PORT || '8080')
  }
};

// Validate
if (!config.firebase.projectId) {
  console.error('Error: FIREBASE_PROJECT_ID required');
  process.exit(1);
}

if (!config.platform.url) {
  console.error('Error: PLATFORM_URL required');
  process.exit(1);
}

// Create providers
const authProvider = new FirebaseAuthProvider({
  projectId: config.firebase.projectId,
  cacheResults: true,
  cacheTtl: 60000
});

const tokenResolver = new PlatformTokenResolver({
  platformUrl: config.platform.url,
  serviceToken: config.platform.serviceToken,
  cacheTokens: true,
  cacheTtl: 300000
});

// Wrap server
const wrappedServer = wrapServer({
  serverFactory: (accessToken: string, userId: string) => {
    return createYourServer(accessToken, userId);
  },
  authProvider,
  tokenResolver,
  resourceType: 'your-resource-type', // e.g., 'github', 'slack', etc.
  transport: {
    type: 'sse',
    port: config.server.port,
    host: '0.0.0.0',
    basePath: '/mcp'
  },
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  }
});

// Start
async function main() {
  await wrappedServer.start();
  console.log(`Server running on port ${config.server.port}`);
  console.log(`Endpoint: http://0.0.0.0:${config.server.port}/mcp`);
}

process.on('SIGINT', async () => {
  await wrappedServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await wrappedServer.stop();
  process.exit(0);
});

main();
```

### Step 9: Create Dockerfile

**Dockerfile**:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/mcp/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
```

### Step 10: Create Environment Template

**.env.example**:

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

### Step 11: Create .dockerignore

**.dockerignore**:

```
dist/
build/
node_modules/
.env
.env.local
.git/
*.md
agent/
.vscode/
*.log
```

### Step 12: Create .gitignore

**.gitignore**:

```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
```

### Step 13: Deploy to Cloud Run

```bash
# Build locally
npm run build
docker build -t gcr.io/YOUR_PROJECT/your-mcp-server:latest .

# Push to GCR
docker push gcr.io/YOUR_PROJECT/your-mcp-server:latest

# Generate service token
SERVICE_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")

# Create secret
echo -n "$SERVICE_TOKEN" | gcloud secrets create platform-service-token --data-file=-

# Deploy
gcloud run deploy your-mcp-server \
  --image gcr.io/YOUR_PROJECT/your-mcp-server:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="FIREBASE_PROJECT_ID=your-project,PLATFORM_URL=https://your-platform.com,NODE_ENV=production" \
  --update-secrets=PLATFORM_SERVICE_TOKEN=platform-service-token:latest \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1
```

## Base MCP Server Requirements

For this pattern to work, your base MCP server must:

### 1. Export a Server Factory

```typescript
// your-mcp-base/src/server-factory.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export function createYourServer(
  accessToken: string,
  userId: string,
  options?: ServerOptions
): Server {
  // Create API client with user's token
  const client = new YourAPIClient(accessToken);
  
  // Create MCP server
  const server = new Server({
    name: 'your-server',
    version: '1.0.0'
  }, {
    capabilities: { tools: {} }
  });
  
  // Register all tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [/* your tools */] };
  });
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Handle tool calls with client
    // ...
  });
  
  return server;
}
```

### 2. Package Exports

**package.json**:

```json
{
  "name": "@your-org/your-mcp-base",
  "exports": {
    ".": "./build/index.js",
    "./factory": "./build/server-factory.js",
    "./client": "./build/your-client.js",
    "./tools": "./build/tools/index.js"
  }
}
```

### 3. Build Configuration

Must generate:
- All source files as .js
- TypeScript declarations (.d.ts)
- Preserve directory structure

## Platform API Requirements

The platform must implement:

```typescript
// GET /api/credentials/:provider
// Headers: { Authorization: Bearer <service-token>, X-User-ID: <user-id> }

import type { CredentialsAPIResponse } from '@prmichaelsen/mcp-auth';

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  // 1. Validate service token
  const serviceToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (serviceToken !== process.env.MCP_SERVER_SERVICE_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Get userId
  const userId = request.headers.get('X-User-ID');
  if (!userId) {
    return Response.json({ error: 'X-User-ID required' }, { status: 400 });
  }
  
  // 3. Query database
  const credentials = await db.query(
    'SELECT access_token FROM credentials WHERE user_id = $1 AND provider = $2',
    [userId, params.provider]
  );
  
  if (!credentials.rows[0]) {
    return Response.json({ error: 'Credentials not found' }, { status: 404 });
  }
  
  // 4. Return token
  const response: CredentialsAPIResponse = {
    access_token: credentials.rows[0].access_token,
    expires_at: credentials.rows[0].expires_at,
    // ... other fields
  };
  
  return Response.json(response);
}
```

## Testing

### 1. Local Testing

```bash
# Start server
npm start

# Test health
curl http://localhost:8080/mcp/health

# Test with mock JWT
curl -X POST http://localhost:8080/mcp/message \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### 2. Production Testing

```bash
# Get Firebase JWT from your platform
# Then test MCP endpoint
curl -X POST https://your-server.run.app/mcp/message \
  -H "Authorization: Bearer <firebase-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Architecture Summary

```
Client (Firebase JWT)
  ↓
Firebase Auth Provider (validates JWT → userId)
  ↓
Platform Token Resolver (userId → API token via platform)
  ↓
Your MCP Server (executes tools)
  ↓
Your External API
```

## Key Benefits

1. **Zero modification** to base MCP server
2. **Automatic multi-tenancy** via server wrapping
3. **Firebase authentication** built-in
4. **Platform-managed credentials** (secure)
5. **Stateless MCP server** (no database)
6. **Type-safe** with shared API contracts
7. **Production-ready** with health checks

## Examples

- **Instagram**: [@prmichaelsen/agentbase-mcp-server](https://github.com/prmichaelsen/agentbase-mcp-server)
- **Base Pattern**: This document

## Common Integrations

### GitHub MCP Server
```typescript
import { createGitHubServer } from '@your-org/github-mcp/factory';

const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createGitHubServer(accessToken, userId),
  authProvider: new FirebaseAuthProvider({ projectId: 'your-project' }),
  tokenResolver: new PlatformTokenResolver({ platformUrl: 'https://platform.com', serviceToken: '...' }),
  resourceType: 'github',
  transport: { type: 'sse', port: 8080 }
});
```

### Slack MCP Server
```typescript
import { createSlackServer } from '@your-org/slack-mcp/factory';

const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createSlackServer(accessToken, userId),
  authProvider: new FirebaseAuthProvider({ projectId: 'your-project' }),
  tokenResolver: new PlatformTokenResolver({ platformUrl: 'https://platform.com', serviceToken: '...' }),
  resourceType: 'slack',
  transport: { type: 'sse', port: 8080 }
});
```

## Summary

This pattern enables you to:
- ✅ Take any MCP server with a factory function
- ✅ Add Firebase authentication
- ✅ Add platform-managed credentials
- ✅ Deploy as multi-tenant service
- ✅ Zero modification to base server

**Total time**: ~4-6 hours for a new integration (most time is base server factory refactor)

**Result**: Production-ready multi-tenant MCP server with Firebase auth!
