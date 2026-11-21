import { basicStyles, buttonMotion, buttonTones, cx, radius } from "@/ui/basic/styles";

export const tableSearchOptions = { expandedWidth: 320, collapsedWidth: 28 } as const;
export const tableSearchStyles = {
  frame: cx("relative h-7 min-w-0 max-w-full transition-[width]", buttonMotion.duration, buttonMotion.easing, buttonMotion.reducedMotion),
  form: cx("relative transition-[opacity,visibility]", buttonMotion.duration, buttonMotion.easing, buttonMotion.reducedMotion),
  trigger: cx("absolute inset-y-0 left-0 transition-[opacity,visibility]", buttonMotion.duration, buttonMotion.easing, buttonMotion.reducedMotion),
  shown: "visible opacity-100",
  hidden: "invisible opacity-0",
} as const;

export const tableMotion = { durationMs: 100, easing: "ease-out" } as const;

/** Shared table/paginator geometry and hover surfaces. Filter owns its selected state. */
export const tableStyles = {
  region: "@container overflow-x-auto overflow-y-hidden rounded-md border border-table-border transition-[height] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  toolbar: "flex items-center justify-between gap-2 px-3 py-1 [&_button:not([data-table-filter]):not([aria-pressed=true])]:border-button-border [&_button:not([data-table-filter]):not([aria-pressed=true])]:bg-transparent [&_button:not([data-table-filter]):not([aria-pressed=true])]:text-button-foreground [&_button:not([data-table-filter]):not([aria-pressed=true]):hover]:bg-button-hover [&_button:not([data-table-filter]):not([aria-pressed=true]):hover]:text-button-foreground [&_button:not([data-table-filter]):not([aria-pressed=true]):active]:bg-button-active",
  paginator: "grid grid-cols-1 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1 shadow-sm @min-[900px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
  counters: "flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground",
  pages: "flex flex-wrap items-center justify-center gap-2",
  iconButton: cx(basicStyles.button, buttonTones["main-outline"], "size-7 p-0"),
  pageButton: cx(basicStyles.button, buttonTones["main-outline"], "h-7 px-2 text-xs"),
  jumpForm: "relative w-24",
  jumpInput: "h-7 min-h-0 py-0 pr-7 text-center text-xs",
  jumpButton: "absolute right-1 top-1/2 size-6 -translate-y-1/2 p-0",
  pageSizeForm: "flex items-center gap-1.5 @min-[900px]:justify-self-end",
  loadingBody: "sticky left-0 flex min-h-[var(--table-loading-height,9rem)] w-[100cqw] max-w-full items-center justify-center gap-2 text-sm text-muted-foreground",
  dataBody: "table-data-enter",
} as const;

export const productFormStyles = {
  form: "space-y-4",
  field: "grid min-w-0 gap-1 text-sm",
  label: "font-medium",
  hint: "text-xs text-muted-foreground",
  error: "text-xs text-error",
  priceRow: "grid grid-cols-[minmax(0,1fr)_7rem] gap-3",
  upload: "grid cursor-pointer place-items-center gap-2 rounded-md border-2 border-dashed border-input-border bg-input p-4 text-center text-sm hover:border-primary",
  preview: "max-h-48 w-auto rounded-md object-contain",
  footer: "flex w-full items-center justify-end gap-2",
} as const;

export const tablePaginatorOptions = {
  pageWindow: 5,
  tooltipPlacement: "top",
} as const;

export const sessionWarningStyles = {
  actions: "grid-flow-row grid-cols-1 sm:w-full sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-3",
  tones: { logout: "danger-outline", acknowledge: "main-outline", renew: "warning-outline" },
} as const;

export const sessionLogoutStyles = {
  content: "flex min-h-24 items-center justify-center px-2 py-4",
  status: "text-base font-semibold text-foreground",
} as const;

