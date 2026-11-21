# Markdown Extensions

Use only for richer Markdown beyond plain structure.

Supported patterns:

```md
> [!TIP]
> Use for helpful guidance.
```

```md
> [!WARNING]
> Use for risks or constraints.
```

```md
Text with a footnote.[^1]

[^1]: Extra detail.
```

```md
<details>
<summary>More</summary>

Hidden detail.
</details>
```

Use extensions sparingly. They should improve scanning, not decorate docs.

Avoid rich extensions in `XX00` / `XXX0` router docs unless they clarify routing. Routers should stay plain and fast to scan.
