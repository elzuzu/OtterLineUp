import { setTimeout as sleep } from 'node:timers/promises';

export interface VaultClientOptions {
  baseUrl: string;
  roleId: string;
  secretId: string;
  namespace?: string;
  minRenewSeconds?: number;
  fetchImpl?: typeof fetch;
  maxLoginAttempts?: number;
}

export interface VaultSecret<T = Record<string, unknown>> { data: T; metadata: Record<string, unknown>; }

export class VaultError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'VaultError';
  }
}

interface LoginPayload { auth?: { client_token?: string; lease_duration?: number }; errors?: string[]; }
interface SecretPayload<T> { data?: { data?: T; metadata?: Record<string, unknown> }; errors?: string[]; }

export class VaultClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly minRenewSeconds: number;
  private readonly maxLoginAttempts: number;

  constructor(private readonly options: VaultClientOptions) {
    if (!options.baseUrl) throw new Error('VaultClient requires baseUrl');
    if (!options.roleId) throw new Error('VaultClient requires roleId');
    if (!options.secretId) throw new Error('VaultClient requires secretId');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minRenewSeconds = options.minRenewSeconds ?? 60;
    this.maxLoginAttempts = Math.max(1, options.maxLoginAttempts ?? 3);
  }

  async readSecret<T = Record<string, unknown>>(path: string): Promise<VaultSecret<T>> {
    if (!path) throw new Error('VaultClient.readSecret requires path');
    await this.ensureToken();
    const payload = await this.rawRequest<SecretPayload<T>>('GET', path);
    const secret = payload.data;
    if (!secret?.data) throw new VaultError('Vault secret missing data');
    return { data: secret.data, metadata: secret.metadata ?? {} };
  }

  async revoke(): Promise<void> {
    if (!this.token) return;
    try {
      await this.rawRequest('POST', 'auth/token/revoke-self', undefined, false);
    } catch (error) {
      if (!(error instanceof VaultError && (error.status === 403 || error.status === 404))) throw error;
    } finally {
      this.clearToken();
    }
  }

  private async ensureToken(): Promise<void> {
    if (!this.token || this.tokenExpiresAt - Date.now() <= this.minRenewSeconds * 1000) {
      await this.loginWithRetry();
    }
  }

  private async loginWithRetry(): Promise<void> {
    let attempt = 0;
    let delayMs = 200;
    for (;;) {
      try {
        await this.login();
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxLoginAttempts) throw error;
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, 2000);
      }
    }
  }

  private async login(): Promise<void> {
    const payload = await this.rawRequest<LoginPayload>('POST', 'auth/approle/login', {
      role_id: this.options.roleId,
      secret_id: this.options.secretId,
    }, false);
    const auth = payload.auth;
    if (!auth?.client_token) throw new VaultError('Vault login missing client token');
    this.token = auth.client_token;
    const ttl = Number(auth.lease_duration ?? 0);
    this.tokenExpiresAt = Date.now() + Math.max(0, ttl - this.minRenewSeconds / 2) * 1000;
  }

  private clearToken(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  private async rawRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    allowReauth = true,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (this.token) headers['X-Vault-Token'] = this.token;
    if (this.options.namespace) headers['X-Vault-Namespace'] = this.options.namespace;
    const response = await this.fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) {
      if (
        allowReauth &&
        this.token &&
        (response.status === 401 || response.status === 403)
      ) {
        this.clearToken();
        await this.loginWithRetry();
        return this.rawRequest<T>(method, path, body, false);
      }
      let message = `Vault request failed with status ${response.status}`;
      try {
        const errorPayload = (await response.json()) as { errors?: string[] };
        if (errorPayload.errors?.length) message = errorPayload.errors.join('; ');
      } catch {}
      throw new VaultError(message, response.status);
    }
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  private buildUrl(path: string): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const cleaned = path.replace(/^\/+/, '');
    return `${base}/v1/${cleaned}`;
  }
}
