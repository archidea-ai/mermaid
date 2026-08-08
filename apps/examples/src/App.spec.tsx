import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { examples } from './examples';
import { themes } from './themes';

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
});
