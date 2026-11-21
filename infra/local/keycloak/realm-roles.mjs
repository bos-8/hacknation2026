/** Reconcile only application-owned roles; retain role UUIDs and their assignments. */
export async function synchronizeRealmRoles(api, route, roles) {
  const roleRoute = name => `${route}/roles/${encodeURIComponent(name)}`;
  const legacy = await api('GET', roleRoute('ADMINISTRATOR'), undefined, true);
  if (legacy) {
    const admin = await api('GET', roleRoute('ADMIN'), undefined, true);
    if (admin) throw new Error('Both ADMINISTRATOR and ADMIN exist; resolve duplicate role assignments before synchronization');
    // Rename in place: users, groups and parent composites still reference the same role UUID.
    await api('PUT', roleRoute('ADMINISTRATOR'), { ...legacy, name: 'ADMIN' });
  }
  for (const role of roles) {
    const current = await api('GET', roleRoute(role.name), undefined, true);
    const values = { name: role.name, description: role.description, attributes: role.attributes ?? {} };
    if (current) await api('PUT', roleRoute(role.name), values);
    else await api('POST', `${route}/roles`, values);
  }
  for (const role of roles) {
    const desired = await Promise.all((role.composites?.realm ?? []).map(name => api('GET', roleRoute(name))));
    const current = await api('GET', `${roleRoute(role.name)}/composites`);
    const wanted = new Set(desired.map(child => child.id));
    const stale = current.filter(child => !wanted.has(child.id));
    // Remove old links too: independent roles must never retain accidental inheritance.
    if (stale.length) await api('DELETE', `${roleRoute(role.name)}/composites`, stale);
    const assigned = new Set(current.map(child => child.id));
    const missing = desired.filter(child => !assigned.has(child.id));
    if (missing.length) await api('POST', `${roleRoute(role.name)}/composites`, missing);
  }
}
