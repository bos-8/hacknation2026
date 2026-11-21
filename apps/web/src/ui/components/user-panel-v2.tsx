"use client";

import { UserPanel, type UserPanelProps } from "./user-panel";

/** Shared account actions with an expanding identity header and blurred backdrop. */
export function UserPanelV2(props: UserPanelProps) {
  return <UserPanel {...props} variant="v2" />;
}
