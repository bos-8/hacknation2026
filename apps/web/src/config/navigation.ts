export type NavigationIcon = "ocr" | "home" | "about" | "team" | "chat" | "admin" | "colors" | "asides" | "components" | "user" | "files" | "products" | "tags" | "queue" | "settings" | "monitoring";
export type NavigationHref = "/admin/files/ocr" | "/" | "/about" | "/about/team" | "/chat" | "/chat/settings" | "/admin" | "/admin/users" | "/admin/files" | "/admin/products" | "/admin/tags" | "/admin/queue" | "/admin/settings" | "/admin/monitoring" | "/test" | `/test#${string}`;
export type NavigationLabel = "ocr" | "home" | "about" | "team" | "chat" | "llm" | "admin" | "overview" | "users" | "files" | "products" | "tags" | "queue" | "settings" | "monitoring" | "gallery" | "colors" | "asides" | "buttons" | "userPanel";
export type NavigationItem = { href: NavigationHref; label: NavigationLabel; icon: NavigationIcon; exact?: boolean };

const home: NavigationItem = { href: "/", label: "home", icon: "home", exact: true };
const admin: NavigationItem = { href: "/admin", label: "admin", icon: "admin" };
const ocr: NavigationItem = { href: "/admin/files/ocr", label: "ocr", icon: "ocr" };
const about: NavigationItem = { href: "/about", label: "about", icon: "about" };
const chat: NavigationItem = { href: "/chat", label: "chat", icon: "chat" };

/** Visibility is supplied by the server's role decision; destinations still enforce authorization. */
export function primaryNavigation(allowAdmin: boolean, signedIn: boolean): NavigationItem[] {
  return [home, about, ...(signedIn ? [chat] : []), ...(allowAdmin ? [ocr, admin] : [])];
}

export function normalizeNavigationPath(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}

export function navigationActive(pathname: string, item: NavigationItem): boolean {
  const path = normalizeNavigationPath(pathname);
  const target = normalizeNavigationPath(item.href);
  if (target === admin.href && (path === ocr.href || path.startsWith(ocr.href + "/"))) return false;
  return path === target || (!item.exact && target !== "/" && path.startsWith(`${target}/`));
}

export function secondaryNavigation(pathname: string, allowAdmin: boolean): { label: "adminNavigation" | "galleryNavigation" | "aboutNavigation" | "chatNavigation"; items: NavigationItem[] } | null {
  const path = normalizeNavigationPath(pathname);
  if (allowAdmin && navigationActive(path, chat)) return {
    label: "chatNavigation", items: [
      { ...chat, exact: true },
      { href: "/chat/settings", label: "llm", icon: "settings", exact: true },
    ],
  };
  if (navigationActive(path, about)) return {
    label: "aboutNavigation", items: [
      { ...about, exact: true },
      { href: "/about/team", label: "team", icon: "team", exact: true },
    ],
  };
  if (allowAdmin && navigationActive(path, admin)) return {
    label: "adminNavigation", items: [
      { href: "/admin", label: "overview", icon: "admin", exact: true },
      { href: "/admin/monitoring", label: "monitoring", icon: "monitoring", exact: true },
      { href: "/admin/users", label: "users", icon: "user", exact: true },
      { href: "/admin/files", label: "files", icon: "files" },
      { href: "/admin/products", label: "products", icon: "products" },
      { href: "/admin/tags", label: "tags", icon: "tags", exact: true },
      { href: "/admin/queue", label: "queue", icon: "queue", exact: true },
      { href: "/admin/settings", label: "settings", icon: "settings" },
    ],
  };
  if (path === "/test") return { label: "galleryNavigation", items: [
    { href: "/test#gallery-semantic-colors", label: "colors", icon: "colors" },
    { href: "/test#gallery-asides", label: "asides", icon: "asides" },
    { href: "/test#gallery-user-panel-v2", label: "userPanel", icon: "user" },
    { href: "/test#gallery-buttons", label: "buttons", icon: "components" },
  ] };
  return null;
}

export type BreadcrumbRoute = { label: "home" | "about" | "team" | "chat" | "admin" | "users" | "files" | "ocr" | "products" | "tags" | "queue" | "settings" | "monitoring" | "createProduct" | "file" | "gallery" | "accessDenied" | "llm"; href?: "/" | "/about" | "/chat" | "/admin" | "/test" | "/admin/products" | "/admin/files" | "/admin/files/ocr" };
export function pageBreadcrumbs(pathname: string): BreadcrumbRoute[] {
  const path = normalizeNavigationPath(pathname);
  if (/^\/admin\/files\/ocr\/[^/]+$/.test(path)) return [
    { label: "home", href: "/" }, { label: "ocr", href: "/admin/files/ocr" }, { label: "file" },
  ];
  if (path === "/admin/files/ocr") return [
    { label: "home", href: "/" }, { label: "admin", href: "/admin" }, { label: "files", href: "/admin/files" }, { label: "ocr" },
  ];
  if (path === "/chat") return [{ label: "home", href: "/" }, { label: "chat" }];
  if (path === "/chat/settings") return [{ label: "home", href: "/" }, { label: "chat", href: "/chat" }, { label: "llm" }];
  if (path === "/about") return [{ label: "home", href: "/" }, { label: "about" }];
  if (path === "/about/team") return [{ label: "home", href: "/" }, { label: "about", href: "/about" }, { label: "team" }];
  if (path === '/admin/monitoring') return [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin' }, { label: 'monitoring' }];
  if (path === "/admin/products/create") return [
    { label: "home", href: "/" }, { label: "admin", href: "/admin" }, { label: "products", href: "/admin/products" }, { label: "createProduct" },
  ];
  if (path === "/admin/users" || path === "/admin/files" || path === "/admin/products" || path === "/admin/tags" || path === "/admin/queue" || path === "/admin/settings") {
    return [{ label: "home", href: "/" }, { label: "admin", href: "/admin" }, { label: path === "/admin/users" ? "users" : path === "/admin/files" ? "files" : path === "/admin/tags" ? "tags" : path === "/admin/queue" ? "queue" : path === "/admin/settings" ? "settings" : "products" }];
  }
  const current = path === "/admin" ? "admin" : path === "/test" ? "gallery" : path === "/access-denied" ? "accessDenied" : null;
  return current ? [{ label: "home", href: "/" }, { label: current }] : [];
}

/** Hysteresis prevents the shrinking sticky header from repeatedly crossing its own scroll threshold. */
export function navbarAtTop(previous: boolean, scrollY: number): boolean {
  return scrollY <= 8 ? true : scrollY >= 72 ? false : previous;
}
