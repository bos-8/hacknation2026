import "server-only";

type SessionSource = {
  session: { id: string; expiresAt: Date };
  user: { id: string; name: string };
};

/** Public DTO uses uuid naming and never exposes Better Auth's tokens or provider accounts. */
export function sessionView(value: SessionSource | null) {
  return value ? {
    user: { uuid: value.user.id, name: value.user.name },
    session: { uuid: value.session.id, expiresAt: value.session.expiresAt },
  } : null;
}
