"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CONFIG_DEFAULTS } from "@formiq/database/config";
import { API_ROUTES } from "@/config/api-routes";
import { StageProgress } from "./stage-progress";
import { useNotifications } from "@/ui/components/notification-provider";
import { getDocumentActivity } from "./actions";

/** Lives beside the authenticated bell so leaving the editor does not stop tracking. */
export function DocumentActivity({ ownerUuid }: { ownerUuid: string }) {
  const { owner, pushNotification, removeNotification } = useNotifications();
  const t = useTranslations("common.documentReview");
  useEffect(() => {
    if (owner !== ownerUuid) return;
    const pending = new Map<string, string>();
    const requested = new Set<string>();
    let active = true;
    let reading = false;
    let pollSeconds = CONFIG_DEFAULTS.ocrPollSeconds;
    let timer: ReturnType<typeof setTimeout>;

    async function read() {
      if (reading || !active) return;
      clearTimeout(timer);
      reading = true;
      const ids = new Set([...pending.keys(), ...requested]);
      requested.clear();
      let retry = false;
      try {
        const result = await getDocumentActivity([...ids]);
        if (!active) return;
        if (result.status !== "ok") {
          for (const id of ids) removeNotification("document-" + id);
          pending.clear();
          return;
        }
        pollSeconds = result.pollSeconds;
        for (const job of result.jobs) {
          ids.delete(job.uuid);
          const snapshot = [job.stage, job.percent, job.queuedAt.getTime(), job.startedAt?.getTime(), job.sampledAt?.getTime()].join("/");
          if (pending.get(job.uuid) === snapshot) continue;
          const working = ["ocr", "detect", "queued"].includes(job.stage);
          const failed = job.stage.endsWith("failed") || job.stage === "obsolete";
          const stage = job.variant ? t("exportStatus", { variant: t(job.variant), state: t(job.stage) }) : t(job.stage);
          if (working) pending.set(job.uuid, snapshot);
          else pending.delete(job.uuid);
          pushNotification({
            id: "document-" + job.uuid,
            mode: working ? "info" : failed ? "error" : "success",
            title: t("activityTitle", { file: job.name, version: job.version }),
            message: working ? <StageProgress label={stage} percent={job.percent} timing={job} /> : <span>{stage}
              {job.variant && job.stage === "ready" && <a download className="ml-2 font-medium text-primary underline" href={API_ROUTES.fileDownload.replace("{uuid}", job.uuid) + "?version=1"}>{t("download")}</a>}
            </span>,
            pending: working,
            dismissible: !working,
            persistent: working || failed,
            autoCloseMs: 8000,
          });
        }
        for (const id of ids) {
          pending.delete(id);
          removeNotification("document-" + id);
        }
      } catch {
        for (const id of ids) requested.add(id);
        retry = true;
      } finally {
        reading = false;
        if (active && (pending.size || requested.size || retry))
          timer = setTimeout(read, requested.size && !retry ? 0 : pollSeconds * 1000);
      }
    }
    function wake(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === "string") requested.add(event.detail);
      void read();
    }
    void read();
    window.addEventListener("document-activity", wake);
    window.addEventListener("focus", wake);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("document-activity", wake);
      window.removeEventListener("focus", wake);
      for (const id of pending.keys()) removeNotification("document-" + id);
    };
  }, [owner, ownerUuid, pushNotification, removeNotification, t]);
  return null;
}
