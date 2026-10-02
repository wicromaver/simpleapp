// Public client configuration. The Supabase publishable (anon) key is designed to ship
// inside apps; Row Level Security on the database is what protects each user's data.
// Never put a service-role/secret key here. Env vars override these defaults.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://ewvphmzsdbilpdbgrhwi.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_aQYKX36l_A9IkWRz2vErIQ_P8n8ioxW';
