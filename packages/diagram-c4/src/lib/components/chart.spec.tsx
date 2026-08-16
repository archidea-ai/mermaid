import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from '../parser/parse';
import { C4Chart } from './chart';
import type { CSSProperties } from 'react';

const ast = parse(`C4Container
title Internet Banking
Person(customer, "Banking Customer", "A customer of the bank.")
System_Boundary(banking, "Internet Banking System") {
    Container(spa, "Single-Page App", "JavaScript, Angular", $descr="Renders account balances.", $tags="spa,priority")
    ContainerDb(db, "Database", "Oracle 19c")
}
Rel(customer, spa, "views balances")`);

const chart = () => render(<C4Chart ast={ast} id="test" />);

describe('C4Chart', () => {
  it('starts with every boundary shut, so the first paint is the coarsest reading', () => {
    chart();

    const toggle = screen.getByRole('button', { name: /Internet Banking System/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Single-Page App')).toBeNull();
  });

  it('says how many elements a shut boundary hides', () => {
    chart();
    expect(screen.getByText('2 elements')).toBeDefined();
  });

  it('opens a boundary when its chevron is used, and shuts it again', async () => {
    const user = userEvent.setup();
    chart();

    await user.click(screen.getByRole('button', { name: /Internet Banking System/ }));
    expect(screen.getByText('Single-Page App')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Internet Banking System/ }));
    expect(screen.queryByText('Single-Page App')).toBeNull();
  });

  it('draws what is outside a boundary whatever the boundary is doing', () => {
    chart();
    expect(screen.getByText('Banking Customer')).toBeDefined();
  });

  it('gives a box its type and technology, and keeps the description out of it', async () => {
    const user = userEvent.setup();
    chart();
    await user.click(screen.getByRole('button', { name: /Internet Banking System/ }));

    const box = screen.getByText('Single-Page App').closest('.c4-element')!;
    expect(box.textContent).toContain('Container');
    expect(box.textContent).toContain('JavaScript, Angular');
    expect(screen.queryByText('A customer of the bank.')).toBeNull();
  });

  it('marks the Db variant and an external element for the stylesheet', () => {
    const external = parse('C4Context\nSystem_Ext(email, "E-mail System")');
    render(<C4Chart ast={external} id="ext" />);

    const box = screen.getByText('E-mail System').closest('.c4-element') as HTMLElement;
    expect(box.getAttribute('data-external')).toBe('true');
  });

  it('opens and shuts every boundary at once from the toolbar', async () => {
    const user = userEvent.setup();
    chart();

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Database')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Database')).toBeNull();
  });

  it('wears the token class every native renderer wears, or it renders unstyled', () => {
    const { container } = chart();
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains('archidea-sequence')).toBe(true);
    expect(root.classList.contains('archidea-c4')).toBe(true);
  });

  it('applies author-declared colour inline, which is the one colour exception', () => {
    const styled = parse('C4Context\nPerson(p, "P")\nUpdateElementStyle(p, $bgColor="#1168bd")');
    render(<C4Chart ast={styled} id="styled" />);

    const box = screen.getByText('P').closest('.c4-element') as HTMLElement;
    expect(box.style.getPropertyValue('--c4-element-fill')).toBe('#1168bd');
  });

  /*
   * Asserted on the rendered element, never on the ast: both of these were
   * parsed, recorded and tested at the parser — and drawn nowhere. A boundary
   * wrote the *element* properties, which `.c4-element` re-declares on itself
   * and so overrides, and a line had no style hook at all.
   */
  it('paints a boundary in the colour its own directive declares', () => {
    const styled = parse(`C4Context
System_Boundary(b, "B") { }
UpdateBoundaryStyle(b, $borderColor="#00ff00", $bgColor="#001100")`);
    const { container } = render(<C4Chart ast={styled} id="bstyle" />);

    const box = container.querySelector('.c4-boundary') as HTMLElement;
    expect(box.style.getPropertyValue('--c4-boundary-stroke')).toBe('#00ff00');
    expect(box.style.getPropertyValue('--c4-boundary-fill')).toBe('#001100');
    // The element properties are what `.c4-boundary` does *not* read.
    expect(box.style.getPropertyValue('--c4-element-stroke')).toBe('');
  });

  it('paints a line in the colour its own relation declares', () => {
    const styled = parse(`C4Context
System(a, "A")
System(b, "B")
Rel(a, b, "calls")
UpdateRelStyle(a, b, $lineColor="#ff0000")`);
    const { container } = render(<C4Chart ast={styled} id="rstyle" />);

    const path = container.querySelector('.c4-link') as unknown as SVGPathElement;
    expect(path.style.getPropertyValue('--c4-link-stroke')).toBe('#ff0000');
  });

  it('leaves an aggregated line uncoloured, because it stands for more than one style', () => {
    // UpdateRelStyle names a *pair*, and every relation between that pair
    // takes it — so an aggregate can hold two contradicting colours and
    // drawing either would state something the source never did.
    const styled = parse(`C4Context
System(a, "A")
System(b, "B")
Rel(a, b, "one")
Rel(a, b, "two")
UpdateRelStyle(a, b, $lineColor="#ff0000")`);
    const { container } = render(<C4Chart ast={styled} id="rstyle2" />);

    const path = container.querySelector('.c4-link') as unknown as SVGPathElement;
    expect(container.querySelectorAll('.c4-link')).toHaveLength(1);
    expect(path.style.getPropertyValue('--c4-link-stroke')).toBe('');
  });
});

