"use client";
import { useLocale, useTranslations } from "next-intl";
import { FileEarmarkRichtext } from "react-bootstrap-icons";
import { Tooltip } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";
export function OcrLink({ uuid, version }: { uuid: string; version: number }) {
  const locale = useLocale();
  const t = useTranslations("common.documentCompare");
  const style = cx(basicStyles.button, buttonTones["main-outline"], "size-7 shrink-0 p-0");
  return (
    <Tooltip content={t("open")} placement="bottom">
      <a data-navigate className={style} aria-label={t("open")} href={`/${locale}/admin/files/ocr/${uuid}?version=${version}`}>
        <FileEarmarkRichtext className="size-3.5" aria-hidden="true" />
      </a>
    </Tooltip>
  );
}
