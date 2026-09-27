import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { serializeSite } from '@/lib/admin/serializers';
import { updateSiteSchema } from '@/lib/validation/site';
import Site from '@/models/Site';
import { notifySiteWebhook } from '@/lib/webhook';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';

function assertSiteId(siteId: string): void {
  if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
    throw validationError({ siteId }, 'Invalid site id');
  }
}

export const GET = withAdmin<{ siteId: string }>(
  async (_req, { params }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    await connectToDatabase();
    const site = await Site.findById(siteId).exec();
    if (!site) throw notFound('Site');
    return NextResponse.json(serializeSite(site));
  },
  { admin: true, site: false },
);

export const PUT = withAdmin<{ siteId: string }>(
  async (req, { params, user }) => {
    const { siteId } = await params;
    assertSiteId(siteId);
    const parsed = updateSiteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error.flatten());
    await connectToDatabase();

    const site = await Site.findById(siteId).exec();
    if (!site) throw notFound('Site');
    site.set(parsed.data);
    if (parsed.data.webhookUrl === null) site.webhookUrl = undefined;
    await site.save();
    notifySiteWebhook(site._id.toString(), {
      type: 'content.updated',
      contentType: 'site',
      slug: site.slug,
      id: site._id.toString(),
    });
    await recordActivity({
      siteId: site._id.toString(),
      user,
      action: 'site.update',
      entityType: 'site',
      entityId: site._id.toString(),
      entityTitle: site.name,
      metadata: { slug: site.slug },
      req,
    });
    return NextResponse.json(serializeSite(site));
  },
  { admin: true, site: false },
);
