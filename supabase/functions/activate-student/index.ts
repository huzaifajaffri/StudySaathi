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

const hashCode = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  let payload: { studentId?: string; activationCode?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const studentId = payload.studentId?.trim().toLowerCase();
  const activationCode = payload.activationCode?.trim();
  const password = payload.password;
  if (!studentId || !/^[a-z0-9_]{3,20}$/.test(studentId) ||
      !activationCode || activationCode.length < 32 ||
      !password || password.length < 10 || password.length > 128) {
    return json(400, { error: "Enter a valid student ID, activation code, and password of at least 10 characters." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Student activation is missing its server-side Supabase configuration.");
    return json(503, { error: "Student activation is not configured yet." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: lookupError } = await admin
    .from("student_profiles")
    .select("id, activation_code_hash, activation_expires_at, auth_user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (lookupError) {
    console.error("Student invitation lookup failed:", lookupError.message);
    return json(500, { error: "Could not verify the student invitation." });
  }
  if (!profile || profile.auth_user_id || !profile.activation_code_hash ||
      !profile.activation_expires_at || new Date(profile.activation_expires_at) <= new Date()) {
    return json(400, { error: "This student invitation is invalid, expired, or already used. Ask your teacher for a new one." });
  }

  const codeHash = await hashCode(activationCode);
  if (codeHash !== profile.activation_code_hash) {
    return json(400, { error: "This student invitation is invalid, expired, or already used. Ask your teacher for a new one." });
  }

  const syntheticEmail = `student-${studentId}@students.studysaathi.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    app_metadata: { role: "student", student_profile_id: profile.id },
  });
  if (createError || !created.user) {
    console.error("Student auth account creation failed:", createError?.message);
    return json(400, { error: "Could not activate this student account. Ask your teacher for a new invitation." });
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_student_activation", {
    p_student_profile_id: profile.id,
    p_activation_code_hash: codeHash,
    p_auth_user_id: created.user.id,
  });
  if (claimError || claimed !== true) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) console.error("Could not remove an unclaimed student auth account:", deleteError.message);
    console.error("Student invitation claim failed:", claimError?.message);
    return json(409, { error: "This student invitation has already been used or expired. Ask your teacher for a new one." });
  }

  return json(200, { ok: true, studentId });
});
