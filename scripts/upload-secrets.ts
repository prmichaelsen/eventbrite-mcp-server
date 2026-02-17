#!/usr/bin/env tsx

/**
 * Upload secrets from .env to Google Cloud Secret Manager
 *
 * Usage: npx tsx scripts/upload-secrets.ts [--service SERVICE_NAME] [--project PROJECT_ID] [--env-file .env]
 *
 * This script:
 * 1. Reads secrets from .env file
 * 2. Creates or updates each secret in Google Cloud Secret Manager
 * 3. Prefixes secret names with service name to avoid conflicts
 * 4. Skips non-secret environment variables (like NODE_ENV, PORT)
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);
let projectId: string | null = null;
let envFile = '.env';
let serviceName: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--service' && args[i + 1]) {
    serviceName = args[i + 1];
    i++;
  } else if (args[i] === '--project' && args[i + 1]) {
    projectId = args[i + 1];
    i++;
  } else if (args[i] === '--env-file' && args[i + 1]) {
    envFile = args[i + 1];
    i++;
  }
}

// Validate required arguments
if (!serviceName) {
  console.error('Error: --service flag is required');
  console.error('Usage: npx tsx scripts/upload-secrets.ts --service SERVICE_NAME [--project PROJECT_ID] [--env-file .env]');
  console.error('Example: npx tsx scripts/upload-secrets.ts --service eventbrite');
  process.exit(1);
}

// Get project ID from gcloud if not provided
if (!projectId) {
  try {
    projectId = execSync('gcloud config get-value project', { encoding: 'utf-8' }).trim();
    console.log(`Using project from gcloud config: ${projectId}`);
  } catch (error) {
    console.error('Error: Could not determine project ID');
    console.error('Please specify with --project flag or set default project with: gcloud config set project PROJECT_ID');
    process.exit(1);
  }
}

// Variables to skip (not secrets)
const SKIP_VARS = new Set([
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
  'PLATFORM_URL'  // Public URL, not a secret
]);

// Read and parse .env file
console.log(`\nReading secrets from: ${envFile}`);
let envContent: string;
try {
  envContent = readFileSync(envFile, 'utf-8');
} catch (error) {
  console.error(`Error: Could not read ${envFile}`);
  console.error((error as Error).message);
  process.exit(1);
}

// Parse environment variables
const secrets: Record<string, string> = {};
const lines = envContent.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  
  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    continue;
  }
  
  // Parse KEY=VALUE
  const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) {
    const [, key, value] = match;
    
    // Skip non-secret variables
    if (SKIP_VARS.has(key)) {
      console.log(`⏭️  Skipping ${key} (not a secret)`);
      continue;
    }
    
    // Remove quotes if present
    let cleanValue = value.trim();
    if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
        (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
      cleanValue = cleanValue.slice(1, -1);
    }
    
    if (cleanValue) {
      secrets[key] = cleanValue;
    }
  }
}

if (Object.keys(secrets).length === 0) {
  console.log('\n⚠️  No secrets found to upload');
  process.exit(0);
}

console.log(`\nFound ${Object.keys(secrets).length} secrets to upload:`);
Object.keys(secrets).forEach(key => {
  const preview = secrets[key].substring(0, 10) + '...';
  console.log(`  - ${key}: ${preview}`);
});

console.log(`\nUploading to project: ${projectId}`);
console.log('─'.repeat(60));

// Upload each secret
let successCount = 0;
let errorCount = 0;

for (const [key, value] of Object.entries(secrets)) {
  // Prefix secret name with service name to avoid conflicts
  const secretName = `${serviceName}-${key.toLowerCase().replace(/_/g, '-')}`;
  
  try {
    // Check if secret exists
    let secretExists = false;
    try {
      execSync(`gcloud secrets describe ${secretName} --project=${projectId}`, { 
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      secretExists = true;
    } catch {
      // Secret doesn't exist, will create it
    }
    
    // Write value to temp file to avoid shell escaping issues
    const tempFile = join(tmpdir(), `secret-${Date.now()}.txt`);
    try {
      writeFileSync(tempFile, value, 'utf-8');
      
      if (secretExists) {
        // Add new version to existing secret
        console.log(`📝 Updating ${secretName}...`);
        execSync(`gcloud secrets versions add ${secretName} --data-file=${tempFile} --project=${projectId}`, {
          stdio: 'pipe'
        });
        console.log(`✅ Updated ${secretName}`);
      } else {
        // Create new secret
        console.log(`🆕 Creating ${secretName}...`);
        execSync(`gcloud secrets create ${secretName} --data-file=${tempFile} --project=${projectId}`, {
          stdio: 'pipe'
        });
        console.log(`✅ Created ${secretName}`);
      }
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch {}
    }
    
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to upload ${secretName}`);
    console.error(`   ${(error as Error).message}`);
    errorCount++;
  }
}

console.log('─'.repeat(60));
console.log(`\n📊 Summary:`);
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Failed: ${errorCount}`);
console.log(`   📦 Total: ${Object.keys(secrets).length}`);

if (successCount > 0) {
  console.log(`\n💡 To use these secrets in Cloud Run:`);
  console.log(`   gcloud run deploy ${serviceName}-mcp-server \\`);
  Object.keys(secrets).forEach(key => {
    const secretName = `${serviceName}-${key.toLowerCase().replace(/_/g, '-')}`;
    console.log(`     --update-secrets=${key}=${secretName}:latest \\`);
  });
}

process.exit(errorCount > 0 ? 1 : 0);
