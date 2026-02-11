# Security Task: Add Input Validation for Configuration

**Priority**: 🟡 MEDIUM  
**Status**: Open  
**Created**: 2026-02-11  
**Due**: Before production deployment  
**Assigned**: Development Team  

## Issue

The application performs minimal validation of environment variables and configuration inputs. This could lead to runtime errors or security issues if invalid values are provided.

## Current Validation

**File**: [`src/index.ts:23-31`](../../src/index.ts:23)

**Current Code**:
```typescript
// Only checks for presence, not format
if (!config.firebase.projectId) {
  console.error('Error: FIREBASE_PROJECT_ID required');
  process.exit(1);
}

if (!config.platform.url) {
  console.error('Error: PLATFORM_URL required');
  process.exit(1);
}
```

## Missing Validations

1. ❌ Firebase Project ID format validation
2. ❌ Platform URL format validation (HTTPS in production)
3. ❌ Port range validation (1-65535)
4. ❌ Resource type validation (alphanumeric)
5. ❌ Service token format validation

## Risk Assessment

**Severity**: MEDIUM  
**Impact**: 
- Runtime errors with invalid configuration
- Potential security misconfigurations
- Difficult troubleshooting

**Likelihood**: Medium (depends on deployment process)

## Recommended Solution

### Create Validation Helper

**New File**: `src/config/validator.ts`

```typescript
export interface Config {
  firebase: {
    projectId: string;
  };
  platform: {
    url: string;
    serviceToken: string;
  };
  server: {
    port: number;
  };
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function validateConfig(config: Config): void {
  // Firebase Project ID: lowercase alphanumeric with hyphens
  if (!/^[a-z0-9-]+$/.test(config.firebase.projectId)) {
    throw new ConfigValidationError(
      'Invalid FIREBASE_PROJECT_ID format. Must be lowercase alphanumeric with hyphens.'
    );
  }
  
  // Platform URL: must be valid URL
  let url: URL;
  try {
    url = new URL(config.platform.url);
  } catch (error) {
    throw new ConfigValidationError(
      'Invalid PLATFORM_URL format. Must be a valid URL.'
    );
  }
  
  // Platform URL: must be HTTPS in production
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new ConfigValidationError(
      'PLATFORM_URL must use HTTPS in production environment.'
    );
  }
  
  // Port range: 1-65535
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new ConfigValidationError(
      `Invalid PORT value: ${config.server.port}. Must be between 1 and 65535.`
    );
  }
  
  // Service token: minimum length check
  if (config.platform.serviceToken.length < 16) {
    throw new ConfigValidationError(
      'PLATFORM_SERVICE_TOKEN must be at least 16 characters long.'
    );
  }
  
  // Service token: warn about dev-token
  if (config.platform.serviceToken === 'dev-token') {
    if (process.env.NODE_ENV === 'production') {
      throw new ConfigValidationError(
        'Cannot use dev-token in production environment.'
      );
    }
    console.warn('⚠️  Warning: Using dev-token for PLATFORM_SERVICE_TOKEN');
  }
}
```

### Update Main File

**File**: [`src/index.ts`](../../src/index.ts:1)

```typescript
import { validateConfig } from './config/validator.js';

// ... existing config creation ...

// Validate configuration
try {
  validateConfig(config);
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Configuration Error:', error.message);
    process.exit(1);
  }
  throw error;
}
```

## Implementation Steps

1. [ ] Create `src/config/validator.ts` with validation logic
2. [ ] Update `src/index.ts` to use validator
3. [ ] Add unit tests for validator
4. [ ] Update `.env.example` with format requirements
5. [ ] Update README.md with validation requirements
6. [ ] Test with invalid configurations
7. [ ] Test with valid configurations
8. [ ] Deploy to staging

## Testing Checklist

### Invalid Inputs
- [ ] Invalid Firebase Project ID format (uppercase, special chars)
- [ ] Invalid Platform URL format (not a URL)
- [ ] HTTP Platform URL in production
- [ ] Port out of range (0, 65536, negative)
- [ ] Short service token (< 16 chars)
- [ ] dev-token in production

### Valid Inputs
- [ ] Valid Firebase Project ID
- [ ] HTTPS Platform URL in production
- [ ] HTTP Platform URL in development
- [ ] Valid port range
- [ ] Valid service token

### Error Messages
- [ ] Clear error messages for each validation failure
- [ ] Helpful guidance on fixing issues
- [ ] Proper exit codes

## Related Files

- [`src/index.ts`](../../src/index.ts:1)
- [`.env.example`](../../.env.example:1)
- [`README.md`](../../README.md:1)
- [`tsconfig.json`](../../tsconfig.json:1)
- [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1)

## References

- Security Audit: [`agent/security/audit_20260211.md`](../security/audit_20260211.md:1) - Section 5.1
- OWASP: Input Validation
- Firebase Project ID Naming: https://firebase.google.com/docs/projects/learn-more

## Dependencies

- Depends on: SEC-001 (Remove dev-token fallback)
- Blocks: Production deployment

## Notes

This validation will catch configuration errors early and provide clear feedback to operators. It's especially important for production deployments where misconfigurations could lead to security issues.
