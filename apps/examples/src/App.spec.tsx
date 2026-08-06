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
  it('lists every registered example', () => {
    render(<App />);
    for (const example of examples) {
      expect(screen.getByRole('button', { name: example.title })).toBeDefined();
    }
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
    await user.selectOptions(screen.getByLabelText('Diagram theme'), 'midnight');

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

    await user.click(screen.getByRole('button', { name: examples[1]!.title }));

    expect((screen.getByLabelText('Diagram source') as HTMLTextAreaElement).value).toContain(
      'par charge the card',
    );
  });
});
