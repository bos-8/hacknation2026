"use client";

import { List } from "react-bootstrap-icons";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { primaryNavigation, secondaryNavigation } from "@/config/navigation";
import { NavigationGroup } from "./navigation-group";
import { NavbarPopover } from "./navbar-popover";
import { layoutStyles } from "./styles";

export function PrimaryNavigation({ allowAdmin = false, signedIn = false }: { allowAdmin?: boolean; signedIn?: boolean }) {
  const t = useTranslations("common.navigation");
  const pathname = usePathname();
  const items = primaryNavigation(allowAdmin, signedIn);
  return <>
    <div className="hidden min-w-0 @min-[768px]/navbar:block"><NavigationGroup items={items} pathname={pathname} label={t("primary")} /></div>
    <NavbarPopover label={t("menu")} icon={<List aria-hidden="true" className="size-5" />} className="@min-[768px]/navbar:hidden" align="left">
      <NavigationGroup items={items} pathname={pathname} label={t("primary")} variant="mobile" />
    </NavbarPopover>
  </>;
}

export function SecondaryNavigation({ allowAdmin = false }: { allowAdmin?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("common.navigation");
  const section = secondaryNavigation(pathname, allowAdmin);
  return <div data-navbar-secondary data-open={Boolean(section)} aria-hidden={!section} inert={!section} className={layoutStyles.subnav}>
    {section && <NavigationGroup items={section.items} pathname={pathname} label={t(section.label)} variant="secondary" />}
  </div>;
}

