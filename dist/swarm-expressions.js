// A bounded arithmetic language. No property access, assignments or JavaScript execution.
const FUNCS = {
  sin: [Math.sin, 1],
  cos: [Math.cos, 1],
  abs: [Math.abs, 1],
  sqrt: [Math.sqrt, 1],
  min: [Math.min, 2],
  max: [Math.max, 2],
  atan2: [Math.atan2, 2],
};
const VARS = new Set(['x', 'y', 'z', 't', 'i', 'n', 'phase', 'pi', 'tau']);
export function parseFormula(source) {
  if (typeof source !== 'string' || source.length > 240)
    throw Error('Use an expression of 240 characters or fewer.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[^\s]/gi) || [];
  if (!tokens.length || tokens.length > 100) throw Error('Expression is empty or too long.');
  let at = 0;
  const expect = (value) => {
    if (tokens[at++] !== value) throw Error('Expected ' + value + '.');
  };
  function expression(min = 0, depth = 0) {
    if (depth > 16) throw Error('Expression is nested too deeply.');
    let token = tokens[at++],
      node;
    if (token === '+' || token === '-')
      node = { op: 'neg', sign: token === '-' ? -1 : 1, a: expression(3, depth + 1) };
    else if (token === '(') {
      node = expression(0, depth + 1);
      expect(')');
    } else if (/^(?:\d|\.)/.test(token || '')) {
      const value = Number(token);
      if (!Number.isFinite(value) || value > 10000)
        throw Error('Numbers must be finite and no larger than 10000.');
      node = { value };
    } else if (Object.hasOwn(FUNCS, token)) {
      expect('(');
      const args = [expression(0, depth + 1)];
      while (tokens[at] === ',') {
        at++;
        args.push(expression(0, depth + 1));
        if (args.length > 2) throw Error('Too many function arguments.');
      }
      expect(')');
      if (args.length !== FUNCS[token][1])
        throw Error(token + ' needs ' + FUNCS[token][1] + ' argument(s).');
      node = { fn: token, args };
    } else if (VARS.has(token)) node = { variable: token };
    else throw Error('Unknown symbol ' + String(token || 'at end') + '.');
    while (at < tokens.length) {
      const op = tokens[at],
        priority = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[op];
      if (!priority || priority < min) break;
      at++;
      node = { op, a: node, b: expression(op === '^' ? priority : priority + 1, depth + 1) };
    }
    return node;
  }
  const ast = expression();
  if (at !== tokens.length) throw Error('Unexpected symbol ' + tokens[at] + '.');
  return ast;
}
export function evaluateFormula(ast, vars = {}) {
  function run(node) {
    let v;
    if ('value' in node) v = node.value;
    else if (node.variable)
      v =
        node.variable === 'pi'
          ? Math.PI
          : node.variable === 'tau'
            ? Math.PI * 2
            : (vars[node.variable] ?? 0);
    else if (node.fn) v = FUNCS[node.fn][0](...node.args.map(run));
    else if (node.op === 'neg') v = node.sign * run(node.a);
    else {
      const a = run(node.a),
        b = run(node.b);
      v =
        node.op === '+'
          ? a + b
          : node.op === '-'
            ? a - b
            : node.op === '*'
              ? a * b
              : node.op === '/'
                ? a / b
                : Math.pow(a, b);
    }
    if (!Number.isFinite(v))
      throw Error('Formula produced a non-finite value. Check division, roots and powers.');
    return Math.max(-1000000, Math.min(1000000, v));
  }
  return run(ast);
}
