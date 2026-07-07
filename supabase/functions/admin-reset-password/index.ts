// @ts-ignore: Deno URL imports are valid for Edge Functions but cause errors in Node/React Native IDEs
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'
import { corsHeaders } from '../_shared/cors.ts'

interface ResetPasswordPayload {
  target_user_id: string
  new_password?: string // If not provided, we generate one and return it? Wait, let's require it to be passed
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server misconfiguration')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const supabaseUserClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data: { user: caller }, error: callerErr } = await supabaseUserClient.auth.getUser()
    if (callerErr || !caller) throw new Error('Unauthorized')

    // Fetch caller's profile to check role
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('role, business_id')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) throw new Error('Caller profile not found')

    const { target_user_id, new_password } = await req.json() as ResetPasswordPayload
    if (!target_user_id || !new_password) {
      throw new Error('target_user_id and new_password are required')
    }

    // Role verification
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'owner') {
      throw new Error('Forbidden: Only admins and owners can reset passwords')
    }

    // If owner, verify the target user belongs to their business
    if (callerProfile.role === 'owner') {
      if (!callerProfile.business_id) {
        throw new Error('Forbidden: Owner has no business assigned')
      }

      const { data: staffRow, error: staffErr } = await supabaseAdmin
        .from('staff')
        .select('*')
        .eq('user_id', target_user_id)
        .eq('business_id', callerProfile.business_id)
        .single()

      if (staffErr || !staffRow) {
        throw new Error('Forbidden: Target user is not staff of your business')
      }
    }

    // If admin, they can reset anyone's password.
    // Proceed to update password.
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    })

    if (updateErr) throw new Error(`Failed to update password: ${updateErr.message}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Password updated successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
