# Security Task: Implement Cache Invalidation for Revoked Tokens

**Priority**: 🟡 MEDIUM  
**Status**: Open  
**Created**: 2026-02-11  
**Due**: Q2 2026  
**Assigned**: Development Team  

## Issue

The application caches Firebase JWT validation results and Eventbrite access tokens in memory. If a token is revoked (e.g., user logs out, credentials revoked), the cache continues to serve the old token until TTL expires.

## Current Behavior

**Auth Cache**: 60 seconds TTL  
**Token Cache**: 300 seconds (5 minutes) TTL

**Files**:
- [`src/auth/firebase-provider.ts:27`](../../src/auth/firebase-provider.ts:27)
- [`src/auth/platform-token-resolver.ts:22`](../../src/auth/platform-token-resolver.ts:22)

## Risk Assessment

**Severity**: MEDIUM  
**Impact**: 
- Revoked tokens remain valid for up to 5 minutes
- User logout not immediately effective
- Compromised credentials have extended validity window

**Likelihood**: Low (short TTL limits exposure)

## Current Mitigation

- Short TTL values (60s auth, 300s tokens)
- Automatic cache expiration
- Stateless architecture

## Recommended Solutions

### Option 1: Webhook-Based Invalidation (Recommended)

Implement webhook endpoints to receive invalidation events from Firebase and Platform API.

**New File**: `src/cache/invalidation.ts`

```typescript
export interface CacheInvalidationService {
  invalidateUser(userId: string): void;
  invalidateToken(userId: string, resourceType: string): void;
}

export class CacheManager implements CacheInvalidationService {
  constructor(
    private authProvider: FirebaseAuthProvider,
    private tokenResolver: PlatformTokenResolver
  ) {}
  
  invalidateUser(userId: string): void {
    // Invalidate all auth cache entries for user
    this.authProvider.invalidateUser(userId);
    console.log(`Invalidated auth cache for user: ${userId}`);
  }
  
  invalidateToken(userId: string, resourceType: string): void {
    // Invalidate specific token cache entry
    this.tokenResolver.invalidateToken(userId, resourceType);
    console.log(`Invalidated ${resourceType} token for user: ${userId}`);
  }
}
```

**Update**: `src/auth/firebase-provider.ts`

```typescript
export class FirebaseAuthProvider implements AuthProvider {
  private authCache = new Map<string, { result: AuthResult; expiresAt: number; userId: string }>();
  
  // Add userId to cache entries for invalidation
  async authenticate(context: RequestContext): Promise<AuthResult> {
    // ... existing code ...
    
    if (this.config.cacheResults) {
      const ttl = this.config.cacheTtl || 60000;
      this.authCache.set(idToken, {
        result,
        expiresAt: Date.now() + ttl,
        userId: decodedToken.sub  // Add userId
      });
    }
    
    return result;
  }
  
  // New method for invalidation
  invalidateUser(userId: string): void {
    for (const [token, cached] of this.authCache.entries()) {
      if (cached.userId === userId) {
        this.authCache.delete(token);
      }
    }
  }
}
```

**Update**: `src/auth/platform-token-resolver.ts`

```typescript
export class PlatformTokenResolver implements ResourceTokenResolver {
  // ... existing code ...
  
  // New method for invalidation
  invalidateToken(userId: string, resourceType: string): void {
    const cacheKey = `${userId}:${resourceType}`;
    this.tokenCache.delete(cacheKey);
  }
}
```

**New Endpoint**: Add to `src/index.ts`

```typescript
import { CacheManager } from './cache/invalidation.js';

// Create cache manager
const cacheManager = new CacheManager(authProvider, tokenResolver);

// Add invalidation endpoints (protected by service token)
const wrappedServer = wrapServer({
  // ... existing config ...
  webhooks: {
    invalidateUser: {
      path: '/webhooks/invalidate-user',
      handler: async (req) => {
        // Verify webhook signature/token
        const serviceToken = req.headers['x-service-token'];
        if (serviceToken !== config.platform.serviceToken) {
          return { status: 401, body: { error: 'Unauthorized' } };
        }
        
        const { userId } = await req.json();
        cacheManager.invalidateUser(userId);
        
        return { status: 200, body: { success: true } };
      }
    },
    invalidateToken: {
      path: '/webhooks/invalidate-token',
      handler: async (req) => {
        // Verify webhook signature/token
        const serviceToken = req.headers['x-service-token'];
        if (serviceToken !== config.platform.serviceToken) {
          return { status: 401, body: { error: 'Unauthorized' } };
        }
        
        const { userId, resourceType } = await req.json();
        cacheManager.invalidateToken(userId, resourceType);
        
        return { status: 200, body: { success: true } };
      }
    }
  }
});
```

