import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  let payload: { username?: string; displayName?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const username = payload.username?.trim().toLowerCase();
  const displayName = payload.displayName?.trim();
  const password = payload.password;
  if (!username || !/^[a-z0-9_]{3,20}$/.test(username) ||
      !displayName || displayName.length < 2 || displayName.length > 80 ||
      !password || password.length < 8 || password.length > 128) {
    return json(400, {
      error: "Enter a valid username, display name, and password of at least 8 characters.",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Teacher account creation is missing its server-side Supabase configuration.");
    return json(503, { error: "Teacher account creation is not configured yet." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: existing, error: lookupError } = await admin
    .from("teacher_profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("Teacher username lookup failed:", lookupError.message);
    return json(500, { error: "Could not check username availability." });
  }
  if (existing) return json(409, { error: "That teacher username is already taken." });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `teacher-${username}@teachers.studysaathi.invalid`,
    password,
    email_confirm: true,
    app_metadata: { role: "teacher" },
    user_metadata: { username, display_name: displayName },
  });

  if (createError || !created.user) {
    const message = createError?.message || "";
    const conflict = /already registered|duplicate key|unique constraint/i.test(message);
    console.error("Teacher account creation failed:", message);
    return json(conflict ? 409 : 400, {
      error: conflict ? "That teacher username is already taken." : "Could not create the teacher account.",
    });
  }

  return json(200, { ok: true });
});
