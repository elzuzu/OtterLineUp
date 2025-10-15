import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { VaultClient, VaultError } from '../src/core/vaultClient.js';

interface MockResponse {
  status: number;
  body?: unknown;
}

const jsonResponse = (status: number, body?: unknown): Response =>
  new Response(body !== undefined ? JSON.stringify(body) : undefined, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('VaultClient', () => {
  it('re-authenticates when the token is invalidated mid-request', async () => {
    const responses: MockResponse[] = [
      { status: 200, body: { auth: { client_token: 'token-1', lease_duration: 120 } } },
      { status: 403, body: { errors: ['permission denied'] } },
      { status: 200, body: { auth: { client_token: 'token-2', lease_duration: 120 } } },
      { status: 200, body: { data: { data: { foo: 'bar' }, metadata: { version: 1 } } } },
    ];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch invocation');
      return jsonResponse(next.status, next.body);
    };

    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
      fetchImpl: fetchStub,
      minRenewSeconds: 10,
    });

    const secret = await client.readSecret<{ foo: string }>('secret/data/foo');
    assert.equal(secret.data.foo, 'bar');
    assert.equal(responses.length, 0);
    assert.equal(calls.length, 4);

    const firstSecretCall = calls[1]!;
    assert.equal(firstSecretCall.url, 'https://vault.example/v1/secret/data/foo');
    const firstHeaders = firstSecretCall.init?.headers as Record<string, string> | undefined;
    assert.ok(firstHeaders);
    assert.equal(firstHeaders['X-Vault-Token'], 'token-1');

    const secondSecretCall = calls[3]!;
    const secondHeaders = secondSecretCall.init?.headers as Record<string, string> | undefined;
    assert.ok(secondHeaders);
    assert.equal(secondHeaders['X-Vault-Token'], 'token-2');
  });

  it('propagates errors when re-authentication fails', async () => {
    const responses: MockResponse[] = [
      { status: 200, body: { auth: { client_token: 'token-1', lease_duration: 120 } } },
      { status: 403, body: { errors: ['permission denied'] } },
      { status: 401, body: { errors: ['invalid secret id'] } },
    ];
    const fetchStub: typeof fetch = async (_url, _init) => {
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch invocation');
      return jsonResponse(next.status, next.body);
    };

    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
      fetchImpl: fetchStub,
      maxLoginAttempts: 1,
    });

    await assert.rejects(async () => client.readSecret('secret/data/foo'), (error: unknown) => {
      assert.ok(error instanceof VaultError);
      assert.equal(error.status, 401);
      assert.equal(error.message, 'invalid secret id');
      return true;
    });
  });

  it('writes secrets and re-authenticates when the token is invalidated', async () => {
    const responses: MockResponse[] = [
      { status: 200, body: { auth: { client_token: 'token-1', lease_duration: 120 } } },
      { status: 403, body: { errors: ['permission denied'] } },
      { status: 200, body: { auth: { client_token: 'token-2', lease_duration: 120 } } },
      { status: 204 },
    ];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch invocation');
      return jsonResponse(next.status, next.body);
    };

    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
      fetchImpl: fetchStub,
      minRenewSeconds: 10,
    });

    await client.writeSecret('secret/data/foo', { foo: 'baz' });
    assert.equal(responses.length, 0);
    assert.equal(calls.length, 4);

    const writeCall = calls[1]!;
    assert.equal(writeCall.url, 'https://vault.example/v1/secret/data/foo');
    const firstHeaders = writeCall.init?.headers as Record<string, string> | undefined;
    assert.ok(firstHeaders);
    assert.equal(firstHeaders['X-Vault-Token'], 'token-1');
    assert.equal(firstHeaders['Content-Type'], 'application/json');
    assert.equal(writeCall.init?.body, JSON.stringify({ data: { foo: 'baz' } }));

    const retryCall = calls[3]!;
    const retryHeaders = retryCall.init?.headers as Record<string, string> | undefined;
    assert.ok(retryHeaders);
    assert.equal(retryHeaders['X-Vault-Token'], 'token-2');
    assert.equal(retryCall.init?.body, JSON.stringify({ data: { foo: 'baz' } }));
  });

  it('fetches KV v2 secret metadata when provided a data path', async () => {
    const responses: MockResponse[] = [
      { status: 200, body: { auth: { client_token: 'token-1', lease_duration: 120 } } },
      { status: 200, body: { data: { current_version: 3, versions: { '3': { created_time: '2024-07-05T00:00:00Z' } } } } },
    ];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch invocation');
      return jsonResponse(next.status, next.body);
    };

    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
      fetchImpl: fetchStub,
    });

    const metadata = await client.getSecretMetadata<{ current_version: number }>('secret/data/trading/sx/wallet');
    assert.equal(metadata.current_version, 3);
    assert.equal(calls.length, 2);
    const metadataCall = calls[1]!;
    assert.equal(metadataCall.url, 'https://vault.example/v1/secret/metadata/trading/sx/wallet');
    const headers = metadataCall.init?.headers as Record<string, string> | undefined;
    assert.ok(headers);
    assert.equal(headers['X-Vault-Token'], 'token-1');
  });

  it('rejects metadata requests without a KV v2 path segment', async () => {
    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
    });

    await assert.rejects(
      async () => client.getSecretMetadata('secret/trading/sx/wallet'),
      /requires KV v2 data or metadata path/,
    );
  });

  it('requires writeSecret data to be an object', async () => {
    const client = new VaultClient({
      baseUrl: 'https://vault.example',
      roleId: 'role',
      secretId: 'secret',
    });

    await assert.rejects(
      async () => client.writeSecret('secret/data/foo', null as unknown as Record<string, unknown>),
      /requires data object/,
    );
  });
});
