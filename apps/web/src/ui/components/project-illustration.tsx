import { BoxSeam, FileEarmarkText, ListTask, ShieldLock, Window } from "react-bootstrap-icons";

const modules = [
  { icon: ShieldLock, position: "left-[5%] top-[8%]", tone: "text-accent" },
  { icon: FileEarmarkText, position: "right-[5%] top-[8%]", tone: "text-success" },
  { icon: Window, position: "bottom-[8%] left-[5%]", tone: "text-warning" },
  { icon: ListTask, position: "bottom-[8%] right-[5%]", tone: "text-accent" },
] as const;

/** Decorative project graphic; capability descriptions remain ordinary page content. */
export function ProjectIllustration({ engine = false }: { engine?: boolean }) {
  return (
    <div role={engine ? "img" : undefined} aria-label={engine ? "FORMIQ ENGINE" : undefined} aria-hidden={engine ? undefined : true} className="relative mx-auto aspect-[6/5] w-full max-w-lg select-none">
      <svg viewBox="0 0 480 400" fill="none" className="absolute inset-0 size-full text-accent">
        <defs>
          <pattern id="project-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.16" />
          </pattern>
        </defs>
        <rect x="16" y="16" width="448" height="368" rx="24" fill="url(#project-grid)" />
        <rect x="113" y="73" width="254" height="254" rx="36" stroke="currentColor" strokeOpacity="0.12" />
        <rect x="143" y="103" width="194" height="194" rx="28" stroke="currentColor" strokeOpacity="0.12" />
        <g stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" strokeLinecap="round" strokeLinejoin="round">
          <path d="M76 92H116V172H188" />
          <path d="M404 92H364V172H292" />
          <path d="M76 308H116V228H188" />
          <path d="M404 308H364V228H292" />
        </g>
        <g fill="currentColor">
          <circle cx="116" cy="172" r="3" />
          <circle cx="364" cy="228" r="3" />
        </g>
      </svg>
      <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-accent/20 bg-accent/10 rotate-12" />
      <div className="absolute left-1/2 top-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-3 rounded-2xl border border-accent bg-panel text-accent shadow-panel">
        <BoxSeam aria-hidden="true" className={engine ? "size-8" : "size-10"} />
        {engine ? (
          <span className="flex flex-col items-center gap-1.5 pl-[0.25em] font-mono text-xs font-semibold leading-none tracking-[0.25em]">
            <span>FORMIQ</span>
            <span>ENGINE</span>
          </span>
        ) : (
          <span className="text-[10px] font-bold tracking-[0.2em]">FORMIQ</span>
        )}
      </div>
      {modules.map(({ icon: Icon, position, tone }, index) => (
        <div key={index} className={`absolute flex h-[23%] w-[23%] flex-col items-center justify-center gap-3 rounded-xl border border-panel-border bg-panel shadow-panel ${position} ${tone}`}>
          <Icon className="size-7 sm:size-8" />
          <span className="flex gap-1.5">
            <span className="h-1 w-6 rounded-full bg-current opacity-40" />
            <span className="h-1 w-2 rounded-full bg-current opacity-20" />
          </span>
        </div>
      ))}
    </div>
  );
}
