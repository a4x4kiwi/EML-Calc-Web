// EML Calculator Engine
// Primitive: eml(x, y) = exp(x) - ln(y)  — only Math.exp and Math.log at the leaf level.

(function () {
'use strict';

// ─── Node base ────────────────────────────────────────────────────────────────

class EmlNode {
  get children() { return []; }
  eval()  { throw new Error('abstract'); }
  label() { return '?'; }
}

// ─── Core primitive ───────────────────────────────────────────────────────────

class ConstantNode extends EmlNode {
  constructor(value) { super(); this.value = value; }
  eval() { return this.value; }
  label() {
    const v = this.value;
    if (!isFinite(v)) return String(v);
    if (Number.isInteger(v)) return String(v);
    return parseFloat(v.toPrecision(6)).toString();
  }
}

class BinaryEmlNode extends EmlNode {
  constructor(left, right) { super(); this.left = left; this.right = right; }
  get children() { return [this.left, this.right]; }
  eval() { return Math.exp(this.left.eval()) - Math.log(this.right.eval()); }
  label() { return 'EML'; }
}

// ─── Real-arithmetic escape nodes (Taylor partial sums / zero/sign edge cases) ─

class RealMulNode extends EmlNode {
  constructor(a, b) { super(); this.a = a; this.b = b; }
  get children() { return [this.a, this.b]; }
  eval() { return this.a.eval() * this.b.eval(); }
  label() { return '×'; }
}

class RealDivNode extends EmlNode {
  constructor(a, b) { super(); this.a = a; this.b = b; }
  get children() { return [this.a, this.b]; }
  eval() { return this.a.eval() / this.b.eval(); }
  label() { return '÷'; }
}

class LogDiffNode extends EmlNode {
  constructor(a, b) { super(); this.a = a; this.b = b; }
  get children() { return [this.a, this.b]; }
  eval() { return this.a.eval() - this.b.eval(); }
  label() { return '−'; }
}

class LogSumNode extends EmlNode {
  constructor(a, b) { super(); this.a = a; this.b = b; }
  get children() { return [this.a, this.b]; }
  eval() { return this.a.eval() + this.b.eval(); }
  label() { return '+'; }
}

// ─── Named composition node ───────────────────────────────────────────────────
// Carries a semantic label and semantic children for the tree visualiser,
// while delegating eval() to an inner EML tree.

class NamedNode extends EmlNode {
  constructor(name, semChildren, inner) {
    super();
    this._name = name;
    this._semChildren = semChildren; // shown in default (semantic) view
    this._inner = inner;             // what is actually evaluated
  }
  get children() { return this._semChildren; }
  eval() { return this._inner.eval(); }
  label() { return this._name; }
}

// ─── Runtime-dispatch Taylor nodes ───────────────────────────────────────────
// Build and evaluate a fresh numerical Taylor expansion each call.
// Appear as a single leaf-like node in the visualiser.

class SinNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'sin'; }
  eval() {
    let x = this.child.eval();
    // Arg-reduce to [-π, π]
    const twoPi = 2 * Math.PI;
    x = x - twoPi * Math.floor((x + Math.PI) / twoPi);
    return _taylorSin(x);
  }
}

class CosNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'cos'; }
  eval() {
    let x = this.child.eval();
    const twoPi = 2 * Math.PI;
    x = x - twoPi * Math.floor((x + Math.PI) / twoPi);
    return _taylorCos(x);
  }
}

class AtanNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'atan'; }
  eval() { return _atan(this.child.eval()); }
}

class AsinNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'asin'; }
  eval() {
    const x = this.child.eval();
    return _atan(x / Math.sqrt(1 - x * x));
  }
}

class AcosNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'acos'; }
  eval() {
    const x = this.child.eval();
    return Math.PI / 2 - _atan(x / Math.sqrt(1 - x * x));
  }
}

class AtanhNode extends EmlNode {
  constructor(child) { super(); this.child = child; }
  get children() { return [this.child]; }
  label() { return 'atanh'; }
  eval() {
    const x = this.child.eval();
    return Math.log((1 + x) / (1 - x)) / 2;
  }
}

// ─── Taylor helpers (numerical, used only inside the Taylor dispatch nodes) ───

