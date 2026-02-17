#!/usr/bin/env node

import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createEventbriteServer } from '@prmichaelsen/eventbrite-mcp/factory';
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
    return createEventbriteServer(accessToken, userId);
  },
  authProvider,
  tokenResolver,
  resourceType: 'eventbrite',
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
