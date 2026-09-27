import { Types } from 'mongoose';
import type { NextRequest } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ActivityLog, {
  type ActivityAction,
  type ActivityEntityType,
  type IActivityLog,
} from '@/models/ActivityLog';

export interface RecordActivityOptions {
  siteId: Types.ObjectId | string;
  user?: {
    id?: string | Types.ObjectId | null;
    name?: string | null;
    email?: string | null;
  } | null;
  action: ActivityAction | string;
  entityType: ActivityEntityType | string;
  entityId: string | Types.ObjectId;
  entityTitle: string;
  metadata?: Record<string, unknown>;
  req?: NextRequest | null;
  ipAddress?: string | null;
}

/**
 * Records an editorial or administrative action into the site-scoped ActivityLog.
 * Designed to be non-blocking and safe: failures are logged as warnings and never
 * abort the primary mutation.
 */
export async function recordActivity(
  options: RecordActivityOptions,
): Promise<IActivityLog | null> {
  try {
    await connectToDatabase();

    const siteId =
      typeof options.siteId === 'string'
        ? new Types.ObjectId(options.siteId)
        : options.siteId;

    let userId: Types.ObjectId | null = null;
    if (options.user?.id) {
      userId =
        typeof options.user.id === 'string'
          ? new Types.ObjectId(options.user.id)
          : options.user.id;
    }

    const userName = options.user?.name?.trim() || 'System';
    const userEmail = options.user?.email?.trim() || 'system';

    let ipAddress = options.ipAddress || 'unknown';
    if (ipAddress === 'unknown' && options.req) {
      const forwarded = options.req.headers.get('x-forwarded-for');
      ipAddress = forwarded ? forwarded.split(',')[0].trim() : 'local';
    }

    const log = await ActivityLog.create({
      siteId,
      userId,
      userName,
      userEmail,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId.toString(),
      entityTitle: options.entityTitle,
      metadata: options.metadata || {},
      ipAddress,
    });

    return log;
  } catch (error) {
    console.error('[activity-logger] Failed to record activity log:', error);
    return null;
  }
}
