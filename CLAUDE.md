# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A scientific calculator where every computation is internally represented as an **EML binary tree** using the single primitive `eml(x, y) = exp(x) − ln(y)`. The UI makes this architecture visible via a live tree visualiser. Based on arXiv:2603.21852.

## Build & test commands

```bash
# Build Windows target (the only runnable target on this machine)
dotnet build EML_Calc.csproj -f net10.0-windows10.0.19041.0

# Run all tests (must cd into the test project first — it is not in the solution)
cd EML_Calc.Tests && dotnet test

# Run a single test class
cd EML_Calc.Tests && dotnet test --filter "FullyQualifiedName~ExpressionParserTests"

# Run a single test method
cd EML_Calc.Tests && dotnet test --filter "FullyQualifiedName~ExpressionParserTests.OneAddOne_IsTwo"
```

The test project lives at `EML_Calc.Tests/` and links Core source files via `<Compile Include>` — it is **not** a project reference. The main `.csproj` explicitly excludes `EML_Calc.Tests\**` to prevent the MAUI build from picking up xUnit attributes.

## Architecture

### Core engine (`Core/`)

All logic lives here with no UI dependencies.

**`EmlNode.cs`** — the node hierarchy:
- `EmlNode` (abstract base)
- `ConstantNode(double)` — leaf, any real value
- `BinaryEmlNode(left, right)` — the primitive: `exp(left) − ln(right)`
- `NegateNode(child)` — unary −x
- `LogDiffNode(a, b)` — real subtraction `a − b`; used in Taylor accumulation and log-domain arithmetic where partial sums may be negative
- `LogSumNode(a, b)` — real addition `a + b`; same use cases as LogDiffNode
- `LogProdNode(a, b)` — real multiplication `a × b`; used inside Pow/Sqrt
- `RealMulNode(a, b)` — plain `a × b` for Taylor term construction; unlike Mul() does not go through Ln, so handles zero inputs
- `RealDivNode(a, b)` — plain `a / b` for Taylor term construction; same reason
- `SinNode(child)`, `CosNode(child)` — runtime-dispatch nodes: reduce argument mod 2π then evaluate a freshly-built Taylor EML tree
- `AtanNode(child)` — runtime-dispatch: range-reduces then evaluates AtanTaylor EML tree
- `AsinNode(child)`, `AcosNode(child)` — delegate to AtanNode
- `UnaryFuncNode(UnaryFunc, child)` — abs, factorial, reciprocal, square, cube, 10^x
- `CombiNode(CombiFunc, n, r)` — nPr / nCr

**Why `LogDiffNode`/`LogSumNode`/`RealMulNode`/`RealDivNode` exist:**
- `Sub(a,b) = eml(ln(a), exp(b))` requires `a > 0` — fails for negative partial sums in Taylor series
- `Mul(x,y) = exp(ln(x)+ln(y))` fails when x or y is zero — Taylor terms like x^n are zero at x=0
- The Real*/Log* nodes perform plain arithmetic without these restrictions

**`EmlEngine.cs`** — stateless evaluator. `EvaluateWithTrace(root)` returns `(result, postOrderList)`. Every node type must be handled in `Walk()`'s switch — this is where "Unknown node type" errors originate if a new node is added without updating the engine.

**`EmlLibrary.cs`** — factory methods for all standard functions, verified algebraically. No `Math.Sin`, `Math.PI` etc. — only `Math.Exp` and `Math.Log` (inside `BinaryEmlNode`). Key identities:
- `exp(x) = eml(x, 1)`
- `ln(x) = eml(1, exp(eml(1, x)))`
- `sub(a,b) = eml(ln(a), exp(b))` — requires a > 0
- `mul/div/pow/sqrt` — use `LogDiffNode`/`LogProdNode`
- `sinh(x) = eml(x, exp(cosh(x)))` — single EML primitive (from identities.sx)
- `sin/cos` — 15-term Taylor via `SinNode`/`CosNode` with argument reduction to [−π, π]
- `atan` — 20-term Taylor via `AtanNode` with range reduction (three branches by |x|)
- `π` — Machin's formula: `4·(4·atan(1/5) − atan(1/239))`, pure EML tree, no seeded constants

**`ExpressionParser.cs`** — recursive-descent parser, string → EML tree. Operator precedence: `^` > `×÷` > `+-` > unary minus. Recognised tokens: digits, `sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh ln log exp sqrt sqr cbrt rec`, constants `π pi e`.