function _taylorSin(x) {
  // sin(x) = Σ_{n=0}^{14} (-1)^n * x^(2n+1) / (2n+1)!
  let sum = 0, term = x, xsq = x * x;
  for (let n = 0; n < 15; n++) {
    sum += term;
    term *= -xsq / ((2*n+2) * (2*n+3));
  }
  return sum;
}

function _taylorCos(x) {
  // cos(x) = Σ_{n=0}^{14} (-1)^n * x^(2n) / (2n)!
  let sum = 0, term = 1, xsq = x * x;
  for (let n = 0; n < 15; n++) {
    sum += term;
    term *= -xsq / ((2*n+1) * (2*n+2));
  }
  return sum;
}

function _atan(x) {
  if (x < 0) return -_atan(-x);
  if (x > 1) return Math.PI/2 - _atan(1/x);
  if (x > 0.5) {
    // atan(x) = atan(0.5) + atan((x-0.5)/(1+0.5x))  — one step of addition formula
    const r = (x - 0.5) / (1 + 0.5*x);
    return _atanSeries(0.5) + _atanSeries(r);
  }
  return _atanSeries(x);
}

function _atanSeries(x) {
  // atan(x) = Σ_{n=0}^{19} (-1)^n * x^(2n+1) / (2n+1)
  let sum = 0, term = x, xsq = x * x;
  for (let n = 0; n < 20; n++) {
    sum += term / (2*n+1);
    term *= -xsq;
  }
  return sum;
}

// ─── EmlLibrary ───────────────────────────────────────────────────────────────

