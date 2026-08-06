import { useRendererCapabilities } from '@archidea-ai/mermaid/react';

/**
 * Visible proof that the registry does the routing: which renderer resolved for
 * this source, and what it can actually do.
 */
export function RendererBadge({ source }: { source: string }) {
  const { rendererId, diagramType, capabilities } = useRendererCapabilities(source);

  if (!rendererId) return <span className="app__badge">resolving…</span>;

  return (
    <span className="app__badge">
      renderer <b>{rendererId}</b>
      <span style={{ opacity: 0.5 }}>·</span>
      type <b>{diagramType}</b>
      {capabilities
        ? (['step', 'events', 'viewport'] as const).map((name) => (
            <span key={name} className="app__cap" data-on={capabilities[name]}>
              {name}
            </span>
          ))
        : null}
    </span>
  );
}