### UI layer (root namespace `EML_Calc`)

**`MainPage.xaml`** — two-column `Grid` (`RootGrid`): column 0 = fixed 340dp calculator body; column 1 = EML panel, starts at width 0 and expands when the EML toggle is switched on. FX-991W layout: 4 scientific rows (SHIFT/HYP/STO/RCL/DEL/AC; x⁻¹/x²/x³/yˣ/x√y/x!; sin/cos/tan/log/ln/Ans; (/)/nPr/nCr/EXP/π) plus a 5×4 main numeric pad.

**`MainPage.xaml.cs`** — code-behind wiring. Key responsibilities:
- `OnEmlModeToggled`: expands/collapses column 1, resizes native window via `SetWindowWidth`.
- `SetWindowWidth` / `GetDisplayScale`: Windows-only (`#if WINDOWS`) — reads the WinUI `AppWindow` and resizes in physical pixels accounting for DPI scale.
- `HideNativeTitleBar()`: sets `ExtendsContentIntoTitleBar = true`, transparent caption buttons, sets drag rectangles.
- `OnEmlTreeHandlerChanged`: wires `PointerWheelChanged` on the native `FrameworkElement` for scroll-wheel zoom (no Ctrl required).
- `OnNativePointerWheel`: passes cursor position to `EmlTreeCanvas.ApplyZoom` so zoom is centred on the mouse.
- `OnStepRevealed` / `SelectLogRow` / `OnNodeTapped`: bidirectional tree↔log linking.
- `UpdateTrigLabels()`: relabels sin/cos/tan/log/ln buttons when SHIFT or HYP is active.
- **Windows namespace pollution**: all Windows-specific APIs are inside `#if WINDOWS` blocks with fully-qualified names — do NOT add `using Microsoft.UI.Xaml` or `using Windows.Graphics` at the top level (ambiguous with MAUI types `GridLength`, `Thickness`, etc.).

**`EmlTreeView.cs`** — `GraphicsView` / `IDrawable`. Layout is always computed at zoom=1 to fill the full canvas; `_zoom` and `_panX`/`_panY` are applied as a draw-time transform only. Key methods:
- `SetTree(root)` — resets zoom/pan to 1/0, re-layouts to fill canvas, redraws.
- `Clear()` — resets zoom/pan, nulls `_trace` (guards against queued timer ticks after AC), redraws blank.
- `AnimateEvaluation(steps)` — post-order animation at 300ms/node; fires `StepRevealed(line, traceIndex)` each tick.
- `HighlightStep(traceIndex)` — stops animation, highlights all nodes up to that step.
- `ApplyZoom(delta, cursorX, cursorY)` — adjusts `_zoom` (0.25–4×) and updates `_panX`/`_panY` so the world-point under the cursor stays fixed. Draw transform: `Translate(pan) → Scale(zoom)`.
- `NodeTapped` event — fired when user taps a highlighted node.
- Must handle all node types in `ComputeWidth`, `AssignPositions`, `TreeDepth`, `DrawEdges`, `DrawNodes`.

**`Core/WorkingLog.cs`** — `WorkingLog.Format(EvalStep)` → `WorkingLogLine`. `IsLeaf=true` rows skipped in UI. `IsEmlStep=true` rows highlighted amber.

**`ViewModels/CalculatorViewModel.cs`** — INotifyPropertyChanged. `OnClear()` force-fires `PropertyChanged` for all three display properties regardless of value equality (so AC always visually resets). Fires `TreeEvaluated(IReadOnlyList<EvalStep>)` after each `=` press.

### Adding a new node type — checklist

1. Add class to `Core/EmlNode.cs`
2. Add case to `EmlEngine.Walk()` switch
3. Add cases to `EmlTreeView`: `ComputeWidth`, `AssignPositions`, `TreeDepth`, `DrawEdges`, `DrawNodes`
4. Add tests in `EML_Calc.Tests/`

### Adding a new library function — checklist

1. Add factory method to `EmlLibrary.cs` using existing primitives
2. Add parser token to `ExpressionParser.PeekToken()` and the atom switch
3. Add `[Theory]` rows to `EmlLibraryTests.cs` and `ExpressionParserTests.cs`
4. All accuracy assertions use `precision: 10` (10 decimal places)

## Reference

Paper: arXiv:2603.21852 — "All elementary functions from a single binary operator"  
Zenodo supplementary code: https://zenodo.org/records/19183008
