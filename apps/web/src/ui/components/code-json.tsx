import { useMemo, type ReactNode } from "react";

const tokenPattern = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
const tokenColors = {
  key: "font-medium text-sky-800 dark:text-sky-300",
  string: "text-emerald-800 dark:text-emerald-300",
  number: "text-violet-800 dark:text-violet-300",
  literal: "text-amber-800 dark:text-amber-300",
};

function highlightLine(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const value = match[0];
    const offset = match.index;
    const end = offset + value.length;
    const kind = value.startsWith('"') ? line[end] === ":" ? "key" : "string"
      : /^-?\d/.test(value) ? "number" : "literal";
    tokens.push(line.slice(cursor, offset), <span key={offset} className={tokenColors[kind]}>{value}</span>);
    cursor = end;
  }
  tokens.push(line.slice(cursor));
  return tokens;
}

type Group = { id?: string; lines: string[] };

function jsonGroups(value: unknown, fields?: ReadonlyMap<string, string>) {
  const groups: Group[] = [];
  function write(line: string, id?: string) {
    const last = groups.at(-1);
    if (last && last.id === id) last.lines.push(line);
    else groups.push({ id, lines: [line] });
  }

  function visit(value: unknown, depth: number, prefix = "", suffix = "", group?: string) {
    const indent = "  ".repeat(depth);
    const array = Array.isArray(value);
    const object = value !== null && typeof value === "object" && !array
      ? value as Record<string, unknown> : undefined;
    const fieldId = object && (object.id ?? object.field_id);
    const id = typeof fieldId === "string" && fields?.has(fieldId) ? fieldId : group;
    const entries = array ? value.map(item => ["", item] as const)
      : Object.entries(object ?? {}).filter(([, content]) => content !== undefined);
    if (!entries.length) {
      write(indent + prefix + (JSON.stringify(value) ?? "null") + suffix, id);
      return;
    }
    write(indent + prefix + (array ? "[" : "{"), id);
    entries.forEach(([key, content], index) => visit(
      content, depth + 1, array ? "" : `${JSON.stringify(key)}: `,
      index < entries.length - 1 ? "," : "", id,
    ));
    write(indent + (array ? "]" : "}") + suffix, id);
  }

  visit(value, 0);
  return groups;
}

export function CodeJson({ value, fields, activeId, onActive, className }: {
  value: unknown;
  fields?: ReadonlyMap<string, string>;
  activeId?: string;
  onActive?: (id?: string) => void;
  className?: string;
}) {
  const groups = useMemo(() => jsonGroups(value, fields).map(({ id, lines }) => ({
    id, lines: lines.map(highlightLine),
  })), [value, fields]);
  return <pre className={`overflow-auto whitespace-pre-wrap wrap-anywhere font-mono text-sm leading-relaxed ${className ?? ""}`}>
    <code>
      {groups.map(({ id, lines }, index) => <span key={index}
        className={id && activeId === id ? "block bg-red-500/10 outline outline-1 outline-red-600" : "block"}
        data-field-id={id}
        role={id ? "group" : undefined} tabIndex={id ? 0 : undefined}
        aria-label={id ? fields?.get(id) : undefined}
        onMouseEnter={id ? () => onActive?.(id) : undefined}
        onMouseLeave={id ? () => onActive?.() : undefined}
        onFocus={id ? () => onActive?.(id) : undefined}
        onBlur={id ? () => onActive?.() : undefined}>
        {lines.map((line, lineIndex) => <span key={lineIndex}>
          {line}{index === groups.length - 1 && lineIndex === lines.length - 1 ? "" : "\n"}
        </span>)}
      </span>)}
    </code>
  </pre>;
}
