import manifest from "../../../../package.json" with { type: "json" };

const version = /^(\d+\.\d+\.\d+)(?:[+-]|$)/.exec(manifest.version);
if (!version) throw new Error("Root package version must use major.minor.patch format");
export const APP_VERSION = version[1];
const releaseDate = /\+(\d{8})(?:\d{6})?$/.exec(manifest.version)?.[1];
const buildDate = releaseDate ?? process.env.APP_BUILD_DATE;
export const APP_DISPLAY_VERSION = buildDate ? `${APP_VERSION}+${buildDate}` : APP_VERSION;
