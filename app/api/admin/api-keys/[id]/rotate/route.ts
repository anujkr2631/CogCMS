import { NextResponse } from 'next/server';
import { rotateApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';

export const POST = withAdmin<{ id: string }>(
  async (req, { params, user }) => {
    const { id } = await params;
    const replacement = await rotateApiKey(id, user.id);
    await recordActivity({
      siteId: replacement.key.siteId,
      user,
      action: 'apiKey.rotate',
      entityType: 'apiKey',
      entityId: replacement.key._id.toString(),
      entityTitle: replacement.key.name,
      metadata: { prefix: replacement.key.prefix },
      req,
    });
    return NextResponse.json(
      { key: serializeApiKey(replacement.key), plaintext: replacement.plaintext },
      { status: 201 },
    );
  },
  { admin: true, site: false },
);
