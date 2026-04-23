// Quick smoke test — run with: node test_engine.js
// Uses Function() to evaluate eml.js in a fresh context so classes are available.

const fs = require('fs');
// Load via eval with a window stub so the IIFE runs and populates window.EML
global.window = {};
const src = fs.readFileSync('./eml.js', 'utf8');
eval(src);
const M = global.window.EML;
const { ConstantNode, BinaryEmlNode, NamedNode, SinNode, CosNode, AtanNode, AsinNode, AcosNode, EmlLib, parse } = M;

let pass = 0, fail = 0;
function check(label, got, expected, tol) {
  tol = tol !== undefined ? tol : 1e-9;
  const ok = Math.abs(got - expected) < tol;
  console.log((ok ? '✓' : '✗'), label, '=', got, ok ? '' : `  (expected ${expected})`);
  ok ? pass++ : fail++;
}

// Primitive
check('EML(1,1)', new BinaryEmlNode(new ConstantNode(1), new ConstantNode(1)).eval(), Math.E);

// Library
check('exp(1)',    EmlLib.exp(EmlLib.K(1)).eval(), Math.E);
check('ln(e)',     EmlLib.ln(EmlLib.K(Math.E)).eval(), 1);
check('add(1,1)',  EmlLib.add(EmlLib.K(1), EmlLib.K(1)).eval(), 2);
check('sub(5,3)',  EmlLib.sub(EmlLib.K(5), EmlLib.K(3)).eval(), 2);
check('mul(3,4)',  EmlLib.mul(EmlLib.K(3), EmlLib.K(4)).eval(), 12);
check('div(10,4)', EmlLib.div(EmlLib.K(10), EmlLib.K(4)).eval(), 2.5);
check('sqrt(9)',   EmlLib.sqrt(EmlLib.K(9)).eval(), 3);
check('pow(2,10)', EmlLib.pow(EmlLib.K(2), EmlLib.K(10)).eval(), 1024);
check('neg(5)',    EmlLib.neg(EmlLib.K(5)).eval(), -5);
check('inv(4)',    EmlLib.inv(EmlLib.K(4)).eval(), 0.25);
check('hypot(3,4)',EmlLib.hypot(EmlLib.K(3), EmlLib.K(4)).eval(), 5);
check('cosh(0)',   EmlLib.cosh(EmlLib.K(0)).eval(), 1);
check('sinh(0)',   EmlLib.sinh(EmlLib.K(0)).eval(), 0, 1e-8);
check('tanh(0)',   EmlLib.tanh(EmlLib.K(0)).eval(), 0, 1e-8);
check('PI',        EmlLib.PI.eval(), Math.PI, 1e-10);

// Taylor trig
check('sin(0)',     new SinNode(EmlLib.K(0)).eval(), 0, 1e-12);
check('sin(pi/2)',  new SinNode(EmlLib.K(Math.PI/2)).eval(), 1, 1e-10);
check('cos(0)',     new CosNode(EmlLib.K(0)).eval(), 1, 1e-12);
check('cos(pi)',    new CosNode(EmlLib.K(Math.PI)).eval(), -1, 1e-10);
check('atan(1)',    new AtanNode(EmlLib.K(1)).eval(), Math.PI/4, 1e-10);
check('asin(1)',    new AsinNode(EmlLib.K(1)).eval(), Math.PI/2, 1e-9);
check('acos(1)',    new AcosNode(EmlLib.K(1)).eval(), 0, 1e-9);
check('asinh(1)',   EmlLib.asinh(EmlLib.K(1)).eval(), Math.asinh(1), 1e-8);
check('acosh(2)',   EmlLib.acosh(EmlLib.K(2)).eval(), Math.acosh(2), 1e-8);

// Parser
function peval(s) {
  const r = parse(s);
  if (!r.ok) throw new Error(r.error);
  return r.tree.eval();
}
check('parse 1+1',       peval('1+1'), 2);
check('parse 3*4',       peval('3*4'), 12);
check('parse 2^10',      peval('2^10'), 1024);
check('parse sin(pi/2)', peval('sin(pi/2)'), 1, 1e-10);
check('parse ln(e)',     peval('ln(e)'), 1, 1e-10);
check('parse sqrt(9)',   peval('sqrt(9)'), 3, 1e-10);
check('parse log(10)',   peval('log(10)'), 1, 1e-10);
check('parse -3+5',      peval('-3+5'), 2);
check('parse (2+3)*4',   peval('(2+3)*4'), 20);
check('parse 10/4',      peval('10/4'), 2.5);
check('parse neg',       peval('-1*-1'), 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
