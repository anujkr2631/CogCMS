import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ActivityAction =
  | 'blog.create'
  | 'blog.update'
  | 'blog.publish'
  | 'blog.unpublish'
  | 'blog.delete'
  | 'author.create'
  | 'author.update'
  | 'author.delete'
  | 'faq.create'
  | 'faq.update'
  | 'faq.delete'
  | 'whitepaper.create'
  | 'whitepaper.update'
  | 'whitepaper.delete'
  | 'releaseNote.create'
  | 'releaseNote.update'
  | 'releaseNote.delete'
  | 'apiKey.create'
  | 'apiKey.rotate'
  | 'apiKey.revoke'
  | 'site.update'
  | 'site.webhook_regenerate';

export type ActivityEntityType =
  | 'blog'
  | 'author'
  | 'faq'
  | 'whitepaper'
  | 'releaseNote'
  | 'apiKey'
  | 'site';

export interface IActivityLog extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  userId: Types.ObjectId | null;
  userName: string;
  userEmail: string;
  action: ActivityAction | string;
  entityType: ActivityEntityType | string;
  entityId: string;
  entityTitle: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, required: true, default: 'System' },
    userEmail: { type: String, required: true, default: 'system' },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true },
    entityTitle: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    ipAddress: { type: String, default: 'unknown' },
  },
  { timestamps: true, collection: 'activity_logs' },
);

ActivityLogSchema.index({ siteId: 1, createdAt: -1 });
ActivityLogSchema.index({ siteId: 1, entityType: 1, createdAt: -1 });
ActivityLogSchema.index({ siteId: 1, action: 1, createdAt: -1 });
ActivityLogSchema.index({ siteId: 1, userId: 1, createdAt: -1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;
