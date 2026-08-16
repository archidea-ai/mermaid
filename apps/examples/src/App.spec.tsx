import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { examples } from './examples';
import { themes } from './themes';
import { decodeHash, encodeSource } from './share-link';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="proxy-svg"></svg>' })),
    parse: vi.fn(),
    detectType: vi.fn(() => 'sequence'),
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: {},
  },
}));

describe('examples app', () => {
  // The app writes both, so neither may leak from one test into the next.
  beforeEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
    window.localStorage.clear();
  });

  it('loads the first example by default', () => {
    render(<App />);

    expect((screen.getByLabelText('Diagram source') as HTMLTextAreaElement).value).toBe(
      examples[0]!.source,
    );
  });

  it('keeps the loader empty — it is an action, not a setting', async () => {
    const user = userEvent.setup();
    render(<App />);

    const loader = screen.getByRole('combobox', { name: 'Load example' });
    expect(loader.textContent).toContain('Load example');

    const checkout = examples.find((entry) => entry.id === 'checkout-parallel')!;
    await user.click(loader);
    await user.click(await screen.findByRole('option', { name: checkout.title }));

    // Still reads as the action, never as the example now on screen.
    expect(screen.getByRole('combobox', { name: 'Load example' }).textContent).toContain(
      'Load example',
    );
  });

  it('keeps the theme dropdown showing the theme in force', () => {
    render(<App />);

    expect(screen.getByRole('combobox', { name: 'Diagram theme' }).textContent).toContain(
      'Midnight',
    );
  });

  it('offers every registered example once opened', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('combobox', { name: 'Load example' }));
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);

    expect(options).toEqual(examples.map((example) => example.title));
  });

  it('shows the selected example source and renders it natively', async () => {
    render(<App />);

    expect((screen.getByLabelText('Diagram source') as HTMLTextAreaElement).value).toContain(
      'sequenceDiagram',
    );
    await waitFor(() => expect(screen.getByText('sequence-react')).toBeDefined());
  });

  it('reports the native renderer capabilities in the badge', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('sequence-react')).toBeDefined());
    expect(screen.getByText('step').getAttribute('data-on')).toBe('true');
    expect(screen.getByText('viewport').getAttribute('data-on')).toBe('false');
  });

  it('applies theme tokens to the renderer root and nothing outside it', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const root = () => container.querySelector('.archidea-sequence') as HTMLElement;
    await waitFor(() => expect(root()).not.toBeNull());

    const midnight = themes.find((theme) => theme.id === 'midnight')!;
    await user.click(screen.getByRole('combobox', { name: 'Diagram theme' }));
    await user.click(await screen.findByRole('option', { name: midnight.label }));

    await waitFor(() =>
      expect(root().style.getPropertyValue('--seq-surface')).toBe(midnight.tokens['--seq-surface']),
    );

    // The host page keeps its own variables — the selector reaches our components only.
    const host = container.querySelector('.app') as HTMLElement;
    expect(host.style.getPropertyValue('--seq-surface')).toBe('');
  });

  it('switches examples when a different one is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);

    const checkout = examples.find((entry) => entry.id === 'checkout-parallel')!;
    await user.click(screen.getByRole('combobox', { name: 'Load example' }));
    await user.click(await screen.findByRole('option', { name: checkout.title }));

    expect((screen.getByLabelText('Diagram source') as HTMLTextAreaElement).value).toContain(
      'par charge the card',
    );
  });

  describe('shareable link', () => {
    const sourceBox = () => screen.getByLabelText('Diagram source') as HTMLTextAreaElement;

    it('opens the chart carried in the fragment', () => {
      const shared = 'flowchart TD\n    Shared --> Chart';
      window.history.replaceState(null, '', `#${encodeSource(shared)}`);

      render(<App />);

      expect(sourceBox().value).toBe(shared);
    });

    it('selects the example a shared chart turns out to be', () => {
      const release = examples.find((entry) => entry.id === 'release-flowchart')!;
      window.history.replaceState(null, '', `#${encodeSource(release.source)}`);

      render(<App />);

      expect(sourceBox().value).toBe(release.source);
      expect(screen.getByText(release.description)).toBeDefined();
    });

    it('opens the default example when the fragment is unreadable', () => {
      window.history.replaceState(null, '', '#c=!!!!not-lz-string!!!!');

      render(<App />);

      expect(sourceBox().value).toBe(examples[0]!.source);
    });

    it('rewrites the fragment as the source is edited', async () => {
      render(<App />);

      fireEvent.change(sourceBox(), { target: { value: 'flowchart LR\n    A --> B' } });

      await waitFor(() =>
        expect(decodeHash(window.location.hash)).toBe('flowchart LR\n    A --> B'),
      );
    });

    it('follows the chart when a different example is loaded', async () => {
      const user = userEvent.setup();
      render(<App />);

      const checkout = examples.find((entry) => entry.id === 'checkout-parallel')!;
      await user.click(screen.getByRole('combobox', { name: 'Load example' }));
      await user.click(await screen.findByRole('option', { name: checkout.title }));

      await waitFor(() => expect(decodeHash(window.location.hash)).toBe(checkout.source));
    });

    it('copies the link and says so, then goes quiet again', async () => {
      const user = userEvent.setup();
      render(<App />);

      fireEvent.change(sourceBox(), { target: { value: 'flowchart LR\n    A --> B' } });
      await waitFor(() => expect(window.location.hash).not.toBe(''));

      await user.click(screen.getByRole('button', { name: 'Copy link' }));

      expect(decodeHash(new URL(await navigator.clipboard.readText()).hash)).toBe(
        'flowchart LR\n    A --> B',
      );
      expect(screen.getByText('Link copied')).toBeDefined();
      await waitFor(() => expect(screen.getByText('Copy link')).toBeDefined(), { timeout: 3000 });
    });

    it('says so rather than lying when the clipboard refuses', async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Copy link' }));

      expect(await screen.findByText('Copy failed')).toBeDefined();
    });

    it('replaces the example blurb once the chart no longer is that example', async () => {
      render(<App />);
      expect(screen.getByText(examples[0]!.description)).toBeDefined();

      fireEvent.change(sourceBox(), { target: { value: 'flowchart LR\n    A --> B' } });

      expect(screen.queryByText(examples[0]!.description)).toBeNull();
      expect(screen.getByText(/the address bar carries this chart/)).toBeDefined();
    });
  });

  describe('remembered theme', () => {
    it('reopens on the theme last chosen', async () => {
      const user = userEvent.setup();
      const dusk = themes[1]!;
      const { unmount } = render(<App />);

      await user.click(screen.getByRole('combobox', { name: 'Diagram theme' }));
      await user.click(await screen.findByRole('option', { name: dusk.label }));
      unmount();

      render(<App />);

      expect(screen.getByRole('combobox', { name: 'Diagram theme' }).textContent).toContain(
        dusk.label,
      );
    });

    it('falls back to the default when the remembered theme is gone', () => {
      window.localStorage.setItem('archidea-mermaid-theme', 'a-theme-we-deleted');

      render(<App />);

      expect(screen.getByRole('combobox', { name: 'Diagram theme' }).textContent).toContain(
        themes[0]!.label,
      );
    });
  });
});
