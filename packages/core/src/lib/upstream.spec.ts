import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const renderMock = vi.fn();
const parseMock = vi.fn();
const detectTypeMock = vi.fn(() => 'sequence');

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
    parse: parseMock,
    detectType: detectTypeMock,
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: { fake: true },
  },
}));

describe('loadUpstream', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it('resolves upstream through its default export', async () => {
    const { loadUpstream } = await import('./upstream');
    const upstream = await loadUpstream();

    expect(upstream.detectType('sequenceDiagram')).toBe('sequence');
    expect(upstream.mermaidAPI).toEqual({ fake: true });
  });

  it('imports upstream exactly once across concurrent and sequential callers', async () => {
    const { loadUpstream } = await import('./upstream');

    const [a, b] = await Promise.all([loadUpstream(), loadUpstream()]);
    expect(a).toBe(b);
    expect(await loadUpstream()).toBe(a);
  });

  it('exposes no synchronous handle before a load and the handle after', async () => {
    const { loadUpstream, getLoadedUpstream } = await import('./upstream');

    expect(getLoadedUpstream()).toBeUndefined();
    const upstream = await loadUpstream();
    expect(getLoadedUpstream()).toBe(upstream);
  });

  it('reports availability', async () => {
    const { isUpstreamAvailable } = await import('./upstream');
    await expect(isUpstreamAvailable()).resolves.toBe(true);
  });
});

describe('loadUpstream when the optional peer is absent', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('mermaid', () => {
      throw new Error("Cannot find module 'mermaid'");
    });
  });
  afterEach(() => vi.doUnmock('mermaid'));

  it('throws UpstreamNotInstalledError naming the install command', async () => {
    const { loadUpstream } = await import('./upstream');

    await expect(loadUpstream()).rejects.toMatchObject({
      code: 'UPSTREAM_NOT_INSTALLED',
      name: 'UpstreamNotInstalledError',
    });
    await expect(loadUpstream()).rejects.toThrow(/pnpm add mermaid/);
  });

  it('memoises the rejection instead of retrying an import that cannot succeed', async () => {
    const { loadUpstream } = await import('./upstream');

    const first = loadUpstream().catch((error) => error);
    const second = loadUpstream().catch((error) => error);
    expect(await first).toBe(await second);
  });

  it('reports unavailability without throwing', async () => {
    const { isUpstreamAvailable } = await import('./upstream');
    await expect(isUpstreamAvailable()).resolves.toBe(false);
  });
});
