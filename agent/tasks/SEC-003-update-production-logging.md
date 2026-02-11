# Security Task: Update Production Logging for HTTPS

**Priority**: 🟡 MEDIUM  
**Status**: Open  
**Created**: 2026-02-11  
**Due**: Before production deployment  
**Assigned**: Development Team  

## Issue

The application logs HTTP endpoint URLs even in production where HTTPS should be used. This could mislead operators or encourage insecure connections.

## Location

**File**: [`src/index.ts:78`](../../src/index.ts:78)

**Current Code**:
```typescript
console.log(`Server running on port ${config.server.port}`);
console.log(`Endpoint: http://0.0.0.0:${config.server.port}/mcp`);
```

## Risk Assessment

**Severity**: MEDIUM  
**Impact**: 
- Misleading documentation
- Could encourage HTTP connections
- Confusion about production setup

**Likelihood**: Low (Cloud Run provides HTTPS automatically)

## Context

- Cloud Run provides automatic HTTPS termination
- Internal server listens on HTTP
- External access is always HTTPS in production
- Logging should reflect the external endpoint

## Recommended Solution

### Option 1: Environment-Aware Logging (Recommended)

```typescript
async function main() {
  await wrappedServer.start();
  
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.NODE_ENV === 'production' 
    ? (process.env.PUBLIC_URL || 'your-service.run.app')
    : `0.0.0.0:${config.server.port}`;
  
  console.log(`Server running on port ${config.server.port}`);
  console.log(`Internal endpoint: http://0.0.0.0:${config.server.port}/mcp`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`Public endpoint: ${protocol}://${host}/mcp`);
  } else {
    console.log(`Development endpoint: ${protocol}://${host}/mcp`);
  }
}
```

### Option 2: Simplified Logging

```typescript
async function main() {
  await wrappedServer.start();
  
  console.log(`Server running on port ${config.server.port}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log('Note: External access via HTTPS (Cloud Run provides TLS termination)');
  } else {
    console.log(`Endpoint: http://0.0.0.0:${config.server.port}/mcp`);
  }
}
```

## Implementation Steps

1. [ ] Update [`src/index.ts`](../../src/index.ts:75) with chosen solution
2. [ ] Add `PUBLIC_URL` to environment variables (optional)
3. [ ] Update [`.env.example`](../../.env.example:1) with `PUBLIC_URL`
4. [ ] Update [`README.md`](../../README.md:1) to document HTTPS usage
5. [ ] Test logging in development
6. [ ] Test logging in production
7. [ ] Update deployment documentation

## Testing Checklist

- [ ] Development mode shows HTTP endpoint
- [ ] Production mode shows HTTPS endpoint or note
- [ ] Logs are clear and not misleading
- [ ] Documentation matches actual behavior

## Documentation Updates

### README.md

Add section explaining transport security:

```markdown
## Transport Security

### Development
The server listens on HTTP for local development:
- Endpoint: `http://localhost:8080/mcp`

### Production (Cloud Run)
Cloud Run provides automatic HTTPS termination:
- Internal: Server listens on HTTP (port 8080)
- External: All traffic uses HTTPS
- Public endpoint: `https://your-service.run.app/mcp`

The server never handles TLS directly; Cloud Run manages all TLS certificates and termination.
```

### .env.example

```env
# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# Production: Public URL for logging (optional)
# PUBLIC_URL=your-service.run.app
```

## Related Files

- [`src/index.ts`](../../src/index.ts:75)
- [`.env.example`](../../.env.example:1)
- [`README.md`](../../README.md:1)
- [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1)

## References

- Security Audit: [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1) - Section 3.1
- Cloud Run HTTPS: https://cloud.google.com/run/docs/securing/https
- OWASP: Transport Layer Protection

## Additional Considerations

### Health Check Logging

The Docker health check uses HTTP (correct for internal checks):
```dockerfile
HEALTHCHECK CMD node -e "fetch('http://localhost:8080/mcp/health')..."
```

This is correct and should not be changed - health checks are internal.

### Client Configuration

Ensure client documentation specifies HTTPS for production:
- ✅ Production: `https://your-service.run.app/mcp`
- ✅ Development: `http://localhost:8080/mcp`

## Notes

This is primarily a documentation/logging improvement. The actual security is handled by Cloud Run's HTTPS termination, which is already in place. This task ensures the logging and documentation accurately reflect the production setup.