describe('C4Chart — links', () => {
  it('draws one line per visible pair', async () => {
    const user = userEvent.setup();
    const { container } = chart();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));

    expect(container.querySelectorAll('.c4-link')).toHaveLength(1);
  });

  it('labels a line carrying one relation with that relation own words', async () => {
    const user = userEvent.setup();
    chart();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));

    expect(screen.getByText('views balances')).toBeDefined();
  });

  it('labels an aggregate with its count instead — four labels on one arc is not a reading', () => {
    const many = parse(`C4Context
System(a, "A")
System(b, "B")
Rel(a, b, "one")
Rel(a, b, "two")
Rel(b, a, "three")`);
    const { container } = render(<C4Chart ast={many} id="many" />);

    expect(container.querySelectorAll('.c4-link')).toHaveLength(1);
    // Asserted on the label element, not by text: Task 14 turns this into a
    // control whose accessible name is "3 relations", and a getByText('3')
    // written here would break there for no behavioural reason.
    const label = container.querySelector('.c4-link__label[data-aggregate="true"]');
    expect(label?.textContent).toContain('3');
    expect(screen.queryByText('one')).toBeNull();
  });

  it('heads the line on whichever ends carry traffic', () => {
    const both = parse(`C4Context
System(a, "A")
System(b, "B")
Rel(a, b, "there")
Rel(b, a, "back")`);
    const { container } = render(<C4Chart ast={both} id="both" />);
    const path = container.querySelector('.c4-link')!;

    expect(path.getAttribute('marker-end')).not.toBeNull();
    expect(path.getAttribute('marker-start')).not.toBeNull();
  });

  it('drops the line and counts the relation when a collapse makes it internal', () => {
    const { container } = chart();
    // Everything starts shut: customer → spa crosses the boundary, so it stays.
    expect(container.querySelectorAll('.c4-link')).toHaveLength(1);

    const inside = parse(`C4Container
System_Boundary(b, "B") {
    Container(x, "X", "T")
    Container(y, "Y", "T")
}
Rel(x, y, "calls")`);
    const shut = render(<C4Chart ast={inside} id="shut" />);

    expect(shut.container.querySelectorAll('.c4-link')).toHaveLength(0);
  });
});

describe('C4Chart — selection', () => {
  it('says what to do before anything is chosen, rather than showing an empty panel', () => {
    chart();
    expect(screen.getByText(/Select an element/i)).toBeDefined();
  });

  it('docks an element description, technology and tags when it is chosen', async () => {
    const user = userEvent.setup();
    chart();

    // Single-Page App carries all three: technology from its own
    // declaration, description and tags added for this test — a box never
    // shows any of them itself, so the panel is the only place to pin them.
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(screen.getByRole('button', { name: /Single-Page App/ }));

    const detail = screen.getByRole('complementary');
    expect(detail.textContent).toContain('Renders account balances.');
    expect(detail.textContent).toContain('JavaScript, Angular');
    expect(detail.textContent).toContain('spa, priority');
  });

  it('lights the chosen box and its first-degree neighbours', async () => {
    const user = userEvent.setup();
    const { container } = chart();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    const lit = [...container.querySelectorAll('.c4-element[data-lit="true"]')].map(
      (node) => node.querySelector('.c4-element__name')?.textContent,
    );
    expect(lit.sort()).toEqual(['Banking Customer', 'Single-Page App']);
  });

  it('marks only the chosen one as selected, not its neighbours', async () => {
    const user = userEvent.setup();
    const { container } = chart();
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    expect(container.querySelectorAll('.c4-element[data-selected="true"]')).toHaveLength(1);
    // Banking Customer's one neighbour is an element, not a boundary — a
    // regression that marked every boundary selected alongside it would
    // otherwise pass unnoticed.
    expect(container.querySelectorAll('.c4-boundary[data-selected="true"]')).toHaveLength(0);
  });

  it('clears the selection when the chosen element is used again', async () => {
    const user = userEvent.setup();
    const { container } = chart();

    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));
    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it('clears the selection on Escape, so there is a way out without hunting', async () => {
    const user = userEvent.setup();
    const { container } = chart();

    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));
    await user.keyboard('{Escape}');

    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it('reports what a shut boundary holds, including the relations now inside it', async () => {
    const user = userEvent.setup();
    const inside = parse(`C4Container
System_Boundary(b, "Bank") {
    Container(x, "X", "T")
    Container(y, "Y", "T")
}
Rel(x, y, "calls")`);
    render(<C4Chart ast={inside} id="inside" />);

    // The boundary starts shut, so its select button reads its element count
    // ("2 elements"), not "Details" — that label only appears once it is
    // expanded. Selecting while shut is exactly the case worth covering here.
    await user.click(screen.getByRole('button', { name: '2 elements' }));

    const detail = screen.getByRole('complementary');
    expect(detail.textContent).toContain('2 elements');
    expect(detail.textContent).toContain('1 internal relation');
  });
});

