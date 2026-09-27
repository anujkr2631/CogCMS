import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Author from '@/models/Author';
import { authorInputSchema } from '@/lib/validation/author';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { notifySiteWebhook } from '@/lib/webhook';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const authors = await Author.find({ siteId: site.id }).sort({ name: 1 }).exec();
  return NextResponse.json(authors);
});

export const POST = withAdmin(async (req, { user, site }) => {
  const raw = await readJson(req);
  const parsed = authorInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid author payload');
  const { status = 'publish', ...data } = parsed.data;

  await connectToDatabase();
  const author = await Author.create({
    ...data,
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    siteId: site.id,
    createdBy: user.id,
    updatedBy: user.id,
  });
  if (author.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.published',
      contentType: 'author',
      slug: author.slug,
      id: author._id.toString(),
    });
  }
  await recordActivity({
    siteId: site.id,
    user,
    action: 'author.create',
    entityType: 'author',
    entityId: author._id.toString(),
    entityTitle: author.name,
    metadata: { slug: author.slug, status: author.status },
    req,
  });
  return NextResponse.json(author, { status: 201 });
});