export const userPanelV2Styles = {
  backdrop: "backdrop:transition-[backdrop-filter,background-color] backdrop:duration-[400ms] motion-reduce:backdrop:transition-none",
  clearBackdrop: "backdrop:bg-transparent backdrop:backdrop-blur-none backdrop:transition-[backdrop-filter,background-color] backdrop:duration-[400ms] motion-reduce:backdrop:transition-none",
  trigger: "w-[150px] shrink-0 justify-between data-[expanded=true]:invisible",
  frame: cx(radius.control, "fixed inset-auto m-0 w-[150px] overflow-y-auto border border-panel-border bg-panel text-panel-foreground shadow-panel left-[var(--user-panel-left)] transition-[width,left] duration-200 ease-out data-[wide=true]:left-[var(--user-panel-open-left)] data-[wide=true]:w-[var(--user-panel-width)] motion-reduce:transition-none"),
  header: "ml-auto flex h-[30px] min-h-0 w-[148px] items-center gap-2 rounded-none border-0 px-2 py-0 shadow-none transition-[width,height,padding] duration-200 ease-out data-[expanded=true]:h-20 data-[expanded=true]:w-[calc(var(--user-panel-width)-2px)] data-[expanded=true]:pl-4 motion-reduce:transition-none",
  avatar: "flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full transition-[width,height] duration-200 ease-out data-[expanded=true]:size-12 data-[expanded=true]:border data-[expanded=true]:border-border data-[expanded=true]:bg-muted motion-reduce:transition-none",
  icon: "size-full",
  identity: "flex min-w-0 flex-1 flex-col items-start text-left",
  name: "w-full truncate text-sm font-semibold",
  email: "max-h-0 w-full truncate text-xs font-normal text-muted-foreground opacity-0 transition-[max-height,opacity,margin] duration-200 ease-out data-[expanded=true]:mt-1 data-[expanded=true]:max-h-5 data-[expanded=true]:opacity-100 motion-reduce:transition-none",
  chevron: "size-3 shrink-0 self-start mt-2 transition-transform duration-200 ease-out data-[expanded=true]:rotate-180 motion-reduce:transition-none",
  body: "grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 ease-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100 motion-reduce:transition-none",
  bodyClip: "min-h-0 overflow-hidden",
  bodyContent: "px-4 pb-4",
} as const;

export const cornerBadgeStyles = {
  wrapper: "relative inline-flex max-w-full",
  marker: "pointer-events-none absolute z-10 inline-flex items-center justify-center whitespace-nowrap border border-background text-[10px] font-black leading-none shadow-sm",
  placements: {
    "top-right": "right-0 top-0 translate-x-1/2 -translate-y-1/2",
    "top-left": "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
    "bottom-right": "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
    "bottom-left": "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
  },
  colors: {
    green: "bg-success text-success-foreground",
    red: "bg-error text-error-foreground",
    blue: "bg-primary text-primary-foreground",
    amber: "bg-warning text-warning-foreground",
    neutral: "bg-standard text-standard-foreground",
  },
  shapes: {
    dot: "size-2.5 rounded-full p-0",
    count: "size-4 rounded-full p-0",
    pill: "h-4 min-w-4 rounded-full px-1",
  },
} as const;

export const blurStyles = {
  surface: "pointer-events-none absolute inset-0 z-0 bg-black/45 backdrop-blur-sm",
  backdrop: "backdrop:bg-black/45 backdrop:backdrop-blur-sm",
} as const;

export const asideStyles = {
  layer: "aside-layer fixed inset-0 m-0 h-auto w-auto overflow-hidden border-0 bg-transparent p-0 text-foreground outline-none",
  backdrop: "aside-backdrop pointer-events-auto absolute inset-0 opacity-0 transition-opacity duration-200 motion-reduce:transition-none",
  panel: "aside-panel pointer-events-auto absolute inset-y-0 right-0 flex min-w-0 flex-col border-l border-panel-border bg-panel text-panel-foreground shadow-panel outline-none data-[resizing=true]:cursor-ew-resize",
  header: "flex h-[var(--aside-header-height,50px)] min-h-0 shrink-0 items-center gap-3 border-b border-border px-4 py-1",
  body: "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
  footer: "flex h-[var(--aside-footer-height,40px)] shrink-0 items-center justify-end gap-2 border-t border-border px-4",
  resize: "group/resize absolute inset-y-0 -left-px z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none",
  resizeGrip: "pointer-events-none absolute left-0 top-1/2 flex h-8 w-full -translate-y-1/2 items-center justify-center rounded border border-panel-border bg-panel text-muted-foreground group-hover/resize:text-panel-foreground group-focus-visible/resize:text-panel-foreground",
} as const;

export const notificationStyles = {
  trigger: "relative isolate size-8 shrink-0 p-0 data-[expanded=true]:border-accent data-[expanded=true]:bg-accent data-[expanded=true]:text-accent-foreground data-[expanded=true]:hover:bg-accent",
  pulse: "notification-pulse pointer-events-none absolute inset-0 rounded-md motion-reduce:animate-none",
  headerIcon: "size-5 shrink-0",
  bodyContent: "space-y-2 p-4",
  iconButton: "size-8 min-h-8 shrink-0 p-0",
  item: "flex min-w-0 items-start gap-3 rounded-md border border-border bg-background p-3",
  icons: { error: "text-error", warning: "text-warning", success: "text-success", info: "text-primary" },
} as const;

