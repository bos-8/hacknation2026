"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowClockwise, Plus } from "react-bootstrap-icons";
import {
  Anchor, Badge, Blockquote, Button, Checkbox, Code, Datalist, Details, Dialog,
  FieldError, Fieldset, Form, Heading, IconButton, Input, Kbd, Label, Legend, ListItem,
  Meter, Option, OptionGroup, OrderedList, Output, Pre, Progress, Radio, Range,
  Select, Separator, Spinner, Summary, Switch, Table, TableBody, TableCaption,
  TableCell, TableFoot, TableHead, TableHeader, TableRow, Text, Textarea, Throbber,
  Tooltip, UnorderedList, VerticalDivider,
} from "@/ui/basic";
import { badgeTones, buttonSizes, buttonTones, surfaceTones } from "@/ui/basic/styles";
import { Popup } from "@/ui/components/popup";
import { Blur } from "@/ui/components/blur";
import { CornerBadge, type CornerBadgeProps } from "@/ui/components/corner-badge";
import { cornerBadgeStyles } from "@/ui/components/styles";
import { UserPanelV2 } from "@/ui/components/user-panel-v2";
import type { AppLocale } from "@/schemas/i18n";
import { NotificationDemo } from "./notification-demo";
import { AsideDemo } from "./aside-demo";

const section = "min-w-0 space-y-4 border-b border-border pb-6";

