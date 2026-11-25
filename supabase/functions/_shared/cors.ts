const ALLOWED_ORIGIN = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') || 'https://vahamarket.vercel.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};