export const asideSectionMotion = { durationMs: 200 } as const;
export const asideSectionStyles = {
  section: "-mx-4 mb-4",
  toggle: "flex w-full cursor-pointer items-center justify-between gap-2 border-b border-border px-4 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  icon: "size-3.5 shrink-0 transition-transform ease-out motion-reduce:transition-none",
  content: "grid transition-[grid-template-rows] ease-out motion-reduce:transition-none",
  clip: "min-h-0 overflow-hidden",
  padding: "px-4 pt-3",
} as const;

export const popupStyles = {
  frame: cx(radius.control, "max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl outline-none open:flex open:flex-col"),
  sizes: { default: "max-w-xl", wide: "max-w-5xl" },
  header: "flex shrink-0 items-center justify-between gap-4 border-b border-border pl-5 pr-1 py-1",
  title: "min-w-0 flex-1 break-words text-base font-semibold text-foreground",
  close: cx(radius.control, "ml-auto size-8 min-h-8 shrink-0 p-0"),
  closeIcon: "size-4",
  content: "min-h-0 overflow-y-auto px-5 py-4 text-sm leading-6 text-muted-foreground",
  actions: "flex shrink-0 justify-end border-t border-border px-5 py-1",
  actionGrid: "grid w-full min-w-0 auto-cols-fr grid-flow-col items-stretch gap-2 sm:w-auto sm:auto-cols-[150px] [&>form]:min-w-0 [&_button]:h-8 [&_button]:min-h-8 [&_button]:w-full [&_button]:px-2 [&_button]:py-1 [&_button]:whitespace-nowrap",
  customContent: "min-h-0 overflow-y-auto p-4",
} as const;

export const selectorStyles = {
  icon: "size-8 shrink-0 border-button-border bg-button p-1.5 shadow-button hover:bg-button-hover/60",
  text: "h-7 min-h-7 w-auto min-w-0 justify-start border-button-border bg-button px-2 py-0 text-sm font-medium shadow-button hover:bg-button-hover/60",
  symbol: "size-4 shrink-0",
  flag: "h-3 w-6 shrink-0 overflow-hidden rounded-xs ring-1 ring-border",
  languagePreview: "grid place-items-center",
  languageLabel: "col-start-1 row-start-1 inline-flex items-center gap-2 transition-[opacity,transform,translate] duration-200 ease-out motion-reduce:transition-none",
  languageCurrent: "translate-y-0 opacity-100 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:-translate-y-1 group-focus-visible:opacity-0",
  languageNext: "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
  contrastIcon: "rotate-180 transition-[rotate] duration-200 ease-out data-[contrast=high]:rotate-0 motion-reduce:transition-none",
  themeSymbol: "relative inline-block size-4 shrink-0",
  themeIcon: "absolute inset-0 size-full -rotate-90 scale-50 opacity-0 transition-[opacity,transform,scale,rotate] duration-200 ease-out data-[active=true]:rotate-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 motion-reduce:transition-none",
  group: "flex flex-wrap items-center gap-2",
  status: "inline-flex shrink-0 items-center",
  statusDot: "size-2 rounded-full animate-pulse motion-reduce:animate-none",
  backToTop: "size-7 border-button-border bg-button p-1 shadow-button hover:bg-button-hover/60",
  statusColors: {
    checking: "bg-warning",
    available: "bg-success",
    unavailable: "bg-danger",
  },
} as const;
/** Shared service-history appearance and polling cadence. */
export const monitoringTiming = { refreshMs: 30000 } as const;

export const dashboardStyles = {
  grid: 'mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
  tile: 'glass-inset flex min-w-0 flex-col p-4',
  metrics: 'my-5 grid grid-cols-2 gap-x-4 gap-y-3',
  value: 'mt-1 break-words text-xl font-semibold tabular-nums text-foreground',
  tileFooter: 'mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3',
  link: 'inline-flex items-center gap-1.5 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
} as const;
export const queueTiming = { refreshMs: 5000 } as const;
export const monitoringStyles = {
  divisions: "pointer-events-none absolute -inset-y-1 inset-x-0",
  division: "absolute h-full border-l border-dashed border-foreground/45",
  axis: "relative mt-2 h-5 text-[10px] tabular-nums text-muted-foreground sm:text-xs",
  row: "min-w-0 border-b border-border py-4",
  timeline: "flex h-7 w-full gap-px sm:gap-1",
  tick: "h-full w-full min-w-0 rounded-sm transition-opacity duration-100 hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none",
  colors: { healthy: "bg-success", degraded: "bg-warning", error: "bg-danger", unknown: "bg-muted-foreground/25", unconfigured: "bg-muted-foreground/50" },
} as const;
