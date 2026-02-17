# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-17

### Changed
- **BREAKING**: Replaced Firebase authentication with Platform JWT authentication
- Authentication now uses `jsonwebtoken` library with shared secret instead of Firebase
- Removed `FIREBASE_PROJECT_ID` environment variable requirement
- `PLATFORM_SERVICE_TOKEN` now used for both JWT validation and platform API calls
- Simplified authentication configuration

### Added
- `src/auth/platform-jwt-provider.ts` - Platform JWT authentication provider
- Support for `jsonwebtoken` library (^9.0.2)

### Removed
- Firebase authentication support (`firebase-auth-cloudflare-workers`)
- `FIREBASE_PROJECT_ID` configuration requirement
- `src/auth/firebase-provider.ts` (replaced by platform-jwt-provider.ts)

### Migration Guide
1. Remove `FIREBASE_PROJECT_ID` from your `.env` file
2. Ensure `PLATFORM_SERVICE_TOKEN` is set (used for JWT validation)
3. Run `npm install` to update dependencies
4. JWT tokens must now be signed with `PLATFORM_SERVICE_TOKEN` (shared secret)
5. JWT must include `issuer: 'agentbase.me'` and `audience: 'mcp-server'`

## [1.1.0] - 2026-02-17

### Added
- Google Cloud Run deployment infrastructure with Cloud Build
- `cloudbuild.yaml` for automated CI/CD pipeline
- `scripts/upload-secrets.ts` for secret management with Google Cloud Secret Manager
- `DEPLOYMENT.md` with complete deployment documentation
- Automated secret upload from `.env` to Secret Manager
- Production deployment to https://eventbrite-mcp-server-dit6gawkbq-uc.a.run.app

### Changed
- Updated `.env.example` with better documentation and agentbase.me platform URL
- Fixed import path for `createEventbriteServer` from `/factory` to main export

### Fixed
- Resolved module resolution issue with `@prmichaelsen/eventbrite-mcp` package

## [1.0.0] - 2026-02-11

### Added
- Initial release of Eventbrite MCP Server
- Multi-tenant architecture with Firebase authentication
- Platform API integration for credential management
- SSE transport for MCP protocol
- Rate limiting and request logging
- Docker support with multi-stage builds
- Health check endpoint
- Token caching for performance
