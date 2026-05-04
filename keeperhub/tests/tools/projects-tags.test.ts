import { describe, it, expect, vi } from 'vitest';
import { handleListProjects, handleListTags, listProjectsSchema, listTagsSchema } from '../../src/tools/projects-tags.js';
import type { KeeperHubClient } from '../../src/client/keeperhub.js';
import type { Project, Tag } from '../../src/types/index.js';

const mockProjects: Project[] = [
  { id: 'proj_1', name: 'DeFi Monitoring', description: 'Monitors', workflowCount: 3, organizationId: 'org_1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'proj_2', name: 'Liquidation Bots', workflowCount: 1, organizationId: 'org_1', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-02-01T00:00:00Z' },
];

const mockTags: Tag[] = [
  { id: 'tag_1', name: 'production', color: '#00FF00', workflowCount: 5, organizationId: 'org_1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'tag_2', name: 'staging', color: '#FFA500', workflowCount: 2, organizationId: 'org_1', createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-01-15T00:00:00Z' },
];

function makeClient(overrides: Partial<KeeperHubClient> = {}): KeeperHubClient {
  return {
    listProjects: vi.fn().mockResolvedValue(mockProjects),
    listTags: vi.fn().mockResolvedValue(mockTags),
    ...overrides,
  } as unknown as KeeperHubClient;
}

describe('listProjectsSchema', () => {
  it('parses empty args', () => {
    expect(() => listProjectsSchema.parse({})).not.toThrow();
  });

  it('rejects unexpected args', () => {
    expect(() => listProjectsSchema.parse({ foo: 'bar' })).toThrow();
  });
});

describe('listTagsSchema', () => {
  it('parses empty args', () => {
    expect(() => listTagsSchema.parse({})).not.toThrow();
  });

  it('rejects unexpected args', () => {
    expect(() => listTagsSchema.parse({ foo: 'bar' })).toThrow();
  });
});

describe('handleListProjects', () => {
  it('returns projects array with hint', async () => {
    const client = makeClient();
    const result = await handleListProjects(client);

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.projects).toEqual(mockProjects);
    expect(parsed.hint).toContain('project_id');
  });

  it('returns empty projects array when none exist', async () => {
    const client = makeClient({ listProjects: vi.fn().mockResolvedValue([]) } as any);
    const result = await handleListProjects(client);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.projects).toEqual([]);
    expect(parsed.hint).toBeDefined();
  });

  it('propagates client errors', async () => {
    const client = makeClient({
      listProjects: vi.fn().mockRejectedValue(new Error('API error')),
    } as any);

    await expect(handleListProjects(client)).rejects.toThrow('API error');
  });
});

describe('handleListTags', () => {
  it('returns tags array with hint', async () => {
    const client = makeClient();
    const result = await handleListTags(client);

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tags).toEqual(mockTags);
    expect(parsed.hint).toContain('tag_id');
  });

  it('returns empty tags array when none exist', async () => {
    const client = makeClient({ listTags: vi.fn().mockResolvedValue([]) } as any);
    const result = await handleListTags(client);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tags).toEqual([]);
    expect(parsed.hint).toBeDefined();
  });

  it('propagates client errors', async () => {
    const client = makeClient({
      listTags: vi.fn().mockRejectedValue(new Error('API error')),
    } as any);

    await expect(handleListTags(client)).rejects.toThrow('API error');
  });
});
