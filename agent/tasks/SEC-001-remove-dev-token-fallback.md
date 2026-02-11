# Security Task: Remove Development Token Fallback

**Priority**: 🟠 HIGH  
**Status**: Open  
**Created**: 2026-02-11  
**Due**: Before production deployment  
**Assigned**: Security Team  

## Issue

The application uses a fallback to `'dev-token'` when `PLATFORM_SERVICE_TOKEN` environment variable is not set. This creates a security risk if the application is deployed to production without proper configuration.

## Location

**File**: [`src/index.ts:15`](../../src/index.ts:15)

**Current Code**:
```typescript
platform: {
  url: process.env.PLATFORM_URL!,
  serviceToken: process.env.PLATFORM_SERVICE_TOKEN || 'dev-token'
}
```

## Risk Assessment

**Severity**: HIGH  
**Impact**: 
- Unauthorized access to platform API
- Credential exposure
- Production security breach

**Likelihood**: Medium (depends on deployment process)

## Recommended Solution

### Option 1: Remove Fallback (Recommended)

```typescript
platform: {
  url: process.env.PLATFORM_URL!,
  serviceToken: process.env.PLATFORM_SERVICE_TOKEN!
}
```

Add validation after config creation:
```typescript
if (!config.platform.serviceToken) {
  console.error('Error: PLATFORM_SERVICE_TOKEN required');
  process.exit(1);
}
```

### Option 2: Environment-Aware Fallback

```typescript
platform: {
  url: process.env.PLATFORM_URL!,
  serviceToken: process.env.PLATFORM_SERVICE_TOKEN || 
    (process.env.NODE_ENV === 'development' ? 'dev-token' : '')
}

// Add validation
if (!config.platform.serviceToken) {
  console.error('Error: PLATFORM_SERVICE_TOKEN required');
  process.exit(1);
}

if (config.platform.serviceToken === 'dev-token' && 
    process.env.NODE_ENV === 'production') {
  console.error('Error: Cannot use dev-token in production');
  process.exit(1);
}
```

## Implementation Steps

1. [ ] Update [`src/index.ts`](../../src/index.ts:15) with chosen solution
2. [ ] Add validation logic after config creation
3. [ ] Update tests to verify validation
4. [ ] Update documentation to reflect requirement
5. [ ] Verify deployment scripts set `PLATFORM_SERVICE_TOKEN`
6. [ ] Test in staging environment
7. [ ] Deploy to production

## Testing Checklist

- [ ] Application fails to start without `PLATFORM_SERVICE_TOKEN`
- [ ] Application fails to start with `dev-token` in production
- [ ] Application starts successfully with valid token
- [ ] Error messages are clear and actionable
- [ ] Deployment documentation updated

## Related Files

- [`src/index.ts`](../../src/index.ts:1)
- [`.env.example`](../../.env.example:1)
- [`README.md`](../../README.md:1)
- [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1)

## References

- Security Audit: [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1) - Section 1.2
- OWASP: Secure Configuration Management
- Principle of Secure Defaults

## Notes

This is a **blocking issue** for production deployment. Do not deploy to production until resolved.