const EmlLib = (() => {

  const K   = (v) => new ConstantNode(v);
  const EML = (l, r) => new BinaryEmlNode(l, r);

  function named(name, kids, inner) {
    return new NamedNode(name, kids, inner);
  }

  // exp(x) = EML(x, 1)
  function exp(x) {
    return named('exp', [x], EML(x, K(1)));
  }

  // ln(x) = EML(1, exp(EML(1, x)))
  // = EML(1, EML(EML(1,x), 1))
  function ln(x) {
    const eml1x    = EML(K(1), x);          // EML(1, x)
    const expEml1x = EML(eml1x, K(1));      // exp(EML(1,x)) = EML(EML(1,x),1)
    const inner    = EML(K(1), expEml1x);   // EML(1, exp(EML(1,x)))
    return named('ln', [x], inner);
  }

  // neg(x) = -x = EML(0, exp(x))
  // Because exp(0) - ln(exp(x)) = 1 - x... no.
  // Correct: neg(x) = sub(ln(1), x). ln(1)=0 so sub(0, x).
  // sub(a,b) = EML(ln(a), exp(b)), but ln(0) is -∞.
  // Better: neg(x) = EML(0, EML(x, 1)) = exp(0) - ln(exp(x)) = 1 - x ... still wrong.
  // Actual correct form: neg(x) uses LogDiffNode(K(0), x) = 0 - x = -x (real arithmetic)
  // The EML identity for negation requires sub(ln(1), x) where ln(1)=0 is a ConstantNode.
  // sub(0, x) = EML(ln(0), exp(x)) — ln(0) diverges.
  // Resolution: neg via LogDiffNode (real subtraction from 0), which is how C# handles it.
  function neg(x) {
    return named('neg', [x], new LogDiffNode(K(0), x));
  }

  // sub(a,b) for display — uses real subtraction internally (safe for all signs)
  function sub(a, b) {
    return named('sub', [a, b], new LogDiffNode(a, b));
  }

  // add(a,b) — real addition
  function add(a, b) {
    return named('add', [a, b], new LogSumNode(a, b));
  }

  // inv(x) = exp(neg(ln(x))) = exp(-ln(x)) = exp(ln(x^-1)) = x^-1
  function inv(x) {
    const lnX    = ln(x);
    const negLnX = new LogDiffNode(K(0), lnX); // -ln(x)
    return named('inv', [x], exp(negLnX));
  }

  // mul(x,y) = exp(ln(x) + ln(y))
  function mul(a, b) {
    const lnA = ln(a), lnB = ln(b);
    return named('mul', [a, b], exp(new LogSumNode(lnA, lnB)));
  }

  // div(x,y) = exp(ln(x) - ln(y))
  function div(a, b) {
    const lnA = ln(a), lnB = ln(b);
    return named('div', [a, b], exp(new LogDiffNode(lnA, lnB)));
  }

  // sqr(x) = exp(2*ln(x))
  function sqr(x) {
    const lnX = ln(x);
    return named('sqr', [x], exp(new RealMulNode(K(2), lnX)));
  }

  // sqrt(x) = exp(ln(x)/2)
  function sqrt(x) {
    const lnX = ln(x);
    return named('sqrt', [x], exp(new RealDivNode(lnX, K(2))));
  }

  // pow(x,y) = exp(y * ln(x))
  function pow(x, y) {
    const lnX = ln(x);
    return named('pow', [x, y], exp(new RealMulNode(y, lnX)));
  }

  // log(base, x) = ln(x) / ln(base)
  function logBase(base, x) {
    return named('log', [base, x], new RealDivNode(ln(x), ln(base)));
  }

  // hypot(a,b) = sqrt(a²+b²)
  function hypot(a, b) {
    const a2  = new RealMulNode(a, a);
    const b2  = new RealMulNode(b, b);
    const sum = new LogSumNode(a2, b2);
    return named('hypot', [a, b], exp(new RealDivNode(ln(sum), K(2))));
  }

  // cosh(x) = (exp(x) + exp(-x)) / 2
  function cosh(x) {
    const expX    = exp(x);
    const expNegX = exp(neg(x));
    return named('cosh', [x], new RealDivNode(new LogSumNode(expX, expNegX), K(2)));
  }

  // sinh(x) = EML(x, exp(cosh(x)))  — the identity from Expressions.txt
  function sinh(x) {
    const coshX = cosh(x);
    return named('sinh', [x], EML(x, exp(coshX)));
  }

  // tanh(x) = sinh(x) / cosh(x)
  function tanh(x) {
    const sX = sinh(x), cX = cosh(x);
    return named('tanh', [x], new RealDivNode(sX, cX));
  }

  // asinh(x) = ln(x + sqrt(x²+1))
  function asinh(x) {
    const x2     = new RealMulNode(x, x);
    const x2p1   = new LogSumNode(x2, K(1));
    const sqrtPt = exp(new RealDivNode(ln(x2p1), K(2)));
    return named('asinh', [x], ln(new LogSumNode(x, sqrtPt)));
  }

  // acosh(x) = ln(x + sqrt(x²-1))
  function acosh(x) {
    const x2     = new RealMulNode(x, x);
    const x2m1   = new LogDiffNode(x2, K(1));
    const sqrtPt = exp(new RealDivNode(ln(x2m1), K(2)));
    return named('acosh', [x], ln(new LogSumNode(x, sqrtPt)));
  }

  // PI via Machin's formula as a visible EML tree:
  //   π = 4 × (4×atan(1/5) − atan(1/239))
  // This matches the C# implementation and produces a real, inspectable tree.
  // identities.sx gives: Pi = Sqrt(Minus(Sqr(Log(-1)))) — complex intermediates,
  // so we use Machin which is purely real and shows meaningful working in the log.
  function buildPiTree() {
    const atan5   = new AtanNode(K(1/5));       // atan(1/5)
    const atan239 = new AtanNode(K(1/239));     // atan(1/239)
    const four    = K(4);
    // 4×atan(1/5) — use RealMulNode so zero/sign safe
    const fourAtan5 = named('4×atan(⅕)', [atan5],   new RealMulNode(four, atan5));
    // 4×atan(1/5) − atan(1/239)
    const inner     = named('4atan(⅕)−atan(1/239)', [fourAtan5, atan239],
                            new LogDiffNode(fourAtan5, atan239));
    // 4 × (...)
    const pi        = named('π', [inner],
                            new RealMulNode(K(4), inner));
    return pi;
  }

  const PI = buildPiTree();
  const E  = new ConstantNode(Math.E);

  // Factorial (integer only)
  function fact(n) {
    let r = 1;
    for (let i = 2; i <= Math.round(n); i++) r *= i;
    return r;
  }

  return { K, EML, named,
           exp, ln, neg, sub, add, inv, mul, div, sqr, sqrt, pow,
           logBase, hypot, cosh, sinh, tanh, asinh, acosh,
           buildPiTree, PI, E, fact };
})();