/** Interactive, local-only examples; submitting this gallery never calls an API. */
export function ComponentsGallery() {
  const t = useTranslations("test");
  const locale = useLocale() as AppLocale;
  const [tone, setTone] = useState<keyof typeof buttonTones>("main");
  const [size, setSize] = useState<keyof typeof buttonSizes>("md");
  const [disabled, setDisabled] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [level, setLevel] = useState(50);
  const [badgePlacement, setBadgePlacement] = useState<NonNullable<CornerBadgeProps["placement"]>>("top-right");
  const [badgeColor, setBadgeColor] = useState<NonNullable<CornerBadgeProps["color"]>>("red");
  const [badgeValue, setBadgeValue] = useState("7");
  const [popup, setPopup] = useState<"default" | "wide" | "locked" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-3">
      <Heading level={1}>{t("title")}</Heading>
      <Text>{t("description")}</Text>
      <Text className="text-sm text-muted-foreground">{t("editHint")}</Text>
      <div className="flex flex-wrap gap-2 text-xs">
        <Code>src/ui/basic/styles.ts</Code><Code>src/ui/components/styles.ts</Code>
      </div>
    </header>
    <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
      <section id="gallery-semantic-colors" className={section}>
        <Heading>{t("semanticColors.title")}</Heading>
        <Text>{t("semanticColors.description")}</Text>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(surfaceTones).map(([name, classes]) => <div key={name} data-color-surface={name}
            className={`space-y-2 rounded-md border border-current p-3 ${classes}`}>
            <p className="font-semibold">{name}</p><p className="text-xs">{t("semanticColors.sample")}</p>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-3">
          {Object.keys(surfaceTones).map(tone => <Button size="sm" key={tone} tone={tone as keyof typeof surfaceTones} data-color-button={tone}>{tone}</Button>)}
        </div>
      </section>
      <section id="gallery-asides" className={section}>
        <Heading>{t("asides.title")}</Heading>
        <AsideDemo />
      </section>
      <section id="gallery-user-panel-v2" className={section}>
        <Heading>UserPanel V2</Heading>
        <Text>{t("userPanelV2")}</Text>
        <div className="flex justify-end py-4">
          <UserPanelV2 locale={locale} displayName="Alex Example" firstName="Alex" lastName="Example"
            email="alex@example.invalid" expiresAt="2030-01-01T15:30:00Z" accountUrl="#gallery-user-panel-v2" preview />
        </div>
      </section>
      <section id="gallery-buttons" className={section}>
        <Heading>{t("sections.buttons")}</Heading>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="gallery-tone">{t("variant")}</Label>
            <Select id="gallery-tone" value={tone} onChange={event => setTone(event.target.value as keyof typeof buttonTones)}>
              {Object.keys(buttonTones).map(value => <Option key={value} value={value}>{value}</Option>)}
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="gallery-size">{t("size")}</Label>
            <Select id="gallery-size" value={size} onChange={event => setSize(event.target.value as keyof typeof buttonSizes)}>
              {Object.keys(buttonSizes).map(value => <Option key={value} value={value}>{value}</Option>)}
            </Select>
          </div>
          <Label className="inline-flex items-center gap-2"><Checkbox checked={disabled} onChange={event => setDisabled(event.target.checked)} />{t("disable")}</Label>
        </div>
        <div className="flex min-h-12 flex-wrap items-center gap-3">
          <Button data-component="Button" id="gallery-action" tone={tone} size={size} disabled={disabled}
            aria-label={t("action")} onClick={() => setClicks(value => value + 1)}>
            {size === "icon" ? <Plus aria-hidden="true" /> : t("action")}
          </Button>
          <VerticalDivider data-component="VerticalDivider" />
          <IconButton data-component="IconButton" label={t("reset")} onClick={() => setClicks(0)}><ArrowClockwise className="size-4" /></IconButton>
          <Output data-component="Output" aria-live="polite">{t("clicks", { count: clicks })}</Output>
        </div>
        <Separator data-component="Separator" />
        <div className="flex flex-wrap gap-2">
          {Object.keys(badgeTones).map(value => <Badge data-component="Badge" key={value} tone={value as keyof typeof badgeTones}>{value}</Badge>)}
        </div>
      </section>

      <section id="gallery-corner-badges" className={section}>
        <Heading>{t("cornerBadges.title")}</Heading>
        <Text>{t("cornerBadges.description")}</Text>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1"><Label htmlFor="gallery-badge-placement">{t("cornerBadges.placement")}</Label>
            <Select id="gallery-badge-placement" value={badgePlacement} onChange={event => setBadgePlacement(event.target.value as typeof badgePlacement)}>
              {Object.keys(cornerBadgeStyles.placements).map(value => <Option key={value} value={value}>{t(`cornerBadges.placements.${value}`)}</Option>)}
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="gallery-badge-color">{t("cornerBadges.color")}</Label>
            <Select id="gallery-badge-color" value={badgeColor} onChange={event => setBadgeColor(event.target.value as typeof badgeColor)}>
              {Object.keys(cornerBadgeStyles.colors).map(value => <Option key={value} value={value}>{t(`cornerBadges.colors.${value}`)}</Option>)}
            </Select>
          </div>
          <div className="min-w-0 space-y-1"><Label htmlFor="gallery-badge-value">{t("cornerBadges.value")}</Label>
            <Input id="gallery-badge-value" value={badgeValue} maxLength={12} onChange={event => setBadgeValue(event.target.value)} placeholder={t("cornerBadges.empty")} />
          </div>
        </div>
        <div className="p-4">
          <CornerBadge data-corner-badge="interactive" placement={badgePlacement} color={badgeColor} value={badgeValue}
            aria-label={badgeValue || t("cornerBadges.dot")}>
            <Button size="sm" onClick={() => setClicks(value => value + 1)}>{t("action")}</Button>
          </CornerBadge>
        </div>
        {Object.keys(cornerBadgeStyles.placements).map(placement => <div key={placement} className="space-y-2">
          <Heading level={3} className="text-sm">{t(`cornerBadges.placements.${placement}`)}</Heading>
          <div className="grid grid-cols-2 gap-6 px-4 py-3 sm:grid-cols-4">
            {[undefined, 0, "99+", t("cornerBadges.new")].map((value, index) => <CornerBadge key={index}
              data-corner-badge={placement} placement={placement as typeof badgePlacement}
              color={(["green", "blue", "red", "amber"] as const)[index]} value={value}
              aria-label={value === undefined ? t("cornerBadges.dot") : String(value)} wrapperClassName="w-full">
              <Button size="sm" className="w-full" onClick={() => setClicks(count => count + 1)}>{t("cornerBadges.button")}</Button>
            </CornerBadge>)}
          </div>
        </div>)}
      </section>

      <section className={section}>
        <Heading>{t("sections.forms")}</Heading>
        <Form data-component="Form" onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
          <Fieldset data-component="Fieldset">
            <Legend data-component="Legend">{t("formLegend")}</Legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label data-component="Label" htmlFor="gallery-name">{t("name")}</Label>
                <Input data-component="Input" id="gallery-name" name="name" placeholder={t("namePlaceholder")} required />
              </div>
              <div className="space-y-1"><Label htmlFor="gallery-email">{t("email")}</Label>
                <Input id="gallery-email" name="email" type="email" placeholder="name@example.invalid" />
              </div>
            </div>
            <Label htmlFor="gallery-notes">{t("notes")}</Label>
            <Textarea data-component="Textarea" id="gallery-notes" name="notes" placeholder={t("notesPlaceholder")} />
            <Label htmlFor="gallery-invalid">{t("invalid")}</Label>
            <Input id="gallery-invalid" aria-invalid="true" aria-describedby="gallery-error" />
            <FieldError data-component="FieldError" id="gallery-error">{t("error")}</FieldError>
          </Fieldset>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit">{t("submit")}</Button><Output aria-live="polite">{submitted ? t("submitted") : t("formReady")}</Output></div>
        </Form>
      </section>

      <section className={section}>
        <Heading>{t("sections.selection")}</Heading>
        <Label className="flex items-center gap-2"><Checkbox data-component="Checkbox" defaultChecked />{t("notificationsLabel")}</Label>
        <Fieldset><Legend>{t("contact")}</Legend>
          <Label className="flex items-center gap-2"><Radio data-component="Radio" name="gallery-contact" value="email" defaultChecked />{t("email")}</Label>
          <Label className="flex items-center gap-2"><Radio name="gallery-contact" value="phone" />{t("phone")}</Label>
        </Fieldset>
        <Label className="flex items-center gap-2"><Switch data-component="Switch" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t("enabled")}</Label>
        <div className="space-y-1"><Label htmlFor="gallery-level">{t("level")}: {level}%</Label>
          <Range data-component="Range" id="gallery-level" min={0} max={100} value={level} onChange={event => setLevel(Number(event.target.value))} />
        </div>
        <div className="space-y-1"><Label htmlFor="gallery-select">{t("choices")}</Label>
          <Select data-component="Select" id="gallery-select" defaultValue="alpha">
            <OptionGroup data-component="OptionGroup" label={t("choices")}>
              <Option data-component="Option" value="alpha">{t("choiceA")}</Option><Option value="beta">{t("choiceB")}</Option>
            </OptionGroup>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="gallery-suggestion">{t("suggestions")}</Label>
          <Input id="gallery-suggestion" list="gallery-suggestions" />
          <Datalist data-component="Datalist" id="gallery-suggestions"><Option value={t("choiceA")} /><Option value={t("choiceB")} /></Datalist>
        </div>
      </section>

      <section className={section}>
        <Heading>{t("sections.feedback")}</Heading>
        <div className="flex flex-wrap items-center gap-4"><Spinner data-component="Spinner" label={t("loading")} />
          {(["sm", "md", "lg"] as const).map(value => <Throbber data-component="Throbber" key={value} size={value} label={`${t("loading")} (${value})`} />)}
        </div>
        <Label htmlFor="gallery-progress">{t("progress")}: {level}%</Label>
        <Progress data-component="Progress" id="gallery-progress" value={level} max={100} aria-label={t("progress")} />
        <Label htmlFor="gallery-meter">{t("meter")}: {level}%</Label>
        <Meter data-component="Meter" id="gallery-meter" value={level} min={0} max={100} low={30} high={80} optimum={70} aria-label={t("meter")} />
        <div data-component="Tooltip" className="flex flex-wrap gap-3">
          {(["top", "right", "bottom", "left"] as const).map(value => <Tooltip key={value} content={t("tooltip")} placement={value}><Button>{value}</Button></Tooltip>)}
        </div>
      </section>

      <section className={section}>
        <Heading>{t("sections.typography")}</Heading>
        <Heading data-component="Heading" level={3}>{t("heading")}</Heading>
        <Text data-component="Text">{t("text")}</Text>
        <Anchor data-component="Anchor" href="#gallery-buttons">{t("link")}</Anchor>
        <Blockquote data-component="Blockquote">{t("quote")}</Blockquote>
        <div className="flex flex-wrap items-center gap-2"><Code data-component="Code">const ready = true;</Code><Kbd data-component="Kbd">Ctrl</Kbd><span>+</span><Kbd>K</Kbd></div>
        <Pre data-component="Pre"><Code>{"import { Button } from '@/ui/basic';\n\n<Button>Example</Button>"}</Code></Pre>
      </section>

      <section className={section}>
        <Heading>{t("sections.lists")}</Heading>
        <UnorderedList data-component="UnorderedList"><ListItem data-component="ListItem">{t("listFirst")}</ListItem><ListItem>{t("listSecond")}</ListItem></UnorderedList>
        <OrderedList data-component="OrderedList"><ListItem>{t("listFirst")}</ListItem><ListItem>{t("listSecond")}</ListItem></OrderedList>
        <Details data-component="Details"><Summary data-component="Summary">{t("detailsTitle")}</Summary><Text className="mt-3">{t("detailsBody")}</Text></Details>
      </section>

      <section className={section}>
        <Heading>{t("sections.table")}</Heading>
        <div className="overflow-x-auto"><Table data-component="Table">
          <TableCaption data-component="TableCaption">{t("tableCaption")}</TableCaption>
          <TableHead data-component="TableHead"><TableRow data-component="TableRow"><TableHeader data-component="TableHeader" scope="col">{t("component")}</TableHeader><TableHeader scope="col">{t("state")}</TableHeader></TableRow></TableHead>
          <TableBody data-component="TableBody">
            <TableRow><TableHeader scope="row">Button</TableHeader><TableCell data-component="TableCell">{t("formReady")}</TableCell></TableRow>
            <TableRow><TableHeader scope="row">Throbber</TableHeader><TableCell>{t("loading")}</TableCell></TableRow>
          </TableBody>
          <TableFoot data-component="TableFoot"><TableRow><TableCell colSpan={2}>{t("rows", { count: 2 })}</TableCell></TableRow></TableFoot>
        </Table></div>
      </section>

      <section className={section}>
        <Heading>{t("sections.overlays")}</Heading>
        <Heading level={3} className="text-base">{t("notifications.title")}</Heading>
        <Text className="text-sm text-muted-foreground">{t("notifications.description")}</Text>
        <NotificationDemo />
        <div className="relative isolate overflow-hidden rounded-md border border-border p-6">
          <Text aria-hidden="true">{t("text")}</Text>
          <Blur />
          <Text className="relative z-10 mt-2 text-center font-semibold text-white">Blur</Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button id="gallery-dialog-open" onClick={() => dialog.current?.showModal()}>{t("openDialog")}</Button>
          <Button id="gallery-popup-open" onClick={() => setPopup("default")}>{t("openPopup")}</Button>
          <Button id="gallery-popup-wide" onClick={() => setPopup("wide")}>{t("widePopup")}</Button>
          <Button id="gallery-popup-locked" onClick={() => setPopup("locked")}>{t("lockedPopup")}</Button>
        </div>
        <Dialog data-component="Dialog" ref={dialog} aria-labelledby="gallery-dialog-title" className="space-y-4">
          <Heading id="gallery-dialog-title">Dialog</Heading><Text>{t("dialogBody")}</Text>
          <Form method="dialog"><Button type="submit" autoFocus>{t("close")}</Button></Form>
        </Dialog>
        {popup && <Popup title="Popup" size={popup === "wide" ? "wide" : "default"} disableClose={popup === "locked"}
          onClose={() => setPopup(null)} content={<div className="space-y-3"><p>{t("popupBody")}</p>{popup === "wide" && Array.from({ length: 30 }, (_, index) => <p key={index}>{t("text")}</p>)}</div>}
          actions={<>{popup === "locked" && <Button id="gallery-popup-unlock" onClick={() => setPopup("default")}>{t("unlock")}</Button>}<Button disabled={popup === "locked"} onClick={() => setPopup(null)}>{t("close")}</Button></>} />}
      </section>
    </div>
  </div>;
}
