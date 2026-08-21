import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Both values are compiled into the bundle at build time, so a deploy whose
 * environment variables were missing produces a build that succeeds and a site
 * that cannot reach anything. createClient() would throw here, at module load,
 * before React mounts — a blank white page with the reason only in the console.
 *
 * Say it on the page instead. This is a deployment mistake, and the person
 * looking at the blank tab is usually the person who can fix it.
 */
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_PUBLISHABLE_KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean);

  const message =
    `This build has no Supabase connection: ${missing.join(' and ')} ` +
    `${missing.length > 1 ? 'were' : 'was'} not set when it was built. ` +
    `Set them in the hosting project's environment variables and redeploy — ` +
    `changing them alone does nothing, the values are compiled in.`;

  document.body.innerHTML =
    `<div style="font:14px/1.6 system-ui,sans-serif;color:#e8e0d0;background:#0F1B2D;` +
    `min-height:100vh;padding:48px;margin:0"><div style="max-width:44rem">` +
    `<h1 style="font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#C99A2C">` +
    `Not configured</h1><p>${message}</p></div></div>`;

  throw new Error(message);
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
