import type { ComponentPropsWithoutRef } from "react";
import type { BreadcrumbRoute } from "@/config/navigation";
import { ChevronRight, HouseDoor } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { cx } from "@/ui/basic/styles";

export type BreadcrumbProps = ComponentPropsWithoutRef<"nav"> & {
  items: { label: string; href?: BreadcrumbRoute["href"] }[];
};

export function Breadcrumb({ items, className, ...props }: BreadcrumbProps) {
  if (!items.length) return null;
  return <nav {...props} aria-label={props["aria-label"] ?? "Breadcrumb"} className={cx("min-w-0 text-xs font-semibold text-muted-foreground", className)}>
    <ol className="flex min-w-0 flex-wrap items-center gap-1">
      {items.map((item, index) => <li key={`${item.href ?? "current"}-${index}`} className="flex min-w-0 items-center gap-1">
        {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-current/45" />}
        {item.href && index !== items.length - 1 ? <Link href={item.href} className="inline-flex min-h-8 min-w-0 items-center gap-1 rounded-sm px-0.5 hover:text-foreground">
          {index === 0 && <HouseDoor aria-hidden="true" className="size-3.5 shrink-0" />}<span className="break-words">{item.label}</span>
        </Link> : <span aria-current={index === items.length - 1 ? "page" : undefined} className="min-w-0 break-words px-0.5 text-foreground">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}
