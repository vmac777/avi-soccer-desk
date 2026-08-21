import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Authenticate *and* authorize the caller.
 *
 * Every function here used to stop at `getUser()` — "is this somebody?" — and
 * then proceed, in one case with a service-role client that bypasses RLS
 * entirely. Being signed in is not permission. An intern is a real user with a
 * real JWT, confined by the router to the news page, and the router is client
 * code: nothing stops them lifting the token out of devtools and calling these
 * endpoints directly. That would let them spend the agency's metered
 * TransferRoom and Transfermarkt quota and write rows no policy would have
 * allowed them to write.
 *
 * The role is read through the caller's own client, not the service-role one,
 * so RLS still applies: `profiles_select_own_or_admin` lets a user see their
 * own row and nothing else. A separate trigger stops them editing their role.
 *
 * Returns the caller's client and id on success, or the Response to return.
 */
export interface AdminCaller {
  userClient: SupabaseClient;
  userId: string;
}

const ADMIN_ROLES = ['admin', 'super_admin'];

export async function requireAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ ok: true; caller: AdminCaller } | { ok: false; response: Response }> {
  const deny = (reason: string, status: number) => ({
    ok: false as const,
    response: new Response(JSON.stringify({ ok: false, reason }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return deny('unauthorized', 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return deny('unauthorized', 401);

  const { data: profile, error } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // A missing profile is not an admin. Failing open here would defeat the
  // whole check, so an unreadable profile denies too.
  if (error) return deny('profile_unreadable', 403);
  if (!profile || !ADMIN_ROLES.includes((profile as { role: string }).role)) {
    return deny('forbidden', 403);
  }

  return { ok: true, caller: { userClient, userId: user.id } };
}
