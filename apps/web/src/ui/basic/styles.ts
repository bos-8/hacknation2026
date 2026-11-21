import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["button", "input", "panel", "tooltip", "navbar", "footer", "table", "badge"] }],
    },
  },
});

/** Caller classes win within the same Tailwind utility and variant group. */
export function cx(...values: (string | undefined | null | false)[]) {
  return mergeClasses(values.filter(Boolean).join(" "));
}

/** Shared defaults. Keep complete Tailwind classes here so the compiler can discover them. */
export const radius = {
  control: "rounded-md",
  panel: "rounded-lg",
  inline: "rounded",
  pill: "rounded-full",
  focus: "rounded-sm",
} as const;

export const control = cx(radius.control, "min-h-9 w-full min-w-0 border border-input-border bg-input px-3 py-2 text-sm text-input-foreground shadow-input placeholder:text-input-placeholder disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-input-disabled read-only:bg-input-readonly focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-ring aria-invalid:border-danger aria-invalid:ring-danger");
export const toggle = "size-4 shrink-0 accent-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-danger";

export const badgeTones = {
  neutral: "border-badge-border bg-badge text-badge-foreground",
  accent: "border-accent text-accent",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
  primary: "border-primary text-primary",
  error: "border-error text-error",
} as const;

/** Filled semantic surfaces always pair their background with its matching text color. */
export const surfaceTones = {
  standard: "bg-standard text-standard-foreground",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  error: "bg-error text-error-foreground",
  primary: "bg-primary text-primary-foreground",
} as const;

/** Shared button hover animation. Edit these complete Tailwind tokens in one place. */
export const buttonMotion = {
  duration: "duration-200",
  easing: "ease-out",
  reducedMotion: "motion-reduce:transition-none",
} as const;

export const buttonTones = {
  main: "border-button-border bg-button text-button-foreground hover:bg-button-hover active:bg-button-active",
  standard: "border-standard-border bg-standard text-standard-foreground hover:bg-standard-hover active:bg-standard-active",
  primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
  accent: "border-transparent bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active",
  success: "border-transparent bg-success text-success-foreground hover:bg-success-hover active:bg-success-active",
  warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning-hover active:bg-warning-active",
  error: "border-transparent bg-error text-error-foreground hover:bg-error-hover active:bg-error-active",
  "success-outline": "border-success text-success hover:bg-success hover:text-success-foreground",
  "danger-outline": "border-danger text-danger hover:bg-danger hover:text-error-foreground",
  "warning-outline": "border-warning bg-transparent text-warning hover:bg-warning hover:text-warning-foreground",
  "main-outline": "border-button-border bg-transparent text-button-foreground hover:bg-button-hover hover:text-button-foreground active:bg-button-active",
  ghost: "border-transparent text-foreground hover:bg-muted active:bg-active",
} as const;

export const buttonSizes = {
  sm: "min-h-8 px-2 py-1",
  md: "min-h-9 px-3 py-2",
  lg: "min-h-11 px-4 py-3 text-base",
  icon: "size-9 shrink-0 p-2",
} as const;

export const headingSizes = { 1: "text-3xl", 2: "text-2xl", 3: "text-xl", 4: "text-lg", 5: "text-base", 6: "text-sm" } as const;

/** Default geometry, spacing and appearance for each primitive and its slots. */
export const basicStyles = {
  anchor: cx(radius.focus, "underline underline-offset-4 hover:text-accent"),
  badge: cx(radius.pill, "inline-flex items-center border px-2 py-0.5 text-xs font-medium shadow-badge"),
  blockquote: "border-l-4 border-border pl-4 text-muted-foreground",
  button: cx(radius.control, "inline-flex cursor-pointer items-center justify-center gap-2 border text-sm font-semibold shadow-button transition-[background-color,color,border-color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", buttonMotion.duration, buttonMotion.easing, buttonMotion.reducedMotion),
  checkbox: radius.inline,
  code: cx(radius.inline, "bg-muted px-1 py-0.5 font-mono text-sm"),
  details: cx(radius.control, "border border-border p-3"),
  dialog: cx(radius.panel, "m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto border border-panel-border bg-panel p-6 text-panel-foreground shadow-panel backdrop:bg-black/50"),
  fieldError: "text-sm text-danger",
  fieldset: cx(radius.control, "min-w-0 space-y-3 border border-border p-4"),
  form: "space-y-4",
  heading: "font-semibold tracking-tight",
  input: "file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-foreground",
  kbd: cx(radius.inline, "border border-border bg-card px-1.5 py-0.5 font-mono text-xs"),
  label: "text-sm font-medium",
  legend: "px-1 text-sm font-semibold",
  meter: "h-3 w-full",
  orderedList: "list-decimal space-y-1 pl-6",
  output: "text-sm",
  pre: cx(radius.control, "overflow-x-auto bg-muted p-4 font-mono text-sm"),
  progress: "h-2 w-full accent-accent",
  range: "w-full accent-accent disabled:opacity-50",
  separator: "my-4 border-0 border-t border-border",
  verticalDivider: "mx-1 inline-block h-5 w-px shrink-0 self-center bg-border",
  spinner: "inline-flex items-center gap-2",
  spinnerIndicator: cx(radius.pill, "size-4 animate-spin border-2 border-current border-r-transparent motion-reduce:animate-none"),
  spinnerLabel: "sr-only",
  summary: cx(radius.focus, "cursor-pointer font-medium"),
  tableCaption: "caption-bottom py-3 text-muted-foreground",
  tableCell: "px-3 py-2",
  tableActionColumn: "border-l border-table-border text-right",
  tableFoot: "border-t border-table-border bg-table-heading font-medium",
  tableHead: "bg-table-heading",
  tableHeader: "px-3 py-2 font-semibold",
  tableRow: "border-b border-table-border hover:bg-table-hover",
  table: "w-full border-collapse bg-table text-left text-sm text-table-foreground shadow-table",
  text: "text-base leading-relaxed",
  textarea: "min-h-24 resize-y",
  unorderedList: "list-disc space-y-1 pl-6",
  tooltipTrigger: "inline-flex max-w-full align-middle",
  tooltip: cx(radius.control, "fixed z-50 w-max max-w-[min(20rem,calc(100vw_-_1rem))] break-words border border-tooltip-border bg-tooltip px-2 py-1 text-xs text-tooltip-foreground opacity-100 shadow-tooltip transition-none"),
} as const;
