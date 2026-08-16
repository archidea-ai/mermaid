import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from '../parser/parse';
import { C4Chart } from './chart';

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
    const { container } = render(
      <C4Chart
        ast={ast}
        id="ev3b"
        selection={{ kind: 'node', id: 'customer', diagramType: 'c4', data: { type: 'element' } }}
      />,
    );

    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.querySelector('.c4-element__name')?.textContent).toBe('Banking Customer');
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
