import "server-only";
import plCommon from "../../messages/pl/common.json" with { type: "json" };
import plForms from "../../messages/pl/forms.json" with { type: "json" };
import plHome from "../../messages/pl/home.json" with { type: "json" };
import plChat from "../../messages/pl/chat.json" with { type: "json" };
import plAbout from "../../messages/pl/about.json" with { type: "json" };
import enCommon from "../../messages/en/common.json" with { type: "json" };
import enForms from "../../messages/en/forms.json" with { type: "json" };
import enHome from "../../messages/en/home.json" with { type: "json" };
import enChat from "../../messages/en/chat.json" with { type: "json" };
import enAbout from "../../messages/en/about.json" with { type: "json" };
import plTest from "../../messages/pl/test.json" with { type: "json" };
import enTest from "../../messages/en/test.json" with { type: "json" };
import { APP_LOCALES } from "../schemas/i18n.ts";
import { validateMessages } from "./message-schema.ts";

// Static imports make catalogs part of the module graph, including development HMR.
export const messages = validateMessages({
  pl: { "forms.json": plForms, "common.json": plCommon, "home.json": plHome, "about.json": plAbout, "chat.json": plChat, "test.json": plTest },
  en: { "forms.json": enForms, "common.json": enCommon, "home.json": enHome, "about.json": enAbout, "chat.json": enChat, "test.json": enTest },
}, APP_LOCALES);