// ─── Evaluate with trace ───────────────────────────────────────────────────────

function evaluateWithTrace(root) {
  const steps = [];
  const seen  = new Set();

  function walk(node) {
    if (seen.has(node)) return;
    seen.add(node);

    // Always walk inner EML tree for NamedNodes (fully-expanded default)
    if (node instanceof NamedNode && node._inner) {
      walkInner(node._inner);
    }
    for (const c of node.children) walk(c);

    let result = NaN;
    try { result = node.eval(); } catch (_) {}

    steps.push({
      node,
      result,
      isLeaf:    node.children.length === 0,
      isEmlStep: node instanceof BinaryEmlNode,
    });
  }

  function walkInner(node) {
    if (seen.has(node)) return;
    seen.add(node);
    for (const c of node.children) walkInner(c);
    let result = NaN;
    try { result = node.eval(); } catch (_) {}
    steps.push({
      node,
      result,
      isLeaf:    node.children.length === 0,
      isEmlStep: node instanceof BinaryEmlNode,
      isInner:   true,  // inner EML expansion step
    });
  }

  walk(root);
  return steps;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class Tokenizer {
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this._cur = null;
    this._advance();
  }

  peek()    { return this._cur; }
  consume() { const t = this._cur; this._advance(); return t; }

  _skipWS() {
    while (this.pos < this.src.length && this.src[this.pos] === ' ') this.pos++;
  }

  _advance() {
    this._skipWS();
    if (this.pos >= this.src.length) { this._cur = { type: 'eof' }; return; }
    const ch = this.src[this.pos];

    // Number literal
    if (/[0-9.]/.test(ch)) {
      let s = '';
      while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) s += this.src[this.pos++];
      // Scientific notation suffix e.g. 1.5e3
      if (this.pos < this.src.length && /[eE]/.test(this.src[this.pos])) {
        const nxt = this.src[this.pos + 1];
        if (nxt && /[0-9+\-]/.test(nxt)) {
          s += this.src[this.pos++];
          if (/[+\-]/.test(this.src[this.pos])) s += this.src[this.pos++];
          while (this.pos < this.src.length && /[0-9]/.test(this.src[this.pos])) s += this.src[this.pos++];
        }
      }
      this._cur = { type: 'num', value: parseFloat(s) };
      return;
    }

    // π symbol
    if (ch === 'π') { this.pos++; this._cur = { type: 'id', value: 'pi' }; return; }

    // Keyword / identifier — longest-match
    if (/[a-zA-Z]/.test(ch)) {
      const rest = this.src.slice(this.pos).toLowerCase();
      const KEYWORDS = [
        'asinh','acosh','atanh','asin','acos','atan',
        'sinh','cosh','tanh',
        'sin','cos','tan',
        'sqrt','sqr','cbrt','rec',
        'log','ln','exp',
        'ans','pi','e',
      ];
      for (const kw of KEYWORDS) {
        if (rest.startsWith(kw)) {
          const after = rest[kw.length];
          if (!after || !/[a-z0-9_]/.test(after)) {
            this.pos += kw.length;
            this._cur = { type: 'id', value: kw };
            return;
          }
        }
      }
      // Unknown — consume as raw id
      let id = '';
      while (this.pos < this.src.length && /[a-zA-Z0-9_]/.test(this.src[this.pos])) id += this.src[this.pos++];
      this._cur = { type: 'id', value: id.toLowerCase() };
      return;
    }

    // Operators
    this.pos++;
    const MAP = { '×': '*', '÷': '/', '−': '-' };
    this._cur = { type: 'op', value: MAP[ch] || ch };
  }

  expect(val) {
    const t = this._cur;
    if (t.value !== val) throw new Error(`Expected '${val}', got '${t.value || t.type}'`);
    this._advance();
    return t;
  }
}

class Parser {
  constructor(src, ans) {
    this.tok = new Tokenizer(src);
    this.ans = ans || 0;
  }

  parse() {
    const tree = this._expr();
    if (this.tok.peek().type !== 'eof') throw new Error('Unexpected input after expression');
    return tree;
  }

  _expr() { return this._additive(); }

