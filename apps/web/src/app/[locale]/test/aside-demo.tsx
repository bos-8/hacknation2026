"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Label } from "@/ui/basic";
import { OverlayAside, PushAside } from "@/ui/components/aside";

export function AsideDemo() {
  const t = useTranslations("test.asides");
  const [overlay, setOverlay] = useState(false);
  const [push, setPush] = useState(false);
  const overlayTrigger = useRef<HTMLButtonElement>(null);
  const pushTrigger = useRef<HTMLButtonElement>(null);
  const contents = (prefix: string) => <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("resizeHint")}</p>
    <Label htmlFor={`${prefix}-notes`}>{t("notes")}</Label><Input id={`${prefix}-notes`} placeholder={t("placeholder")} />
    {Array.from({ length: 8 }, (_, index) => <p key={index} className="text-sm">{t("sample", { number: index + 1 })}</p>)}
  </div>;
  return <div data-aside-demo className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <div className="flex flex-wrap gap-2">
      <Button ref={overlayTrigger} data-open-overlay onClick={() => setOverlay(value => !value)} aria-expanded={overlay}>{t("overlay")}</Button>
      <Button ref={pushTrigger} data-open-push onClick={() => setPush(value => !value)} aria-expanded={push}>{t("push")}</Button>
    </div>
    <OverlayAside open={overlay} onClose={() => setOverlay(false)} triggerRef={overlayTrigger} title={t("overlay")} data-demo-overlay>{contents("overlay")}</OverlayAside>
    <PushAside open={push} onClose={() => setPush(false)} triggerRef={pushTrigger} title={t("push")} data-demo-push>{contents("push")}</PushAside>
  </div>;
}
