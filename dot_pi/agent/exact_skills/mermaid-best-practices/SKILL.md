---
name: mermaid-best-practices
description: Write correct, well-structured Mermaid diagrams. Use when creating or editing any Mermaid diagram — sequence diagrams, flowcharts, class diagrams, state machines, ER diagrams, architecture diagrams, XY charts, Gantt charts, mindmaps, timelines, and more. Load proactively when adding diagrams to runbooks, design docs, or documentation.
---
# Mermaid Best Practices

Use this skill when writing or editing Mermaid diagrams (`.mmd` files or fenced ` ```mermaid ` blocks).

Output diagrams as fenced code blocks (` ```mermaid `) unless writing to a standalone `.mmd` file.

## Diagram Type Selection

Choose the type that matches the information structure, not the visual preference.

| Request | Diagram type |
|---|---|
| Request/response flows, service interactions, API calls | `sequenceDiagram` |
| Decision trees, pipelines, conditional logic, system topology | `flowchart TD` |
| Data models, class hierarchies, type relationships | `classDiagram` |
| State machines, lifecycle transitions | `stateDiagram-v2` |
| Database schemas, entity relationships | `erDiagram` |
| Trends over time, time-series data | `xychart-beta` with `line` |
| Distributions, comparisons across categories | `xychart-beta` with `bar` |
| Flow/energy/cost transfers between nodes | `sankey-beta` |
| Proportional breakdowns | `pie` |
| Project schedules, task dependencies | `gantt` |
| Git branching and merge history | `gitGraph` |
| Hierarchical idea mapping | `mindmap` |
| Chronological events | `timeline` |
| Cloud/infra architecture | `architecture-beta` |
| 2×2 prioritization or positioning | `quadrantChart` |

## Sequence Diagrams

```
sequenceDiagram
    participant A as API Gateway
    participant B as Backend
    A->>B: POST /resource
    B-->>A: 201 Created
```

Arrow types:

| Arrow | Meaning |
|---|---|
| `->>` | Solid line — synchronous call |
| `-->>` | Dashed line — response |
| `-)` | Async message |
| `--)` | Async response |
| `-x` | Lost/failed message |

Common pitfalls:
- Wrap labels containing special characters in quotes: `A->>B: "POST /path?q=1&page=2"`
- Multi-line notes: `Note over A: Line 1<br/>Line 2`
- Participant IDs are case-sensitive: `api` and `API` are different nodes
- Use `participant X as Label` to give nodes readable display names

## Flowcharts

```
flowchart TD
    A[Start] --> B{Decision}
    B -- yes --> C[Action]
    B -- no --> D[Other]
```

Node shapes:

| Shape | Syntax | Use for |
|---|---|---|
| Rectangle | `[text]` | Process / step |
| Diamond | `{text}` | Decision |
| Rounded | `(text)` | Start/end |
| Stadium | `([text])` | Terminal |
| Cylinder | `[(text)]` | Database |
| Parallelogram | `[/text/]` | I/O |

Direction: `TD` (top-down), `LR` (left-right), `BT`, `RL`.

Label edges: `A -- label --> B` or `A -->|label| B` (both valid; pick one and be consistent).

## State Diagrams

```
stateDiagram-v2
    [*] --> Pending
    Pending --> Running: start
    Running --> Done: complete
    Running --> Failed: error
    Done --> [*]
    Failed --> [*]
```

Use `[*]` for the initial and final pseudo-states. Add transition labels after `:`.

## XY Charts

```
xychart-beta
    title "Error rate by service"
    x-axis ["api", "worker", "scheduler"]
    y-axis "errors/min" 0 --> 100
    bar [42, 18, 7]
```

Rules:
- Data point count must equal category count.
- Multiple series (bar + line) allowed in one chart.
- Use `line` for continuous trends, `bar` for discrete categories.

## Gantt Charts

```
gantt
    title Migration Plan
    dateFormat YYYY-MM-DD
    section Phase 1
        Task A :a1, 2026-07-01, 7d
        Task B :after a1, 5d
    section Phase 2
        Task C :2026-07-13, 3d
```

Use `after <id>` for dependency-based scheduling. Always set `dateFormat`.

## Architecture Diagrams (infra/cloud)

```
architecture-beta
    group vpc(cloud)[AWS VPC]
    service lb(internet)[Load Balancer] in vpc
    service app(server)[App] in vpc
    service db(database)[RDS] in vpc
    lb:R --> L:app
    app:R --> L:db
```

Prefer `architecture-beta` over `flowchart` for infra topology — it renders with icon support and cleaner spatial layout.

## Common Pitfalls

- **Quotes**: Always quote labels containing `:`, `#`, `/`, `&`, `?`, `=`, or `(`.
- **IDs vs labels**: Node IDs must be unique within the diagram; labels can repeat.
- **Long labels**: Keep node labels short. Move detail to a surrounding prose or a `Note`.
- **Deeply nested subgraphs**: Flatten to 2 levels max — deeper nesting degrades readability.
- **`beta` types**: `xychart-beta`, `sankey-beta`, `architecture-beta`, `packet-beta` — syntax may evolve; prefer them for their type when available but note the beta label.

## Before Finishing

- Verify every node referenced in edges is declared.
- Confirm arrow direction is consistent (don't mix `-->` and `<--` in the same diagram unless bi-directional flow is intentional).
- Use a title when the diagram will appear standalone (runbooks, design docs, Confluence pages).
- Keep diagrams focused: one concept per diagram. Split large diagrams rather than cramming everything in.
