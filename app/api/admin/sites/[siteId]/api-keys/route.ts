import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { issueApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { issueApiKeySchema } from '@/lib/validation/api-key';
import ApiKey from '@/models/ApiKey';
import Site from '@/models/Site';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';

function assertSiteId(siteId: string): void {
  if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
    throw validationError({ siteId: ['Invalid site id'] });
  }
}

export const GET = withAdmin<{ siteId: string }>(
  async (_req, { params }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    await connectToDatabase();
    if (!(await Site.exists({ _id: siteId }))) throw notFound('Site');
    const keys = await ApiKey.find({ siteId }).sort({ createdAt: -1 }).exec();
    return NextResponse.json(keys.map(serializeApiKey));
  },
  { admin: true, site: false },
);

export const POST = withAdmin<{ siteId: string }>(
  async (req, { params, user }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    const parsed = issueApiKeySchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();
    if (!(await Site.exists({ _id: siteId }))) throw notFound('Site');
    const issued = await issueApiKey({ siteId, createdBy: user.id, ...parsed.data });
    await recordActivity({
      siteId,
      user,
      action: 'apiKey.create',
      entityType: 'apiKey',
      entityId: issued.key._id.toString(),
      entityTitle: issued.key.name,
      metadata: { prefix: issued.key.prefix, scopes: issued.key.scopes },
      req,
    });
    return NextResponse.json(
      { key: serializeApiKey(issued.key), plaintext: issued.plaintext },
      { status: 201 },
    );
  },
  { admin: true, site: false },
);
