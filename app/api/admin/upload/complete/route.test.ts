import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetEnvCache } from '@/lib/env';
import { unauthorized } from '@/lib/http/errors';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findSite: vi.fn(), complete: vi.fn() }));
vi.mock('@/lib/auth/require', async (original) => ({
  ...(await original<typeof import('@/lib/auth/require')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/models/Site', () => ({ default: { findById: mocks.findSite } }));
vi.mock('@/lib/aws-s3', () => ({ completeMediaUpload: mocks.complete }));
const siteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ctx = { params: Promise.resolve({}) };
function request(headers = {}) {
  return new NextRequest('https://cms.example/api/admin/upload/complete', {
    method: 'POST',
    headers: {
      origin: 'https://cms.example',
      'content-type': 'application/json',
      'x-cms-site': siteId,
      ...headers,
    },
    body: JSON.stringify({ ticket: 'intent' }),
  });
}
beforeEach(() => {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('CMS_JWT_SECRET', 'x'.repeat(32));
  resetEnvCache();
  mocks.requireUser.mockResolvedValue({
    id: 'cccccccccccccccccccccccc',
    role: 'editor',
    siteIds: [siteId],
  });
  mocks.findSite.mockImplementation((id) => ({
    exec: async () => ({
      _id: id,
      status: 'active',
      mediaPrefix: 'test',
      publicPaths: {},
      publisher: {},
    }),
  }));
  mocks.complete.mockResolvedValue({ url: 'https://media.example/sites/test/image.png' });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnvCache();
});
describe('completion route authorization', () => {
  it('returns only the durable URL after rechecking the current identity and site', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), ctx);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'https://media.example/sites/test/image.png' });
    expect(mocks.complete).toHaveBeenCalledWith(
      { ticket: 'intent' },
      { userId: 'cccccccccccccccccccccccc', siteId, prefix: 'test' },
    );
  }, 15000);
  it('rejects a revoked session before completion', async () => {
    const { POST } = await import('./route');
    mocks.requireUser.mockRejectedValue(unauthorized());
    expect((await POST(request(), ctx)).status).toBe(401);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('rejects cross-site, archived-site and cross-origin completion', async () => {
    const { POST } = await import('./route');
    for (const headers of [
      { 'x-cms-site': 'bbbbbbbbbbbbbbbbbbbbbbbb' },
      { origin: 'https://evil.example' },
    ])
      expect((await POST(request(headers), ctx)).status).toBe(403);
    mocks.findSite.mockReturnValue({ exec: async () => ({ _id: siteId, status: 'archived' }) });
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
