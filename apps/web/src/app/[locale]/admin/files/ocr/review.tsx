"use client";

import { useEffect, useState, useTransition } from "react";
import { CONFIG_DEFAULTS } from "@formiq/database/config";
import type { ReviewMode, RunView } from "@/schemas/document-review";
import { getAnalysis } from "./actions";
import { DocumentComparison } from "./[uuid]/comparison";

export function DocumentReview({ file, version, name, mode }: { file: string; version: number; name: string; mode: ReviewMode }) {
  const [run, setRun] = useState<RunView | null>();
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let readFailures = 0;
    let pollSeconds = CONFIG_DEFAULTS.ocrPollSeconds;
    async function read() {
      try {
        const result = await getAnalysis(file, version, mode);
        if (!active) return;
        if (result.status !== "ok") {
          setError(true);
          return;
        }
        readFailures = 0;
        pollSeconds = result.pollSeconds;
        setRun(result.run);
        if (
          result.run &&
          (["ocr", "detect"].includes(result.run.stage) ||
            result.run.exports.some((e) => e.stage === "queued"))
        )
          timer = setTimeout(() => void read(), pollSeconds * 1000);
      } catch {
        if (!active) return;
        if (++readFailures <= 2) {
          timer = setTimeout(() => void read(), pollSeconds * 1000);
        } else {
          setError(true);
        }
      }
    }
    void read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [file, version, mode, refresh]);
  function act(action: () => Promise<{ status: string; activityId?: string }>, onSuccess?: () => void) {
    start(async () => {
      try {
        const result = await action();
        setError(result.status !== "ok");
        if (result.status === "ok") {
          onSuccess?.();
          if (result.activityId) window.dispatchEvent(new CustomEvent("document-activity", { detail: result.activityId }));
        }
      } catch { setError(true); }
      setRefresh(n => n + 1);
    });
  }
  return <DocumentComparison file={file} version={version} name={name} mode={mode} run={run}
    act={act} pending={pending} error={error} refresh={() => { setError(false); setRefresh(n => n + 1); }} />;
}
