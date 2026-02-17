# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
