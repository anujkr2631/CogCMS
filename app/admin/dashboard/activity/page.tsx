'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSite } from '@/components/admin/site-provider';

interface ActivityItem {
  _id: string;
  siteId: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

interface ActivityResponse {
  data: ActivityItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 30) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getActionBadge(action: string): { label: string; badgeClass: string } {
  switch (action) {
    case 'blog.publish':
      return {
        label: 'Published',
        badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60',
      };
    case 'blog.unpublish':
      return {
        label: 'Unpublished',
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200/60',
      };
    case 'blog.create':
      return {
        label: 'Created Post',
        badgeClass: 'bg-blue-50 text-blue-800 border border-blue-200/60',
      };
    case 'blog.update':
      return {
        label: 'Updated Post',
        badgeClass: 'bg-stone-100 text-stone-700 border border-stone-200',
      };
    case 'blog.delete':
      return {
        label: 'Deleted Post',
        badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200/60',
      };
    case 'author.create':
      return {
        label: 'Created Author',
        badgeClass: 'bg-indigo-50 text-indigo-800 border border-indigo-200/60',
      };
    case 'author.update':
      return {
        label: 'Updated Author',
        badgeClass: 'bg-stone-100 text-stone-700 border border-stone-200',
      };
    case 'author.delete':
      return {
        label: 'Deleted Author',
        badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200/60',
      };
    case 'apiKey.create':
      return {
        label: 'Issued Key',
        badgeClass: 'bg-purple-50 text-purple-800 border border-purple-200/60',
      };
    case 'apiKey.rotate':
      return {
        label: 'Rotated Key',
        badgeClass: 'bg-violet-50 text-violet-800 border border-violet-200/60',
      };
    case 'apiKey.revoke':
      return {
        label: 'Revoked Key',
        badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200/60',
      };
    case 'site.update':
      return {
        label: 'Updated Site',
        badgeClass: 'bg-cyan-50 text-cyan-800 border border-cyan-200/60',
      };
    case 'faq.create':
      return {
        label: 'Created FAQ',
        badgeClass: 'bg-teal-50 text-teal-800 border border-teal-200/60',
      };
    case 'faq.update':
      return {
        label: 'Updated FAQ',
        badgeClass: 'bg-stone-100 text-stone-700 border border-stone-200',
      };
    case 'faq.delete':
      return {
        label: 'Deleted FAQ',
        badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200/60',
      };
    default:
      return {
        label: action.replace('.', ' '),
        badgeClass: 'bg-stone-100 text-stone-700 border border-stone-200',
      };
  }
}

function getEntityIcon(type: string): string {
  switch (type) {
    case 'blog':
      return '📝';
    case 'author':
      return '👤';
    case 'apiKey':
      return '🔑';
    case 'site':
      return '🌐';
    case 'faq':
      return '❓';
    case 'whitepaper':
      return '📄';
    case 'releaseNote':
      return '🚀';
    default:
      return '📌';
  }
}

export default function ActivityLogPage() {
  const site = useSite();
  const [, startTransition] = useTransition();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);

  const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (entityType !== 'all') params.set('entityType', entityType);
    if (actionFilter !== 'all') params.set('action', actionFilter);
    if (search.trim()) params.set('search', search.trim());

