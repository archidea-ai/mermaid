import { parseLiteral, parseVariableToken } from './variables';
import type { VariableDeclaration, VariableType } from './types';

export type Operand =
  | {
      readonly kind: 'variable';
      readonly name: string;
      readonly declaredType: VariableType | null;
    }
  | { readonly kind: 'literal'; readonly value: string | number | boolean };

export type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export type Condition =
  | { readonly kind: 'or'; readonly left: Condition; readonly right: Condition }
  | { readonly kind: 'and'; readonly left: Condition; readonly right: Condition }
  | { readonly kind: 'not'; readonly operand: Condition }
  | {
      readonly kind: 'compare';
      readonly operator: ComparisonOperator;
      readonly left: Operand;
      readonly right: Operand;
    }
  | { readonly kind: 'truthy'; readonly operand: Operand };

export type Tristate = true | false | 'unknown';

export interface ConditionLookup {
  get(name: string): string | number | boolean | undefined;
}

/**
 * Parses a fragment label as a condition, or returns null when it is prose.
 *
 * A condition must reference at least one {{variable}}. That single rule is what
 * keeps ordinary mermaid diagrams working: "is the user logged in?" is prose and
 * stays viewer-chosen, rather than being misparsed into a silent default.
 */
export function parseCondition(label: string): Condition | null {
  if (!label.includes('{{')) return null;

  try {
    const tokens = lex(label);
    const parser = new Parser(tokens);
    const condition = parser.parseOr();
    return parser.atEnd() ? condition : null;
  } catch {
    return null;
  }
}

export function evaluateCondition(condition: Condition, bindings: ConditionLookup): Tristate {
  switch (condition.kind) {
    case 'or': {
      const left = evaluateCondition(condition.left, bindings);
      if (left === true) return true;
      const right = evaluateCondition(condition.right, bindings);
      if (right === true) return true;
      return left === 'unknown' || right === 'unknown' ? 'unknown' : false;
    }
    case 'and': {
      const left = evaluateCondition(condition.left, bindings);
      if (left === false) return false;
      const right = evaluateCondition(condition.right, bindings);
      if (right === false) return false;
      return left === 'unknown' || right === 'unknown' ? 'unknown' : true;
    }
    case 'not': {
      const inner = evaluateCondition(condition.operand, bindings);
      return inner === 'unknown' ? 'unknown' : !inner;
    }
    case 'truthy': {
      const value = resolve(condition.operand, bindings);
      return value === undefined ? 'unknown' : Boolean(value);
    }
    case 'compare': {
      const left = resolve(condition.left, bindings);
      const right = resolve(condition.right, bindings);
      if (left === undefined || right === undefined) return 'unknown';
      return compare(condition.operator, left, right);
    }
  }
}

/**
 * Every variable the condition reads, with any type it declared — so a prompt
 * raised by a condition gets the same input a prompt raised by message text
 * would. Without the type it fell back to a free-text field.
 */
export function conditionDeclarations(condition: Condition): VariableDeclaration[] {
  const found = new Map<string, VariableDeclaration>();

  const add = (operand: Operand): void => {
    if (operand.kind !== 'variable') return;
    const existing = found.get(operand.name);
    // A type declared anywhere in the expression wins over an unannotated use.
    if (existing?.declaredType != null) return;
    found.set(operand.name, {
      name: operand.name,
      declaredType: operand.declaredType,
      assigns: false,
    });
  };

  const walk = (node: Condition): void => {
    switch (node.kind) {
      case 'or':
      case 'and':
        walk(node.left);
        walk(node.right);
        break;
      case 'not':
        walk(node.operand);
        break;
      case 'truthy':
        add(node.operand);
        break;
      case 'compare':
        add(node.left);
        add(node.right);
        break;
    }
  };

  walk(condition);
  return [...found.values()];
}

export function conditionVariables(condition: Condition): string[] {
  return conditionDeclarations(condition).map((declaration) => declaration.name);
}

function resolve(operand: Operand, bindings: ConditionLookup) {
  return operand.kind === 'literal' ? operand.value : bindings.get(operand.name);
}

function compare(
  operator: ComparisonOperator,
  left: string | number | boolean,
  right: string | number | boolean,
): boolean {
  switch (operator) {
    case '==':
      return String(left) === String(right);
    case '!=':
      return String(left) !== String(right);
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
  }
}

type LexToken =
  | { kind: 'variable'; name: string; declaredType: VariableType | null }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'operator'; value: string };

const OPERATORS = ['&&', '||', '==', '!=', '>=', '<=', '>', '<', '!', '(', ')'];

function lex(input: string): LexToken[] {
  const tokens: LexToken[] = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index]!;

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (input.startsWith('{{', index)) {
      const close = input.indexOf('}}', index);
      if (close === -1) throw new Error('unterminated variable');
      const { name, declaredType } = parseVariableToken(input.slice(index + 2, close));
      tokens.push({ kind: 'variable', name, declaredType });
      index = close + 2;
      continue;
    }

    const operator = OPERATORS.find((candidate) => input.startsWith(candidate, index));
    if (operator) {
      tokens.push({ kind: 'operator', value: operator });
      index += operator.length;
      continue;
    }

    if (character === '"' || character === "'") {
      const close = input.indexOf(character, index + 1);
      if (close === -1) throw new Error('unterminated string');
      tokens.push({ kind: 'literal', value: input.slice(index + 1, close) });
      index = close + 1;
      continue;
    }

    const word = /^[A-Za-z0-9_.\-+]+/.exec(input.slice(index));
    if (!word) throw new Error(`unexpected character ${character}`);
    tokens.push({ kind: 'literal', value: parseLiteral(word[0]) });
    index += word[0].length;
  }

  return tokens;
}

class Parser {
  #tokens: LexToken[];
  #index = 0;

  constructor(tokens: LexToken[]) {
    this.#tokens = tokens;
  }

  atEnd(): boolean {
    return this.#index >= this.#tokens.length;
  }

  parseOr(): Condition {
    let left = this.parseAnd();
    while (this.#eat('||')) left = { kind: 'or', left, right: this.parseAnd() };
    return left;
  }

  parseAnd(): Condition {
    let left = this.parseNot();
    while (this.#eat('&&')) left = { kind: 'and', left, right: this.parseNot() };
    return left;
  }

  parseNot(): Condition {
    if (this.#eat('!')) return { kind: 'not', operand: this.parseNot() };
    return this.parseComparison();
  }

  parseComparison(): Condition {
    if (this.#eat('(')) {
      const inner = this.parseOr();
      if (!this.#eat(')')) throw new Error('missing )');
      return inner;
    }

    const left = this.#operand();
    const operator = (['==', '!=', '>=', '<=', '>', '<'] as const).find((candidate) =>
      this.#peekOperator(candidate),
    );

    if (!operator) return { kind: 'truthy', operand: left };

    this.#index += 1;
    return { kind: 'compare', operator, left, right: this.#operand() };
  }

  #operand(): Operand {
    const token = this.#tokens[this.#index];
    if (!token || token.kind === 'operator') throw new Error('expected operand');
    this.#index += 1;
    return token.kind === 'variable'
      ? { kind: 'variable', name: token.name, declaredType: token.declaredType }
      : { kind: 'literal', value: token.value };
  }

  #peekOperator(value: string): boolean {
    const token = this.#tokens[this.#index];
    return token?.kind === 'operator' && token.value === value;
  }

  #eat(value: string): boolean {
    if (!this.#peekOperator(value)) return false;
    this.#index += 1;
    return true;
  }
}
