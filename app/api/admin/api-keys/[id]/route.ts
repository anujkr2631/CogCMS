import { NextResponse } from 'next/server';
import { revokeApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';

export const DELETE = withAdmin<{ id: string }>(
  async (req, { params, user }) => {
    const { id } = await params;
    const key = await revokeApiKey(id);
    await recordActivity({
      siteId: key.siteId,
      user,
      action: 'apiKey.revoke',
      entityType: 'apiKey',
      entityId: key._id.toString(),
      entityTitle: key.name,
      metadata: { prefix: key.prefix },
      req,
    });
    return NextResponse.json(serializeApiKey(key));
  },
  { admin: true, site: false },
);
