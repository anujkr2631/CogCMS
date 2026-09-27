import { describe, expect, it } from 'vitest';
import { GET as listActivity } from '@/app/api/admin/activity/route';
import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { PUT as updateBlog, DELETE as deleteBlog } from '@/app/api/admin/blogs/[slug]/route';
import { POST as createAuthor } from '@/app/api/admin/authors/route';
import { DELETE as deleteAuthor } from '@/app/api/admin/authors/[slug]/route';
import { POST as issueApiKey } from '@/app/api/admin/sites/[siteId]/api-keys/route';
import { POST as rotateApiKey } from '@/app/api/admin/api-keys/[id]/rotate/route';
import { DELETE as revokeApiKey } from '@/app/api/admin/api-keys/[id]/route';
import ActivityLog from '@/models/ActivityLog';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };
const slugContext = (slug: string) => ({ params: Promise.resolve({ slug }) });
const siteIdContext = (siteId: string) => ({ params: Promise.resolve({ siteId }) });
const idContext = (id: string) => ({ params: Promise.resolve({ id }) });

describe('tenant-safe admin activity log API', () => {
  it('records blog lifecycle events and strictly isolates logs by site', async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);

    // Create a blog on Site A
    const createReqA = await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
      user: admin,
      siteId: siteA._id.toString(),
      method: 'POST',
      json: {
        title: 'Site A Launch Article',
        slug: 'site-a-launch',
        content: '<p>Welcome to Site A</p>',
        status: 'draft',
      },
    });
    const resA = await createBlog(createReqA, rootContext);
    expect(resA.status).toBe(201);

    // Verify activity on Site A
    const listReqA = await authenticatedRequest('http://localhost:3003/api/admin/activity', {
      user: admin,
      siteId: siteA._id.toString(),
    });
    const jsonA = await (await listActivity(listReqA, rootContext)).json();
    expect(jsonA.data).toHaveLength(1);
    expect(jsonA.data[0].action).toBe('blog.create');
    expect(jsonA.data[0].entityType).toBe('blog');
    expect(jsonA.data[0].entityTitle).toBe('Site A Launch Article');
    expect(jsonA.data[0].userName).toBe(admin.name);
    expect(jsonA.meta.total).toBe(1);

    // Verify Site B cannot see Site A's activity logs (tenant isolation)
    const listReqB = await authenticatedRequest('http://localhost:3003/api/admin/activity', {
      user: admin,
      siteId: siteB._id.toString(),
    });
    const jsonB = await (await listActivity(listReqB, rootContext)).json();
    expect(jsonB.data).toHaveLength(0);
    expect(jsonB.meta.total).toBe(0);
  });

  it('tracks status transitions for publish, unpublish, and delete events', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // 1. Create draft
    const createReq = await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
      user: admin,
      siteId: site._id.toString(),
      method: 'POST',
      json: {
        title: 'Lifecycle Post',
        slug: 'lifecycle-post',
        content: '<p>Draft body</p>',
        status: 'draft',
      },
    });
    expect((await createBlog(createReq, rootContext)).status).toBe(201);

    // 2. Publish post
    const publishReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/blogs/lifecycle-post',
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      },
    );
    expect((await updateBlog(publishReq, slugContext('lifecycle-post'))).status).toBe(200);

    // 3. Unpublish post
    const unpublishReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/blogs/lifecycle-post',
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      },
    );
    expect((await updateBlog(unpublishReq, slugContext('lifecycle-post'))).status).toBe(200);

    // 4. Delete post
    const deleteReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/blogs/lifecycle-post',
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'DELETE',
      },
    );
    expect((await deleteBlog(deleteReq, slugContext('lifecycle-post'))).status).toBe(200);

    // Verify all 4 recorded transitions in descending order
    const listReq = await authenticatedRequest('http://localhost:3003/api/admin/activity', {
      user: admin,
      siteId: site._id.toString(),
    });
    const { data, meta } = await (await listActivity(listReq, rootContext)).json();
    expect(meta.total).toBe(4);
    expect(data.map((d: any) => d.action)).toEqual([
      'blog.delete',
      'blog.unpublish',
      'blog.publish',
      'blog.create',
    ]);
  });

  it('records author and API key lifecycle events', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Create author
    const authorReq = await authenticatedRequest('http://localhost:3003/api/admin/authors', {
      user: admin,
      siteId: site._id.toString(),
      method: 'POST',
      json: { name: 'Sarah Connor', slug: 'sarah-connor', status: 'draft' },
    });
    expect((await createAuthor(authorReq, rootContext)).status).toBe(201);

    // Delete author
    const delAuthorReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/authors/sarah-connor',
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'DELETE',
      },
    );
    expect((await deleteAuthor(delAuthorReq, slugContext('sarah-connor'))).status).toBe(200);

    // Issue API key
    const issueKeyReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/sites/${site._id}/api-keys`,
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: { name: 'Deploy Key', scopes: ['content:read'] },
      },
    );
    const keyRes = await issueApiKey(issueKeyReq, siteIdContext(site._id.toString()));
    expect(keyRes.status).toBe(201);
    const { key } = await keyRes.json();

    // Rotate API key
    const rotateKeyReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/api-keys/${key.id}/rotate`,
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      },
    );
    const rotateRes = await rotateApiKey(rotateKeyReq, idContext(key.id));
    expect(rotateRes.status).toBe(201);
    const { key: rotatedKey } = await rotateRes.json();

    // Revoke API key
    const revokeKeyReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/api-keys/${rotatedKey.id}`,
      {
        user: admin,
        siteId: site._id.toString(),
        method: 'DELETE',
      },
    );
    expect((await revokeApiKey(revokeKeyReq, idContext(rotatedKey.id))).status).toBe(200);

    // Verify activity logs contain author and apiKey actions
    const listReq = await authenticatedRequest('http://localhost:3003/api/admin/activity', {
      user: admin,
      siteId: site._id.toString(),
    });
    const { data } = await (await listActivity(listReq, rootContext)).json();
    const actions = data.map((d: any) => d.action);
    expect(actions).toContain('author.create');
    expect(actions).toContain('author.delete');
    expect(actions).toContain('apiKey.create');
    expect(actions).toContain('apiKey.rotate');
    expect(actions).toContain('apiKey.revoke');
  });

  it('supports filtering by entityType, action, search, and pagination', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Create 3 distinct activity records directly or via mutations
    await ActivityLog.create([
      {
        siteId: site._id,
        userId: admin._id,
        userName: admin.name,
        userEmail: admin.email,
        action: 'blog.create',
        entityType: 'blog',
        entityId: 'id-1',
        entityTitle: 'Special Title with a+b syntax',
        metadata: {},
      },
      {
        siteId: site._id,
        userId: admin._id,
        userName: admin.name,
        userEmail: admin.email,
        action: 'author.create',
        entityType: 'author',
        entityId: 'id-2',
        entityTitle: 'Jane Doe Author',
        metadata: {},
      },
      {
        siteId: site._id,
        userId: admin._id,
        userName: admin.name,
        userEmail: admin.email,
        action: 'faq.create',
        entityType: 'faq',
        entityId: 'id-3',
        entityTitle: 'Billing Questions FAQ',
        metadata: {},
      },
    ]);

    // Test filter by entityType=author
    const authorFilterReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/activity?entityType=author',
      { user: admin, siteId: site._id.toString() },
    );
    const authorRes = await (await listActivity(authorFilterReq, rootContext)).json();
    expect(authorRes.data).toHaveLength(1);
    expect(authorRes.data[0].entityType).toBe('author');
    expect(authorRes.data[0].entityTitle).toBe('Jane Doe Author');

    // Test filter by action=faq.create
    const actionFilterReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/activity?action=faq.create',
      { user: admin, siteId: site._id.toString() },
    );
    const actionRes = await (await listActivity(actionFilterReq, rootContext)).json();
    expect(actionRes.data).toHaveLength(1);
    expect(actionRes.data[0].action).toBe('faq.create');

    // Test literal search with regex characters like '+'
    const searchReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/activity?search=a%2Bb',
      { user: admin, siteId: site._id.toString() },
    );
    const searchRes = await (await listActivity(searchReq, rootContext)).json();
    expect(searchRes.data).toHaveLength(1);
    expect(searchRes.data[0].entityTitle).toBe('Special Title with a+b syntax');

    // Test pagination (limit 2 on 3 items)
    const pageReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/activity?page=1&limit=2',
      { user: admin, siteId: site._id.toString() },
    );
    const pageRes = await (await listActivity(pageReq, rootContext)).json();
    expect(pageRes.data).toHaveLength(2);
    expect(pageRes.meta.total).toBe(3);
    expect(pageRes.meta.totalPages).toBe(2);
  });

  it('rejects invalid pagination and oversized queries with 400 VALIDATION_ERROR', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Limit over 100
    const overLimitReq = await authenticatedRequest(
      'http://localhost:3003/api/admin/activity?limit=150',
      { user: admin, siteId: site._id.toString() },
    );
    const overLimitRes = await listActivity(overLimitReq, rootContext);
    expect(overLimitRes.status).toBe(400);
    expect((await overLimitRes.json()).code).toBe('VALIDATION_ERROR');

    // Search query over 100 characters
    const longSearch = 'a'.repeat(105);
    const longSearchReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/activity?search=${longSearch}`,
      { user: admin, siteId: site._id.toString() },
    );
    const longSearchRes = await listActivity(longSearchReq, rootContext);
    expect(longSearchRes.status).toBe(400);
    expect((await longSearchRes.json()).code).toBe('VALIDATION_ERROR');
  });
});