    fetch(`/api/admin/activity?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load activity logs');
        const json: ActivityResponse = await res.json();
        if (!controller.signal.aborted) {
          startTransition(() => {
            setItems(json.data);
            setMeta(json.meta);
            setState('ready');
          });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error(err);
          setState('error');
        }
      });

    return () => controller.abort();
  }, [site?.id, page, entityType, actionFilter, search, attempt]);

  const handleResetFilters = () => {
    setSearch('');
    setEntityType('all');
    setActionFilter('all');
    setPage(1);
  };

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-sm">
              📜
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-950">Activity Log</h1>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Immutable audit trail of content and workspace events
            {site ? ` for ${site.name}` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAttempt((prev) => prev + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-xs hover:bg-stone-50 active:translate-y-px"
        >
          <span className="text-stone-500">↻</span>
          Refresh
        </button>
      </header>

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-stone-700">
          Search logs
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, user name, or email…"
            className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-500 focus:bg-white focus:outline-hidden"
          />
        </label>

        <label className="text-sm font-medium text-stone-700">
          Entity type
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 focus:border-orange-500 focus:bg-white sm:w-44"
          >
            <option value="all">All entities</option>
            <option value="blog">Blogs</option>
            <option value="author">Authors</option>
            <option value="apiKey">API Keys</option>
            <option value="site">Site Settings</option>
            <option value="faq">FAQs</option>
          </select>
        </label>

        <label className="text-sm font-medium text-stone-700">
          Action
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 focus:border-orange-500 focus:bg-white sm:w-44"
          >
            <option value="all">All actions</option>
            <option value="blog.publish">Published</option>
            <option value="blog.unpublish">Unpublished</option>
            <option value="blog.create">Created Post</option>
            <option value="blog.update">Updated Post</option>
            <option value="blog.delete">Deleted Post</option>
            <option value="author.create">Created Author</option>
            <option value="author.delete">Deleted Author</option>
            <option value="apiKey.create">Issued API Key</option>
            <option value="apiKey.rotate">Rotated API Key</option>
            <option value="apiKey.revoke">Revoked API Key</option>
            <option value="faq.create">Created FAQ</option>
            <option value="site.update">Updated Site</option>
          </select>
        </label>
      </div>

      {/* Meta status info */}
      <div className="my-4 flex items-center justify-between text-xs text-stone-500">
        <span>
          {state === 'ready'
            ? `Showing ${items.length} of ${meta.total} recorded events`
            : state === 'loading'
              ? 'Loading audit records…'
              : ''}
        </span>
        {Boolean(search || entityType !== 'all' || actionFilter !== 'all') && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="font-medium text-orange-700 underline hover:text-orange-800"
          >
            Clear active filters
          </button>
        )}
      </div>

      {/* Table / Timeline Container */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs">
        {state === 'loading' && (
          <div role="status" className="space-y-3 p-6">
            <p className="text-sm text-stone-500">Fetching audit logs…</p>
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="h-14 animate-pulse rounded-lg bg-stone-100" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="p-8 text-center">
            <h2 className="text-base font-semibold text-stone-900">
              Unable to load activity logs
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              There was an issue communicating with the database. Please try again.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((prev) => prev + 1)}
              className="mt-4 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
            >
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && items.length === 0 && (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-400">
              📜
            </div>
            <h2 className="mt-4 text-base font-semibold text-stone-900">No events found</h2>
            <p className="mt-2 text-sm text-stone-600">
              {search || entityType !== 'all' || actionFilter !== 'all'
                ? 'No activity logs match your filter criteria.'
                : 'Activity will automatically appear here as changes are made in the CMS.'}
            </p>
            {Boolean(search || entityType !== 'all' || actionFilter !== 'all') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 text-sm font-semibold text-orange-800 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {state === 'ready' && items.length > 0 && (
          <div className="divide-y divide-stone-100">
            {items.map((item) => {
              const { label, badgeClass } = getActionBadge(item.action);
              const entityIcon = getEntityIcon(item.entityType);

              return (
                <div
                  key={item._id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-stone-50/70 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  {/* Left: User Avatar & Event Info */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700"
                      title={item.userEmail}
                    >
                      {item.userName ? item.userName.charAt(0).toUpperCase() : 'S'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-stone-900 truncate">
                          {item.userName}
                        </span>
                        <span className="text-xs text-stone-400">·</span>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                        >
                          {label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                          <span>{entityIcon}</span>
                          <span className="capitalize">{item.entityType}</span>
                        </span>
                      </div>

                      <p className="mt-1 text-sm font-medium text-stone-800 truncate">
                        {item.entityTitle}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                        <span>{item.userEmail}</span>
                        <span>·</span>
                        <span title={new Date(item.createdAt).toLocaleString()}>
                          {formatRelativeTime(item.createdAt)}
                        </span>
                        {item.ipAddress && item.ipAddress !== 'unknown' && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[11px] text-stone-400">
                              {item.ipAddress}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    {item.entityType === 'blog' && typeof item.metadata?.slug === 'string' && (
                      <Link
                        href={`/admin/dashboard/blogs/new?slug=${encodeURIComponent(
                          String(item.metadata.slug),
                        )}`}
                        className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Edit Blog
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {state === 'ready' && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50/50 px-5 py-3">
            <span className="text-xs text-stone-500">
              Page {meta.page} of {meta.totalPages} ({meta.total} total items)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Slide-Over / Modal */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Activity Details</h3>
                <p className="text-xs text-stone-500">
                  Event ID: <span className="font-mono">{selectedItem._id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b border-stone-100 pb-2">
                <span className="font-medium text-stone-500">Action</span>
                <span className="col-span-2 font-semibold text-stone-800">
                  {selectedItem.action}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-stone-100 pb-2">
                <span className="font-medium text-stone-500">Entity</span>
                <span className="col-span-2 text-stone-800">
                  {selectedItem.entityType}: {selectedItem.entityTitle}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-stone-100 pb-2">
                <span className="font-medium text-stone-500">Performed by</span>
                <span className="col-span-2 text-stone-800">
                  {selectedItem.userName} ({selectedItem.userEmail})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-stone-100 pb-2">
                <span className="font-medium text-stone-500">Timestamp</span>
                <span className="col-span-2 text-stone-800">
                  {new Date(selectedItem.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-stone-100 pb-2">
                <span className="font-medium text-stone-500">IP Address</span>
                <span className="col-span-2 font-mono text-xs text-stone-700">
                  {selectedItem.ipAddress}
                </span>
              </div>

              <div>
                <span className="block font-medium text-stone-500 mb-1.5">Event Metadata</span>
                <pre className="max-h-48 overflow-auto rounded-lg bg-stone-900 p-3 font-mono text-xs text-stone-200">
                  {JSON.stringify(selectedItem.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
