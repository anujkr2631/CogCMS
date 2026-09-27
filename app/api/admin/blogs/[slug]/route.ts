import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { blogInputSchema } from '@/lib/validation/blog';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';
import { recordActivity } from '@/lib/activity/logger';

export const dynamic = 'force-dynamic';
type Params = { slug: string };

export const GET = withAdmin<Params>(async (_req, { params, site }) => {
  const { slug } = await params;
  await connectToDatabase();
  const blog = await Blog.findOne({ slug, siteId: site.id }).exec();
  if (!blog) throw notFound('Blog');
  return NextResponse.json(blog);
});

export const PUT = withAdmin<Params>(async (req, { params, user, site }) => {
  const { slug } = await params;
  const parsed = blogInputSchema.partial().safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid blog payload');

  await connectToDatabase();
  const existing = await Blog.findOne({ slug, siteId: site.id }).exec();
  if (!existing) throw notFound('Blog');

  const nextStatus = parsed.data.status ?? existing.status;
  const nextAuthorId =
    parsed.data.authorId === undefined ? existing.authorId?.toString() : parsed.data.authorId;
  await assertBlogAuthorIsUsable({
    authorId: nextAuthorId,
    siteId: site.id,
    blogStatus: nextStatus,
  });

  const update: Record<string, unknown> = { ...parsed.data, updatedBy: user.id };
  delete update.createdAt;
  if (parsed.data.content !== undefined) {
    const content = sanitizeBlogHtml(parsed.data.content);
    update.content = content;
    update.rendered = await renderBlogSnapshot(content);
  }
  if (parsed.data.status === 'publish' && !existing.publishedAt) update.publishedAt = new Date();

  const blog = await Blog.findOneAndUpdate(
    { _id: existing._id, siteId: site.id },
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!blog) throw notFound('Blog');
  invalidateRelatedPosts(site.id);
  const eventType = deliveryEventType(existing.status, blog.status);
  if (eventType) {
    notifySiteWebhook(site.id, {
      type: eventType,
      contentType: 'post',
      slug: blog.slug,
      id: blog._id.toString(),
    });
  }

  const action =
    existing.status !== 'publish' && blog.status === 'publish'
      ? 'blog.publish'
      : existing.status === 'publish' && blog.status === 'draft'
        ? 'blog.unpublish'
        : 'blog.update';

  await recordActivity({
    siteId: site.id,
    user,
    action,
    entityType: 'blog',
    entityId: blog._id.toString(),
    entityTitle: blog.title,
    metadata: {
      slug: blog.slug,
      previousStatus: existing.status,
      newStatus: blog.status,
    },
    req,
  });

  return NextResponse.json(blog);
});

export const DELETE = withAdmin<Params>(async (req, { params, user, site }) => {
  const { slug } = await params;
  await connectToDatabase();
  const blog = await Blog.findOneAndDelete({ slug, siteId: site.id }).exec();
  if (!blog) throw notFound('Blog');
  invalidateRelatedPosts(site.id);
  if (blog.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.deleted',
      contentType: 'post',
      slug: blog.slug,
      id: blog._id.toString(),
    });
  }
  await recordActivity({
    siteId: site.id,
    user,
    action: 'blog.delete',
    entityType: 'blog',
    entityId: blog._id.toString(),
    entityTitle: blog.title,
    metadata: { slug: blog.slug },
    req,
  });
  return NextResponse.json({ message: 'Deleted successfully' });
});
