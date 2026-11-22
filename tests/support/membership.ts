type Send<R> = (method: 'GET' | 'POST', url: string, payload?: object) => PromiseLike<R>;

/** Takes someone off a team as the Team screen does: read the row, then name its revision. */
export async function takeOffTeam<R extends { json(): any }>(send: Send<R>, organizationId: string, email: string, role: string): Promise<R> {
  const base = `/api/organizations/${organizationId}`;
  const { members, invitations } = (await send('GET', `${base}/members`)).json();
  const same = (row: { email: string; role: string }) => row.email === email && row.role === role;
  const member = members.find(same);
  const row = member ?? invitations.find(same);
  return send('POST', member ? `${base}/members/revoke` : `${base}/invitations/cancel`, { email, role, revision: row?.revision ?? 'none' });
}
