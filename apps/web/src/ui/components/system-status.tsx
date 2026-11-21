"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_ROUTES } from "@/config/api-routes";
import { Tooltip, type TooltipPlacement } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { selectorStyles } from "./styles";

type WebStatus = "checking" | "available" | "unavailable";

export function SystemStatus({ className, tooltipPlacement = "top" }: {
  className?: string;
  tooltipPlacement?: TooltipPlacement;
}) {
  const [status, setStatus] = useState<WebStatus>("checking");
  const t = useTranslations("common.footer.status");

  useEffect(() => {
    let disposed = false;
    let active: AbortController | undefined;

    async function check() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      if (!navigator.onLine) {
        setStatus("unavailable");
        return;
      }
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(API_ROUTES.health.ready, { cache: "no-store", signal: controller.signal });
        const data: unknown = response.ok ? await response.json() : null;
        const healthy = data !== null && typeof data === "object" && "status" in data && "service" in data
          && data.status === "ok" && data.service === "web" && "check" in data && data.check === "readiness";
        if (!disposed && active === controller) setStatus(healthy ? "available" : "unavailable");
      } catch {
        if (!disposed && active === controller) setStatus("unavailable");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void check();
    const timer = window.setInterval(() => { void check(); }, 30000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      disposed = true;
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  const label = t(status);
  return <Tooltip content={label} placement={tooltipPlacement}>
    <span className={cx(selectorStyles.status, className)} role="status" data-status={status}>
      <span aria-hidden="true" className={cx(selectorStyles.statusDot, selectorStyles.statusColors[status])} />
      <span className="sr-only">{label}</span>
    </span>
  </Tooltip>;
}
