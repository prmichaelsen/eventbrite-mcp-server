import type { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';
import { Auth } from 'firebase-auth-cloudflare-workers';
import type { KeyStorer } from 'firebase-auth-cloudflare-workers/dist/main/key-store';

class MemoryKeyStore implements KeyStorer {
  private cache = new Map<string, string>();
  
  async get<ExpectedValue = unknown>(): Promise<ExpectedValue | null> {
    const value = this.cache.get('firebase-keys');
    return (value as ExpectedValue) || null;
  }
  
  async put(value: string, expirationTtl: number): Promise<void> {
    this.cache.set('firebase-keys', value);
  }
}

export interface FirebaseAuthProviderConfig {
  projectId: string;
  cacheResults?: boolean;
  cacheTtl?: number;
}

export class FirebaseAuthProvider implements AuthProvider {
  private auth: Auth;
  private config: FirebaseAuthProviderConfig;
  private authCache = new Map<string, { result: AuthResult; expiresAt: number }>();
  
  constructor(config: FirebaseAuthProviderConfig) {
    this.config = config;
    const keyStore = new MemoryKeyStore();
    this.auth = Auth.getOrInitialize(config.projectId, keyStore);
  }
  
  async initialize(): Promise<void> {
    console.log('Firebase auth provider initialized');
  }
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      const authHeader = context.headers?.['authorization'];
      
      if (!authHeader || Array.isArray(authHeader)) {
        return { authenticated: false, error: 'No authorization header' };
      }
      
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return { authenticated: false, error: 'Invalid authorization format' };
      }
      
      const idToken = parts[1];
      
      // Check cache
      if (this.config.cacheResults) {
        const cached = this.authCache.get(idToken);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.result;
        }
      }
      
      // Verify token
      const decodedToken = await this.auth.verifyIdToken(idToken);
      
      const result: AuthResult = {
        authenticated: true,
        userId: decodedToken.sub,
        metadata: {
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified
        }
      };
      
      // Cache result
      if (this.config.cacheResults) {
        const ttl = this.config.cacheTtl || 60000;
        this.authCache.set(idToken, {
          result,
          expiresAt: Date.now() + ttl
        });
      }
      
      return result;
    } catch (error) {
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  async cleanup(): Promise<void> {
    this.authCache.clear();
  }
}
