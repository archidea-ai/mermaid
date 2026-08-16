import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { C4Surface } from './surface';

// Real mermaid cannot render in jsdom — no SVG layout — and importing it into a
// jsdom worker will OOM. Assert delegation instead.
vi.mock('mermaid', () => ({
  default: {
    render: vi.fn(async () => ({ svg: '<svg data-from="upstream"></svg>' })),
    detectType: vi.fn(() => 'c4'),
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
  },
}));

describe('C4Surface', () => {
  it('renders the native chart for a source it can read', async () => {
    render(<C4Surface text={'C4Context\nSystem(a, "Alpha")'} id="ok" />);
    expect(await screen.findByText('Alpha')).toBeDefined();
  });

  it('falls back to the proxy rather than failing, when it cannot read the source', async () => {
    const onError = vi.fn();
    render(<C4Surface text={'not a diagram at all'} id="bad" onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-renderer="proxy"]')).not.toBeNull());
  });

  it('reports no step controller, because a static C4 chart is not a run', async () => {
    const onStepController = vi.fn();
    render(
      <C4Surface
        text={'C4Context\nSystem(a, "Alpha")'}
        id="s"
        onStepController={onStepController}
      />,
    );

    await waitFor(() => expect(onStepController).toHaveBeenCalledWith(null));
  });
});
