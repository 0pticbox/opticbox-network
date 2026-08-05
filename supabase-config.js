export const SUPABASE_URL =
  'https://qnyhmrkqfseesfgagilc.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_3IYTPDKizbJyJac333Aw3A_o-ERt3vv';

export function isSupabaseConfigured() {
  return (
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
  );
}