  _additive() {
    let left = this._multiplicative();
    while (true) {
      const t = this.tok.peek();
      if (t.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      this.tok.consume();
      const right = this._multiplicative();
      if (t.value === '+') left = new NamedNode('add', [left, right], new LogSumNode(left, right));
      else                 left = new NamedNode('sub', [left, right], new LogDiffNode(left, right));
    }
    return left;
  }

  _multiplicative() {
    let left = this._unary();
    while (true) {
      const t = this.tok.peek();
      if (t.type !== 'op' || (t.value !== '*' && t.value !== '/')) break;
      this.tok.consume();
      const right = this._unary();
      // Use RealMulNode/RealDivNode so negative operands work (EmlLib.mul uses ln which fails for negatives)
      if (t.value === '*') left = new NamedNode('mul', [left, right], new RealMulNode(left, right));
      else                 left = new NamedNode('div', [left, right], new RealDivNode(left, right));
    }
    return left;
  }

  _unary() {
    const t = this.tok.peek();
    if (t.type === 'op' && t.value === '-') {
      this.tok.consume();
      return EmlLib.neg(this._unary());
    }
    return this._power();
  }

  _power() {
    const base = this._atom();
    const t = this.tok.peek();
    if (t.type === 'op' && t.value === '^') {
      this.tok.consume();
      const exp = this._unary(); // right-associative
      return EmlLib.pow(base, exp);
    }
    return base;
  }

  _atom() {
    const t = this.tok.peek();

    if (t.type === 'num') {
      this.tok.consume();
      return EmlLib.K(t.value);
    }

    if (t.type === 'op' && t.value === '(') {
      this.tok.consume();
      const inner = this._expr();
      this.tok.expect(')');
      return inner;
    }

    if (t.type === 'id') {
      this.tok.consume();
      const id = t.value;

      // Constants (no parens)
      if (id === 'pi')  return EmlLib.buildPiTree();
      if (id === 'e')   return EmlLib.K(Math.E);
      if (id === 'ans') return EmlLib.K(this.ans);

      // Functions (require opening paren)
      const pt = this.tok.peek();
      if (pt.type !== 'op' || pt.value !== '(') throw new Error(`Expected '(' after ${id}`);
      this.tok.consume(); // consume (

      const args = [this._expr()];
      while (this.tok.peek().type === 'op' && this.tok.peek().value === ',') {
        this.tok.consume();
        args.push(this._expr());
      }
      this.tok.expect(')');

      const [a, b] = args;
      switch (id) {
        case 'sin':   return new SinNode(a);
        case 'cos':   return new CosNode(a);
        case 'tan':   return EmlLib.div(new SinNode(a), new CosNode(a));
        case 'asin':  return new AsinNode(a);
        case 'acos':  return new AcosNode(a);
        case 'atan':  return args.length === 2
                        ? new AtanNode(EmlLib.div(a, b))
                        : new AtanNode(a);
        case 'sinh':  return EmlLib.sinh(a);
        case 'cosh':  return EmlLib.cosh(a);
        case 'tanh':  return EmlLib.tanh(a);
        case 'asinh': return EmlLib.asinh(a);
        case 'acosh': return EmlLib.acosh(a);
        case 'atanh': return new AtanhNode(a);
        case 'ln':    return EmlLib.ln(a);
        case 'log':   return args.length === 2
                        ? EmlLib.logBase(a, b)
                        : EmlLib.logBase(EmlLib.K(10), a);
        case 'exp':   return EmlLib.exp(a);
        case 'sqrt':  return EmlLib.sqrt(a);
        case 'sqr':   return EmlLib.sqr(a);
        case 'cbrt':  return EmlLib.pow(a, EmlLib.K(1/3));
        case 'rec':   return EmlLib.inv(a);
        default: throw new Error(`Unknown function: ${id}`);
      }
    }

    throw new Error(`Unexpected token: '${t.value || t.type}'`);
  }
}

function parse(src, ans) {
  try {
    return { ok: true, tree: new Parser(src, ans).parse() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Calculator State ─────────────────────────────────────────────────────────

const CalcState = {
  buffer:        '',
  lastAnswer:    0,
  isShift:       false,
  isHyp:         false,
  pendingResult: null,

  clear() {
    this.buffer = ''; this.pendingResult = null;
    this.isShift = false; this.isHyp = false;
  },

  del() {
    if (this.pendingResult !== null) { this.buffer = ''; this.pendingResult = null; return; }
    // Multi-char token aware backspace
    const m = this.buffer.match(/^([\s\S]*?)(asinh\(|acosh\(|atanh\(|asin\(|acos\(|atan\(|sinh\(|cosh\(|tanh\(|sin\(|cos\(|tan\(|sqrt\(|sqr\(|cbrt\(|rec\(|log\(|ln\(|exp\(|Ans|×10\^|.)$/);
    if (m) this.buffer = m[1];
  },

  append(s) {
    if (this.pendingResult !== null) {
      // After a result: digit starts fresh, operator continues with Ans
      this.buffer = /^[0-9.]$/.test(s) ? s : 'Ans' + s;
      this.pendingResult = null;
    } else {
      this.buffer += s;
    }
  },

  evaluate(onResult) {
    const src = this.buffer
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/Ans/g, `(${this.lastAnswer})`).replace(/π/g, 'pi')
      .replace(/×10\^/g, 'e');  // EXP button

    const r = parse(src, this.lastAnswer);
    if (!r.ok) { onResult(null, 'Syntax Error', null); return; }

    let result, steps;
    try {
      steps  = evaluateWithTrace(r.tree);
      result = r.tree.eval();
    } catch (e) {
      onResult(null, 'Math Error', null); return;
    }

    if (!isFinite(result)) { onResult(null, 'Math Error', null); return; }

    this.lastAnswer    = result;
    this.pendingResult = result;
    onResult(r.tree, result, steps);
  },
};

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatResult(v) {
  if (!isFinite(v)) return String(v);
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e12 || (abs < 1e-9)) return v.toExponential(9);
  return parseFloat(v.toPrecision(11)).toString();
}

function formatStep(step) {
  const { node, result, isEmlStep } = step;
  const lbl = node.label();
  const fmt = (x) => {
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    return parseFloat(x.toPrecision(8)).toString();
  };

  if (isEmlStep) {
    const lv = fmt(node.left.eval());
    const rv = fmt(node.right.eval());
    return `EML(${lv}, ${rv}) = exp(${lv}) − ln(${rv}) = ${fmt(result)}`;
  }
  const kids = node.children;
  if (kids.length === 0) return `${lbl} = ${fmt(result)}`;
  if (kids.length === 1) return `${lbl}(${fmt(kids[0].eval())}) = ${fmt(result)}`;
  return `${lbl}(${fmt(kids[0].eval())}, ${fmt(kids[1].eval())}) = ${fmt(result)}`;
}

// ─── Tree Renderer ────────────────────────────────────────────────────────────

const NODE_R  = 28;   // circle radius px
const H_GAP   = 20;   // horizontal gap between sibling subtrees
const V_GAP   = 80;   // vertical gap between levels
const H_PAD   = 30;
const V_PAD   = 36;

class TreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._root  = null;
    this._steps = [];
    this._revealedCount = 0;
    this._selectedStep  = -1;
    this._timer         = null;
    this._zoom  = 1;
    this._panX  = H_PAD;
    this._panY  = V_PAD;
    this._dragging  = false;
    this._dragLast  = null;
    this._dragMoved = false;
    this.expandedNodes = new Set();

    this.onStepRevealed = null; // callback(stepIdx)
    this.onNodeSelected = null; // callback(stepIdx)
    this.onExpanded     = null; // callback() — fired when a node is expanded/collapsed

    this._bindEvents();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setTree(root, steps) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._root  = root;
    this._steps = steps || [];
    this._revealedCount = 0;
    this._selectedStep  = -1;
    this._zoom = 1; this._panX = H_PAD; this._panY = V_PAD;
    // Start fully expanded — add every expandable NamedNode
    this.expandedNodes = new Set();
    this._expandAll(root);
    this._layout();
    this._draw();
  }

  // Recursively expand all NamedNodes that have an inner EML tree
  _expandAll(node) {
    if (node instanceof NamedNode && node._inner) {
      this.expandedNodes.add(node);
      // Walk semantic children (the collapsed view) so we reach all named nodes
      for (const c of node._semChildren) this._expandAll(c);
      // Also walk the inner tree to catch any nested named nodes
      this._expandAllInner(node._inner);
    } else {
      for (const c of node.children) this._expandAll(c);
    }
  }

  _expandAllInner(node) {
    if (node instanceof NamedNode && node._inner) {
      this.expandedNodes.add(node);
      for (const c of node._semChildren) this._expandAllInner(c);
      this._expandAllInner(node._inner);
    } else {
      for (const c of node.children) this._expandAllInner(c);
    }
  }

  clear() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._root  = null;
    this._steps = [];
    this._revealedCount = 0;
    this._selectedStep  = -1;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  animateEvaluation(steps) {
    if (this._timer) clearInterval(this._timer);
    this._steps = steps;
    this._revealedCount = 0;
    this._selectedStep  = -1;
    this._timer = setInterval(() => {
      this._revealedCount++;
      this._draw();
      if (this.onStepRevealed) this.onStepRevealed(this._revealedCount - 1);
      if (this._revealedCount >= this._steps.length) {
        clearInterval(this._timer); this._timer = null;
      }
    }, 300);
  }

  highlightStep(idx) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._revealedCount = idx + 1;
    this._selectedStep  = idx;
    this._draw();
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = Math.max(r.width  || 0, 200);
    this.canvas.height = Math.max(r.height || 0, 200);
    this._draw();
  }

  applyZoom(delta, mx, my) {
    const factor = delta > 0 ? 0.88 : 1.12;
    const wx = (mx - this._panX) / this._zoom;
    const wy = (my - this._panY) / this._zoom;
    this._zoom = Math.min(4, Math.max(0.25, this._zoom * factor));
    this._panX = mx - wx * this._zoom;
    this._panY = my - wy * this._zoom;
    this._draw();
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  _visKids(node) {
    if (this.expandedNodes.has(node) && node._inner) {
      return node._inner.children;
    }
    return node.children;
  }

  _layout() {
    if (!this._root) return;
    this._computeW(this._root);
    this._assignPos(this._root, this._root._w / 2, V_PAD, 0);
  }

  _computeW(node) {
    const kids = this._visKids(node);
    if (!kids.length) { node._w = NODE_R * 2; return; }
    for (const c of kids) this._computeW(c);
    node._w = Math.max(NODE_R * 2,
      kids.reduce((s, c) => s + c._w, 0) + H_GAP * (kids.length - 1));
  }

  _assignPos(node, cx, y, depth) {
    node._x = cx; node._y = y;
    const kids = this._visKids(node);
    if (!kids.length) return;
    let left = cx - node._w / 2;
    for (const c of kids) {
      this._assignPos(c, left + c._w / 2, y + V_GAP, depth + 1);
      left += c._w + H_GAP;
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  _draw() {
    const { canvas: cv, ctx } = this;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!this._root) return;

    // Map node → step index
    const nodeStep = new Map();
    this._steps.forEach((s, i) => nodeStep.set(s.node, i));

    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    this._drawEdgesOf(ctx, this._root);
    this._drawNodesOf(ctx, this._root, nodeStep);

    ctx.restore();
  }

  _drawEdgesOf(ctx, node) {
    for (const c of this._visKids(node)) {
      ctx.beginPath();
      ctx.moveTo(node._x, node._y);
      ctx.lineTo(c._x, c._y);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this._drawEdgesOf(ctx, c);
    }
  }

  _drawNodesOf(ctx, node, nodeStep) {
    for (const c of this._visKids(node)) this._drawNodesOf(ctx, c, nodeStep);

    const idx = nodeStep.get(node);
    const R   = NODE_R;

    // Fill colour by animation state
    let fill = '#3a3a3a'; // pending (not yet reached)
    if (idx !== undefined) {
      if (idx < this._revealedCount - 1) fill = '#215c21';   // done — green
      if (idx === this._revealedCount - 1) fill = '#a06800';  // current — amber
    }

    // Circle
    ctx.beginPath();
    ctx.arc(node._x, node._y, R, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    // EML primitive ring — amber tint
    if (node instanceof BinaryEmlNode) {
      ctx.beginPath();
      ctx.arc(node._x, node._y, R - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,190,0,0.55)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Selected highlight
    if (idx === this._selectedStep) {
      ctx.beginPath();
      ctx.arc(node._x, node._y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#4af';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Expand/collapse badge — bottom-right of circle
    // Shows − when expanded (click to collapse), + when collapsed (click to expand)
    if (node instanceof NamedNode && node._inner) {
      const isExp  = this.expandedNodes.has(node);
      const bx     = node._x + R * 0.65;
      const by     = node._y + R * 0.65;
      const br     = 8; // badge radius

      // Badge background: dark pill
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.strokeStyle = isExp ? '#ff6' : '#6ff';  // yellow when expanded, cyan when collapsed
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Symbol: bold − or +
      ctx.fillStyle = isExp ? '#ff6' : '#6ff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isExp ? '−' : '+', bx, by + 0.5);
    }

    // Evaluated value label (shown above circle once revealed)
    if (idx !== undefined && idx < this._revealedCount) {
      let v = NaN;
      try { v = node.eval(); } catch (_) {}
      if (isFinite(v)) {
        const vs = Math.abs(v) > 999 || (Math.abs(v) < 0.001 && v !== 0)
          ? v.toExponential(2) : parseFloat(v.toPrecision(4)).toString();
        ctx.fillStyle = '#9df';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(vs, node._x, node._y - R - 2);
      }
    }

    // Node label
    const lbl = node.label();
    ctx.fillStyle = node instanceof BinaryEmlNode ? '#ffc040' : '#fff';
    ctx.font = `bold ${lbl.length > 4 ? '10' : '12'}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, node._x, node._y);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.applyZoom(e.deltaY, e.offsetX, e.offsetY);
    }, { passive: false });

    c.addEventListener('pointerdown', e => {
      this._dragging  = true;
      this._dragLast  = { x: e.offsetX, y: e.offsetY };
      this._dragMoved = false;
      c.setPointerCapture(e.pointerId);
    });

    c.addEventListener('pointermove', e => {
      if (!this._dragging) return;
      const dx = e.offsetX - this._dragLast.x;
      const dy = e.offsetY - this._dragLast.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
      this._panX += dx; this._panY += dy;
      this._dragLast = { x: e.offsetX, y: e.offsetY };
      this._draw();
    });

    c.addEventListener('pointerup', e => {
      if (!this._dragMoved) this._handleClick(e.offsetX, e.offsetY);
      this._dragging = false;
    });

    c.addEventListener('contextmenu', e => { e.preventDefault(); this._handleExpand(e.offsetX, e.offsetY); });
    c.addEventListener('dblclick',    e => this._handleExpand(e.offsetX, e.offsetY));
  }

  _toWorld(mx, my) {
    return { wx: (mx - this._panX) / this._zoom, wy: (my - this._panY) / this._zoom };
  }

  _hitTest(mx, my) {
    if (!this._root) return null;
    const { wx, wy } = this._toWorld(mx, my);
    let hit = null;
    const visit = (node) => {
      if (hit) return;
      const dx = node._x - wx, dy = node._y - wy;
      if (dx*dx + dy*dy <= NODE_R*NODE_R) { hit = node; return; }
      for (const c of this._visKids(node)) visit(c);
    };
    visit(this._root);
    return hit;
  }

  _handleClick(mx, my) {
    const node = this._hitTest(mx, my);
    if (!node) return;
    const idx = this._steps.findIndex(s => s.node === node);
    if (idx < 0) return;
    if (idx >= this._revealedCount) {
      this.highlightStep(idx);
    } else {
      this._selectedStep = idx;
      this._draw();
    }
    if (this.onNodeSelected) this.onNodeSelected(idx);
  }

  _handleExpand(mx, my) {
    const node = this._hitTest(mx, my);
    if (!node || !(node instanceof NamedNode) || !node._inner) return;
    if (this.expandedNodes.has(node)) this.expandedNodes.delete(node);
    else                              this.expandedNodes.add(node);
    this._layout();
    this._draw();
    if (this.onExpanded) this.onExpanded();
  }
}

// ─── Expose to page ───────────────────────────────────────────────────────────

window.EML = {
  ConstantNode, BinaryEmlNode, NamedNode,
  SinNode, CosNode, AtanNode, AsinNode, AcosNode, AtanhNode,
  RealMulNode, RealDivNode, LogDiffNode, LogSumNode,
  EmlLib, parse, evaluateWithTrace,
  CalcState, TreeRenderer,
  formatStep, formatResult,
};

})(); // end IIFE
