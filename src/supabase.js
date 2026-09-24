import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://feebfiadnosxhyustixl.supabase.co'
const fallbackKey = 'sb_publishable_E8EwJc1YzWCIXarZpJCMuw__cvgUQTA'

const url = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackKey

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
