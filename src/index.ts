#!/usr/bin/env node

import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createEventbriteServer } from '@prmichaelsen/eventbrite-mcp/factory';
import { PlatformJWTProvider } from './auth/platform-jwt-provider.js';
import { PlatformTokenResolver } from './auth/platform-token-resolver.js';

// Configuration
const config = {
  platform: {
    url: process.env.PLATFORM_URL!,
    serviceToken: process.env.PLATFORM_SERVICE_TOKEN!
  },
  server: {
    port: parseInt(process.env.PORT || '8080')
  }
};

// Validate
if (!config.platform.serviceToken) {
  console.error('Error: PLATFORM_SERVICE_TOKEN required');
  process.exit(1);
}

if (!config.platform.url) {
  console.error('Error: PLATFORM_URL required');
  process.exit(1);
}

// Create providers
const authProvider = new PlatformJWTProvider({
  serviceToken: config.platform.serviceToken,
  issuer: 'agentbase.me',
  audience: 'mcp-server',
  cacheResults: true,
  cacheTtl: 60000
});

const tokenResolver = new PlatformTokenResolver({
  platformUrl: config.platform.url,
  authProvider: authProvider,
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