### Option 2: Shorter TTL Values

Reduce cache TTL to minimize exposure window:

```typescript
// Auth cache: 30 seconds (was 60)
const authProvider = new FirebaseAuthProvider({
  projectId: config.firebase.projectId,
  cacheResults: true,
  cacheTtl: 30000
});

// Token cache: 60 seconds (was 300)
const tokenResolver = new PlatformTokenResolver({
  platformUrl: config.platform.url,
  serviceToken: config.platform.serviceToken,
  cacheTokens: true,
  cacheTtl: 60000
});
```

**Trade-off**: Increased API calls vs. reduced exposure window

### Option 3: Redis-Based Cache with Pub/Sub

Use Redis for distributed cache with pub/sub invalidation:

```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL
});

// Subscribe to invalidation events
redis.subscribe('cache:invalidate', (message) => {
  const { userId, resourceType } = JSON.parse(message);
  // Invalidate local cache
});

// Publish invalidation events
redis.publish('cache:invalidate', JSON.stringify({ userId, resourceType }));
```

**Benefits**: Works across multiple instances  
**Trade-off**: Adds Redis dependency

## Implementation Steps

### Phase 1: Webhook Infrastructure
1. [ ] Create `src/cache/invalidation.ts`
2. [ ] Update `FirebaseAuthProvider` with invalidation method
3. [ ] Update `PlatformTokenResolver` with invalidation method
4. [ ] Add webhook endpoints to server
5. [ ] Add webhook authentication

### Phase 2: Platform Integration
6. [ ] Document webhook API for platform team
7. [ ] Platform implements webhook calls on logout
8. [ ] Platform implements webhook calls on credential revocation
9. [ ] Test webhook integration

### Phase 3: Monitoring
10. [ ] Add metrics for cache invalidations
11. [ ] Add logging for invalidation events
12. [ ] Monitor invalidation effectiveness

## Testing Checklist

- [ ] Webhook authentication works correctly
- [ ] User invalidation clears all auth cache entries
- [ ] Token invalidation clears specific token cache
- [ ] Invalid webhook requests are rejected
- [ ] Webhook calls are logged
- [ ] Cache invalidation is immediate
- [ ] Performance impact is acceptable

## Platform API Requirements

The platform must call webhooks when:

1. **User Logout**:
```bash
POST https://mcp-server.run.app/webhooks/invalidate-user
X-Service-Token: <service-token>
Content-Type: application/json

{
  "userId": "user-123"
}
```

2. **Credential Revocation**:
```bash
POST https://mcp-server.run.app/webhooks/invalidate-token
X-Service-Token: <service-token>
Content-Type: application/json

{
  "userId": "user-123",
  "resourceType": "eventbrite"
}
```

## Related Files

- [`src/auth/firebase-provider.ts`](../../src/auth/firebase-provider.ts:1)
- [`src/auth/platform-token-resolver.ts`](../../src/auth/platform-token-resolver.ts:1)
- [`src/index.ts`](../../src/index.ts:1)
- [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1)

## References

- Security Audit: [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1) - Section 2.3
- Firebase Token Revocation: https://firebase.google.com/docs/auth/admin/manage-sessions
- Webhook Security Best Practices

## Dependencies

- Requires platform API changes
- May require infrastructure changes (Redis for Option 3)

## Notes

This is a **long-term enhancement**. The current short TTL values provide reasonable security. Implement this when:
- Platform API supports webhooks
- Multiple server instances are deployed
- Immediate invalidation becomes a requirement

**Priority**: Can be deferred if TTL values are acceptable for business requirements.