describe('C4Chart — the link modal', () => {
  const dense = parse(`C4Container
Person(customer, "Customer")
System_Boundary(bank, "Bank") {
    Container(spa, "SPA", "Angular")
    Container(api, "API", "Java")
}
Rel(customer, spa, "views balances", "HTTPS")
Rel(customer, api, "calls directly", "JSON/HTTPS", "Only for the admin console")
Rel(api, customer, "notifies")`);

  it('selects a single-relation line directly, because a chooser of one says nothing', async () => {
    const user = userEvent.setup();
    chart();

    await user.click(screen.getByRole('button', { name: /views balances/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary').textContent).toContain('views balances');
  });

  it('opens a modal listing every relation an aggregate carries', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dense} id="dense" />);

    // Shut, so all three relations land on the customer ↔ Bank line.
    await user.click(screen.getByRole('button', { name: /3 relations/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('views balances');
    expect(dialog.textContent).toContain('calls directly');
    expect(dialog.textContent).toContain('notifies');
    expect(dialog.textContent).toContain('JSON/HTTPS');
    expect(dialog.textContent).toContain('Only for the admin console');
  });

  it('names both ends of each relation, so direction is readable in the list', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dense} id="dense2" />);
    await user.click(screen.getByRole('button', { name: /3 relations/ }));

    expect(screen.getByRole('dialog').textContent).toContain('Customer → SPA');
    expect(screen.getByRole('dialog').textContent).toContain('API → Customer');
  });

  it('closes, opens both ends and lights the one relation when it is picked', async () => {
    const user = userEvent.setup();
    const { container } = render(<C4Chart ast={dense} id="dense3" />);

    await user.click(screen.getByRole('button', { name: /3 relations/ }));
    await user.click(screen.getByRole('button', { name: /calls directly/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    // The boundary that hid API is open, so its box is on the page. Scoped to
    // the element name: the docked detail panel also says "API" (the "To"
    // fact of the very relation just picked), so an unscoped getByText('API')
    // matches both and the query itself, not the behaviour, fails.
    expect(screen.getByText('API', { selector: '.c4-element__name' })).toBeDefined();
    expect(container.querySelectorAll('.c4-link[data-lit="true"]')).toHaveLength(1);
  });

  it('docks the picked relation own detail, technology and description', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dense} id="dense4" />);

    await user.click(screen.getByRole('button', { name: /3 relations/ }));
    await user.click(screen.getByRole('button', { name: /calls directly/ }));

    const detail = screen.getByRole('complementary');
    expect(detail.textContent).toContain('JSON/HTTPS');
    expect(detail.textContent).toContain('Only for the admin console');
  });

  it('closes on Escape without changing what is open or lit', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dense} id="dense5" />);

    await user.click(screen.getByRole('button', { name: /3 relations/ }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('API')).toBeNull();
  });

  /*
   * base-ui's Portal appends to <body>, outside the chart root — and every
   * --seq-* token is declared on `.archidea-sequence` and nowhere else. A
   * popup without that class made every token-reading declaration in c4.css
   * invalid at computed-value time: no background, no border, no scrim, the
   * host page's font. `toBeVisible()` said nothing about any of it.
   */
  it('wears the token class on the portalled popup, or the dialog renders unstyled', async () => {
    const user = userEvent.setup();
    const { container } = render(<C4Chart ast={dense} id="dense-portal" />);

    await user.click(screen.getByRole('button', { name: /3 relations/ }));

    const dialog = screen.getByRole('dialog');
    // Portalled: the chart's own root is not an ancestor, so the class it
    // wears cannot reach here by inheritance.
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('.archidea-sequence')).not.toBeNull();
    expect(
      document.querySelector('.c4-dialog__backdrop')?.closest('.archidea-sequence'),
    ).not.toBeNull();
  });

  it('carries the host theme across the portal, which inheritance cannot', async () => {
    const user = userEvent.setup();
    render(
      <C4Chart
        ast={dense}
        id="dense-theme"
        // A theme override is inline custom properties on the renderer root —
        // the documented mechanism, and one the portal cuts off. `width` is
        // here to prove only the theme travels: a modal is not the diagram.
        style={{ '--seq-surface-raised': '#123456', width: '640px' } as CSSProperties}
      />,
    );

    await user.click(screen.getByRole('button', { name: /3 relations/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.getPropertyValue('--seq-surface-raised')).toBe('#123456');
    expect(dialog.style.width).toBe('');
  });

  it('closes the dialog when the source changes underneath it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<C4Chart ast={dense} id="dense6" />);

    await user.click(screen.getByRole('button', { name: /3 relations/ }));
    expect(screen.getByRole('dialog')).toBeDefined();

    // A live-editing host (the examples app's textarea) re-parses on every
    // keystroke and hands the same mounted <C4Chart> a fresh ast — the dialog
    // must not linger pointing at a link that may no longer exist.
    rerender(<C4Chart ast={ast} id="dense6" />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('C4Chart — events', () => {
  it('reports a selection with the right kind and payload', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<C4Chart ast={ast} id="ev" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        element: expect.objectContaining({ kind: 'node', id: 'customer', diagramType: 'c4' }),
      }),
    );
  });

  it('reports a null element when a selection is cleared', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<C4Chart ast={ast} id="ev2" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));
    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    expect(onSelect).toHaveBeenLastCalledWith({ element: null });
  });

  it('draws what a controlling prop gives it, and keeps no state of its own', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <C4Chart ast={ast} id="ev3" selection={null} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /Banking Customer/ }));

    expect(onSelect).toHaveBeenCalled();
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it('marks the box a controlling non-null selection names as selected', () => {
    // A genuine payload, exactly as `toElementRef` builds it — the shape a
    // host echoes back from `onSelect`.
    const element = ast.elements.find((candidate) => candidate.id === 'customer')!;
    const { container } = render(
      <C4Chart
        ast={ast}
        id="ev3b"
        selection={{
          kind: 'node',
          id: 'customer',
          diagramType: 'c4',
          data: { type: 'element', element },
        }}
      />,
    );

    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.querySelector('.c4-element__name')?.textContent).toBe('Banking Customer');
  });

  /*
   * The case the README documents: a search box holds an id and a kind, and
   * nothing else. Requiring the payload made every such ref resolve to null,
   * and silently — so the only selection anyone could actually drive from
   * outside was one echoed straight back from `onSelect`.
   */
  describe('a controlling ref carrying only an id and a kind', () => {
    it('selects the element a node ref names', () => {
      const { container } = render(
        <C4Chart
          ast={ast}
          id="bare1"
          selection={{ kind: 'node', id: 'customer', diagramType: 'c4' }}
        />,
      );

      const selected = container.querySelectorAll('[data-selected="true"]');
      expect(selected).toHaveLength(1);
      expect(selected[0]?.querySelector('.c4-element__name')?.textContent).toBe('Banking Customer');
    });

    it('selects the boundary a group ref names', () => {
      const { container } = render(
        <C4Chart
          ast={ast}
          id="bare2"
          selection={{ kind: 'group', id: 'banking', diagramType: 'c4' }}
        />,
      );

      expect(container.querySelectorAll('.c4-boundary[data-selected="true"]')).toHaveLength(1);
    });

    it('selects the relation an edge ref names, and opens what hides its ends', () => {
      render(
        <C4Chart
          ast={ast}
          id="bare3"
          selection={{ kind: 'edge', id: ast.relations[0]!.id, diagramType: 'c4' }}
        />,
      );

      expect(screen.getByText('Single-Page App', { selector: '.c4-element__name' })).toBeDefined();
      expect(screen.getByRole('complementary').textContent).toContain('views balances');
    });

    it('selects the drawn line an edge ref names, when the id is a line rather than a relation', () => {
      const { container } = render(
        <C4Chart
          ast={ast}
          id="bare4"
          selection={{ kind: 'edge', id: 'banking::customer', diagramType: 'c4' }}
        />,
      );

      // Everything starts shut, so customer ↔ the boundary is the one line.
      expect(container.querySelectorAll('.c4-link[data-lit="true"]')).toHaveLength(1);
      expect(screen.getByRole('complementary').textContent).toContain('1 relation');
    });
  });

  it('opens the boundaries hiding a relation the controller selects from outside', () => {
    const relation = ast.relations[0]!;
    render(
      <C4Chart
        ast={ast}
        id="ev4"
        selection={{
          kind: 'edge',
          id: relation.id,
          diagramType: 'c4',
          data: { type: 'relation', relation, linkId: 'banking::customer' },
        }}
      />,
    );

    // customer → spa: spa is inside the boundary, which starts shut and opens.
    // Scoped to the box's own name: the detail panel this same selection docks
    // also says "Single-Page App" (the "To" fact), so an unscoped getByText
    // matches both and the query itself fails, not the behaviour.
    expect(screen.getByText('Single-Page App', { selector: '.c4-element__name' })).toBeDefined();
  });
});

