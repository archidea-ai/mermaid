export interface FontSpec {
  readonly size: number;
  readonly family: string;
  readonly weight?: number | string;
}

export interface TextMeasurer {
  measure(text: string, font: FontSpec): { width: number; height: number };
}

export const DEFAULT_FONT: FontSpec = {
  size: 13,
  family: 'ui-sans-serif, system-ui, sans-serif',
};

/**
 * Canvas measurement for the browser. Injected rather than imported so layout
 * stays pure and testable — jsdom implements no text metrics.
 */
export function createCanvasMeasurer(): TextMeasurer {
  let context: CanvasRenderingContext2D | null = null;

  const acquire = (): CanvasRenderingContext2D | null => {
    if (context) return context;
    if (typeof document === 'undefined') return null;
    context = document.createElement('canvas').getContext('2d');
    return context;
  };

  const fallback = createEstimateMeasurer();

  return {
    measure(text, font) {
      const ctx = acquire();
      if (!ctx) return fallback.measure(text, font);

      ctx.font = `${font.weight ?? 400} ${font.size}px ${font.family}`;
      const lines = text.split('\n');
      const width = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
      return { width, height: lines.length * font.size * 1.35 };
    },
  };
}

/**
 * Deterministic per-character estimate. Used in tests and wherever no canvas
 * exists, so geometry is reproducible rather than environment-dependent.
 */
export function createEstimateMeasurer(averageRatio = 0.58): TextMeasurer {
  return {
    measure(text, font) {
      const lines = text.split('\n');
      const longest = Math.max(...lines.map((line) => line.length), 0);
      return {
        width: longest * font.size * averageRatio,
        height: lines.length * font.size * 1.35,
      };
    },
  };
}
