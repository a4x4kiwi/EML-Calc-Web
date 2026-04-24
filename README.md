# EML Calculator

A scientific calculator where every computation is internally represented as an **EML binary tree** using the single primitive:

> **eml(x, y) = exp(x) − ln(y)**

All standard functions — addition, multiplication, sin, cos, pow, sqrt, and more — are built exclusively from this one operation. Only `Math.exp` and `Math.log` exist at the leaf level. Based on the paper [arXiv:2603.21852](https://arxiv.org/abs/2603.21852).

## Live page

**[https://a4x4kiwi.github.io/EML-Calc-Web](https://a4x4kiwi.github.io/EML-Calc-Web)**

## Features

- FX-991W style calculator layout with SHIFT / HYP modifier keys
- EML tree panel showing the binary tree for every computation
- Post-order animated evaluation — watch each node evaluate step by step
- Click any tree node to jump to its working-log entry, and vice versa
- Double-click / right-click any named node to expand it into its raw EML primitive subtree
- Cyan dot on nodes = can expand · Orange dot = currently expanded
- Zoom and pan the tree with scroll wheel and drag
- Fully standalone — a single `index.html` file, no build step, no dependencies

## How it works

Every function is expressed purely in terms of `eml(x, y) = exp(x) − ln(y)`:

```
exp(x)     = EML(x, 1)
ln(x)      = EML(1, EML(EML(1,x), 1))
add(a, b)  = a + b
mul(a, b)  = exp(ln(a) + ln(b))
sqrt(x)    = exp(ln(x) / 2)
pow(x, y)  = exp(y · ln(x))
sinh(x)    = EML(x, exp(cosh(x)))
sin(x)     = 15-term Taylor series with argument reduction
π          = 4·(4·atan(1/5) − atan(1/239))  via Machin's formula
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Self-contained app (CSS + JS inlined) |
| `eml.js` | Source: engine, parser, tree renderer |
| `style.css` | Source: stylesheet |
| `test_engine.js` | Node.js smoke tests (`node test_engine.js`) |
| `identities.sx` | EML identity definitions — original source from Clifford Heath |

## Credits

- **Casio Computer Co., Ltd.** — UI layout and design inspired by the iconic Casio fx-991, a classic 1980s scientific calculator. Casio is a registered trademark of Casio Computer Co., Ltd. This project is an independent fan work with no affiliation.
- **Clifford Heath** ([@cjheath](https://codeberg.org/cjheath)) — `identities.sx` identity definitions, from the [simple_form](https://codeberg.org/cjheath/simple_form) project
- Paper: [arXiv:2603.21852](https://arxiv.org/abs/2603.21852) — *All elementary functions from a single binary operator*
- Zenodo supplementary code: [zenodo.org/records/19183008](https://zenodo.org/records/19183008)
