import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from '../parser/parse';
import { C4Chart } from './chart';

const ast = parse(`C4Container
title Internet Banking
Person(customer, "Banking Customer", "A customer of the bank.")
System_Boundary(banking, "Internet Banking System") {
    Container(spa, "Single-Page App", "JavaScript, Angular")
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
