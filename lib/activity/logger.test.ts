import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { recordActivity } from '@/lib/activity/logger';
import ActivityLog from '@/models/ActivityLog';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

describe('activity logger utility', () => {
  it('gracefully handles database errors without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const createSpy = vi.spyOn(ActivityLog, 'create').mockRejectedValueOnce(new Error('DB failure'));

    const result = await recordActivity({
      siteId: new Types.ObjectId(),
      user: { id: new Types.ObjectId(), name: 'Tester', email: 'test@example.com' },
      action: 'blog.create',
      entityType: 'blog',
      entityId: 'test-id',
      entityTitle: 'Test Blog',
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    createSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('extracts forwarded IP address from NextRequest', async () => {
    const siteId = new Types.ObjectId();
    const createSpy = vi
      .spyOn(ActivityLog, 'create')
      .mockImplementationOnce(async (doc: any) => doc);

    const req = new NextRequest('http://localhost:3003/api/admin/blogs', {
      headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1' },
    });

    await recordActivity({
      siteId,
      action: 'blog.create',
      entityType: 'blog',
      entityId: 'test-id',
      entityTitle: 'Test Blog',
      req,
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '198.51.100.42',
        userName: 'System',
        userEmail: 'system',
      }),
    );

    createSpy.mockRestore();
  });
});
