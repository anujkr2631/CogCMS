import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { withAdmin } from '@/lib/http/admin-handler';
import { parsePagination } from '@/lib/http/api-query';
import { validationError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GET = withAdmin(async (req, { site }) => {
  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = parsePagination(searchParams);

  const entityType = searchParams.get('entityType')?.trim();
  const action = searchParams.get('action')?.trim();
  const search = searchParams.get('search')?.trim();

  if (search && search.length > 100) {
    throw validationError({ search }, 'Search query must not exceed 100 characters');
  }

  await connectToDatabase();

  const query: Record<string, unknown> = {
    siteId: site.id,
  };

  if (entityType && entityType !== 'all') {
    query.entityType = entityType;
  }

  if (action && action !== 'all') {
    query.action = action;
  }

  if (search) {
    const escaped = escapeRegex(search);
    query.$or = [
      { entityTitle: { $regex: escaped, $options: 'i' } },
      { userName: { $regex: escaped, $options: 'i' } },
      { userEmail: { $regex: escaped, $options: 'i' } },
      { action: { $regex: escaped, $options: 'i' } },
    ];
  }

  const total = await ActivityLog.countDocuments(query);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const data =
    total === 0 || page > totalPages
      ? []
      : await ActivityLog.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec();

  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  });
});
