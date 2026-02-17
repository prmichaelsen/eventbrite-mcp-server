# Deployment Guide

This guide walks through deploying the Eventbrite MCP Server to Google Cloud Run using Cloud Build.

## Prerequisites

1. **Google Cloud Project** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **Required APIs enabled**:
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

## Step 1: Create `.env` File

Copy `.env.example` to `.env` and fill in your actual secrets:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Firebase (for JWT validation)
FIREBASE_PROJECT_ID=your-actual-firebase-project-id

# Platform API (for token resolution)
PLATFORM_URL=https://agentbase.me
PLATFORM_SERVICE_TOKEN=your-actual-service-token

# Server
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
```

**⚠️ IMPORTANT**: Never commit `.env` to git. It's already in `.gitignore`.

## Step 2: Upload Secrets to Google Cloud Secret Manager

Run the upload script to create secrets in Google Cloud Secret Manager:

```bash
npx tsx scripts/upload-secrets.ts --service eventbrite
```

This will:
- Read secrets from `.env`
- Create/update secrets in Secret Manager with prefix `eventbrite-`
- Skip non-secret variables (NODE_ENV, PORT, LOG_LEVEL, PLATFORM_URL)

Expected secrets created:
- `eventbrite-platform-service-token`
- `eventbrite-firebase-project-id`

## Step 3: Set Up Cloud Build Trigger (Optional)

For automatic deployments on git push:

```bash
# Connect your repository
gcloud builds triggers create github \
  --name="eventbrite-mcp-server-deploy" \
  --repo-name="eventbrite-mcp-server" \
  --repo-owner="YOUR_GITHUB_USERNAME" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml"
```

## Step 4: Deploy Manually

To deploy manually without setting up triggers:

```bash
# Submit build to Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

This will:
1. Build the Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run with secrets mounted

## Step 5: Verify Deployment

Check the deployment:

```bash
# Get service URL
gcloud run services describe eventbrite-mcp-server \
  --region=us-central1 \
  --format='value(status.url)'

# Test health endpoint
curl https://YOUR-SERVICE-URL/mcp/health
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Project                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐         ┌──────────────────┐          │
│  │  Cloud Build    │────────▶│  Container       │          │
│  │  (CI/CD)        │         │  Registry        │          │
│  └─────────────────┘         └──────────────────┘          │
│                                        │                     │
│                                        ▼                     │
│                              ┌──────────────────┐           │
│                              │   Cloud Run      │           │
│                              │   (Server)       │           │
│                              └──────────────────┘           │
│                                        │                     │
│                                        ▼                     │
│                              ┌──────────────────┐           │
│                              │  Secret Manager  │           │
│                              │  (Credentials)   │           │
│                              └──────────────────┘           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  External Services     │
                    ├────────────────────────┤
                    │  • Firebase Auth       │
                    │  • Platform API        │
                    │  • Eventbrite API      │
                    └────────────────────────┘
```

## Secret Management

Secrets are managed using Google Cloud Secret Manager:

1. **Local Development**: Use `.env` file (never committed)
2. **Production**: Secrets stored in Secret Manager
3. **Cloud Run**: Secrets mounted as environment variables

### Secret Naming Convention

Secrets are prefixed with service name to avoid conflicts:
- `eventbrite-platform-service-token`
- `eventbrite-firebase-project-id`

### Updating Secrets

To update a secret:

```bash
# Update .env with new value
# Then re-run upload script
npx tsx scripts/upload-secrets.ts --service eventbrite

# Redeploy to pick up new secret version
gcloud builds submit --config cloudbuild.yaml
```

## Cloud Build Configuration

The [`cloudbuild.yaml`](cloudbuild.yaml) file defines the deployment pipeline:

1. **Build**: Creates Docker image from [`Dockerfile`](Dockerfile)
2. **Push**: Uploads to Container Registry with commit SHA and `latest` tags
3. **Deploy**: Deploys to Cloud Run with:
   - Region: `us-central1`
   - Memory: `512Mi`
   - CPU: `1`
   - Min instances: `0` (scales to zero)
   - Max instances: `10`
   - Timeout: `60s`
   - Secrets mounted from Secret Manager

## Environment Variables

### Set via `--set-env-vars` (Public)
- `NODE_ENV=production`
- `PLATFORM_URL=https://agentbase.me`

### Set via `--update-secrets` (Private)
- `PLATFORM_SERVICE_TOKEN` → `eventbrite-platform-service-token:latest`
- `FIREBASE_PROJECT_ID` → `eventbrite-firebase-project-id:latest`

## Monitoring

View logs:

```bash
# Stream logs
gcloud run services logs tail eventbrite-mcp-server --region=us-central1

# View in Cloud Console
gcloud run services describe eventbrite-mcp-server \
  --region=us-central1 \
  --format='value(status.url)' | \
  xargs -I {} echo "Logs: https://console.cloud.google.com/run/detail/us-central1/eventbrite-mcp-server/logs"
```

## Troubleshooting

### Build Fails

Check Cloud Build logs:
```bash
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### Deployment Fails

Check Cloud Run logs:
```bash
gcloud run services logs read eventbrite-mcp-server --region=us-central1 --limit=50
```

### Secret Access Issues

Verify Cloud Run service account has access to secrets:
```bash
# Get service account
gcloud run services describe eventbrite-mcp-server \
  --region=us-central1 \
  --format='value(spec.template.spec.serviceAccountName)'

# Grant secret access
gcloud secrets add-iam-policy-binding eventbrite-platform-service-token \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

## Cost Optimization

Cloud Run pricing:
- **Free tier**: 2 million requests/month
- **Compute**: $0.00002400/vCPU-second, $0.00000250/GiB-second
- **Requests**: $0.40/million requests
- **Min instances = 0**: No cost when idle

With current configuration (512Mi, 1 CPU, min=0):
- Scales to zero when not in use
- Only pay for actual usage
- Estimated cost: $5-20/month for moderate usage

## Security

1. **Secrets**: Never in code or logs, only in Secret Manager
2. **Authentication**: Firebase JWT validation on every request
3. **Network**: HTTPS only, Cloud Run managed certificates
4. **IAM**: Least privilege access for service accounts
5. **Audit**: Cloud Logging tracks all access

## Next Steps

After deployment:

1. **Test the service**:
   ```bash
   curl https://YOUR-SERVICE-URL/mcp/health
   ```

2. **Configure your MCP client** to use the deployed URL

3. **Set up monitoring alerts** in Cloud Console

4. **Enable Cloud Armor** for DDoS protection (optional)

5. **Set up custom domain** (optional):
   ```bash
   gcloud run domain-mappings create \
     --service=eventbrite-mcp-server \
     --domain=your-domain.com \
     --region=us-central1
   ```

## Related Documentation

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Project README](README.md)
