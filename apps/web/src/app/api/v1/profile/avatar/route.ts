import { getAvatarService } from "@/server/avatars";
import { getSession } from "@/server/auth/session";

export async function POST(request: Request) {
  return getAvatarService().upload(request, async () => {
    const session = await getSession();
    return session ? { keycloakUuid: session.user.keycloakUuid } : null;
  });
}
export async function OPTIONS(request: Request) {
  return getAvatarService().upload(request, async () => null);
}