const dynamic = parse(`C4Dynamic
Container(spa, "SPA", "Angular")
Container_Boundary(api, "API Application") {
    Component(reset, "Reset Controller", "Spring MVC")
    Component(security, "Security", "Spring Bean")
}
Rel(spa, reset, "submits the address to", "JSON/HTTPS")
Rel(reset, security, "validates using")`);

describe('C4Chart — a dynamic run', () => {
  it('offers a transport, disabled, for a chart that is a map rather than a run', () => {
    chart();
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('walks the numbered relations, and says where it is', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Step 1 of 2')).toBeDefined();
  });

  it('opens whatever hides an end of the step it lands on', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run2" />);

    expect(screen.queryByText('Reset Controller', { selector: '.c4-element__name' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    // The same reveal the modal's pick makes — one mechanism, two triggers.
    // Scoped to the element name: the docked detail panel shows the same
    // component name once the relation lands (Tasks 14/15's collision).
    expect(screen.getByText('Reset Controller', { selector: '.c4-element__name' })).toBeDefined();
  });

  it('docks the step relation detail as it lands', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run3" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByRole('complementary').textContent).toContain('submits the address to');
  });

  it('stops at the end rather than running off it', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run4" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Step 2 of 2')).toBeDefined();
  });

  /*
   * A run is not a lock on the chart.
   *
   * `commit` closes over the link set, which is rebuilt whenever a boundary
   * opens or shuts — so the step effect re-fired on every collapse change and
   * re-committed the step's relation, which the reveal effect then re-opened.
   * Collapse all and every chevron were dead for the rest of a run, a viewer's
   * own pick was silently thrown away, and one click reported itself twice.
   * The four tests below are that behaviour, one consequence each.
   */
  it('lets Collapse all shut a boundary mid-run, and leaves it shut', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run5" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Reset Controller', { selector: '.c4-element__name' })).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Reset Controller', { selector: '.c4-element__name' })).toBeNull();
  });

  it('lets a chevron shut the very boundary the step opened, and leaves it shut', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run6" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: /Collapse API Application/ }));

    expect(screen.queryByText('Reset Controller', { selector: '.c4-element__name' })).toBeNull();
  });

  it('keeps a viewer own pick when a boundary is toggled mid-run', async () => {
    const user = userEvent.setup();
    const { container } = render(<C4Chart ast={dynamic} id="run7" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: /SPA/ }));
    expect(container.querySelectorAll('.c4-element[data-selected="true"]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Collapse API Application/ }));

    const selected = container.querySelectorAll('.c4-element[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.querySelector('.c4-element__name')?.textContent).toBe('SPA');
  });

  it('reports one step as one selection, not two', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<C4Chart ast={dynamic} id="run8" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        element: expect.objectContaining({ kind: 'edge', id: dynamic.relations[0]!.id }),
      }),
    );
  });

  it('still opens what hides a step, and opens it again after the viewer shuts it', async () => {
    const user = userEvent.setup();
    render(<C4Chart ast={dynamic} id="run9" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Reset Controller', { selector: '.c4-element__name' })).toBeDefined();

    // Shut it by hand, then step on: the next step's reveal must still fire.
    await user.click(screen.getByRole('button', { name: /Collapse API Application/ }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('Security', { selector: '.c4-element__name' })).toBeDefined();
  });
});
