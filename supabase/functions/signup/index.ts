// Creates an email + password account that's ready to use straight away (no confirmation email),
// so sign-up doesn't depend on Supabase's rate-limited mailer. The browser signs in right after.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { email, password } = await req.json()
    const address = String(email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return json({ error: 'Enter a valid email address' }, 400)
    if (typeof password !== 'string' || password.length < 8) return json({ error: 'Passwords need at least 8 characters' }, 400)
    if (password.length > 72) return json({ error: 'Passwords can be at most 72 characters' }, 400)

    const { error } = await admin.auth.admin.createUser({ email: address, password, email_confirm: true })
    if (error) {
      const taken = /already|registered|exists/i.test(error.message)
      return json({ error: taken ? 'An account with that email already exists. Sign in instead.' : 'Couldn’t create the account. Please try again.' }, taken ? 409 : 400)
    }
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'Couldn’t create the account. Please try again.' }, 500)
  }
})
