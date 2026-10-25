(() => {
  const config = {
    url: "https://vwvunnqjzckieizwvjsm.supabase.co",
    publishableKey: "sb_publishable_focAf_S2UbFenWpmTunqGg_oLABY5od",
  };
  const clientFactory = window.supabase?.createClient;
  if (!clientFactory) {
    console.error("StudySaathi could not load the Supabase browser client.");
    window.studySaathiCloudError = "The shared database client could not be loaded. Reload the page and try again.";
    return;
  }

  const client = clientFactory(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
    },
  });
  const encodeHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const hash = async value => encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const normalizedStudentId = value => value.trim().toLowerCase();
  const studentEmail = value => `student-${normalizedStudentId(value)}@students.studysaathi.invalid`;
  const teacherEmail = value => `teacher-${value.trim().toLowerCase()}@teachers.studysaathi.invalid`;
  const makeActivationCode = () => encodeHex(crypto.getRandomValues(new Uint8Array(32)));

  window.studySaathiCloud = {
    client,
    hash,
    makeActivationCode,
    studentEmail,
    normalizedStudentId,
    async signInTeacher(username, password) {
      const normalizedUsername = username.trim().toLowerCase();
      return client.auth.signInWithPassword({ email: teacherEmail(normalizedUsername), password });
    },
    async signUpTeacher(username, password, displayName) {
      const { data: created, error: createError } = await client.functions.invoke("create-teacher", {
        body: {
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim(),
        },
      });
      if (createError) return { data: null, error: createError };
      if (!created?.ok) return { data: null, error: new Error(created?.error || "Could not create the teacher account.") };
      return client.auth.signInWithPassword({
        email: teacherEmail(username),
        password,
      });
    },
    async signInStudent(studentId, password) {
      return client.auth.signInWithPassword({ email: studentEmail(studentId), password });
    },
    async activateStudent(studentId, activationCode, password) {
      return client.functions.invoke("activate-student", {
        body: {
          studentId: normalizedStudentId(studentId),
          activationCode: activationCode.trim(),
          password,
        },
      });
    },
    async loadTeacher(userId) {
      const [profileResult, workspaceResult, studentsResult] = await Promise.all([
        client.from("teacher_profiles").select("user_id,display_name").eq("user_id", userId).single(),
        client.from("teacher_workspaces").select("workspace_data").eq("teacher_id", userId).maybeSingle(),
        client.from("student_profiles").select("student_id,display_name,student_data").eq("teacher_id", userId).order("student_id"),
      ]);
      const error = profileResult.error || workspaceResult.error || studentsResult.error;
      if (error) throw error;
      return {
        profile: profileResult.data,
        workspace: workspaceResult.data?.workspace_data || { q: [], m: [], a: [] },
        students: studentsResult.data || [],
      };
    },
    async loadStudent(userId) {
      const { data: profile, error: profileError } = await client
        .from("student_profiles")
        .select("student_id,display_name,teacher_id,student_data")
        .eq("auth_user_id", userId)
        .single();
      if (profileError) throw profileError;
      const { data: workspace, error: workspaceError } = await client.rpc("get_student_workspace");
      if (workspaceError) throw workspaceError;
      return { profile, workspace };
    },
    async createStudentInvite(studentId, displayName, activationCode, expiresAt) {
      const { data, error } = await client.rpc("create_student_invite", {
        p_student_id: normalizedStudentId(studentId),
        p_display_name: displayName.trim(),
        p_activation_code_hash: await hash(activationCode),
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data;
    },
    async saveWorkspace(teacherId, workspaceData) {
      const { error } = await client.from("teacher_workspaces").upsert({
        teacher_id: teacherId,
        workspace_data: workspaceData,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async saveStudentData(studentId, studentData, role) {
      if (role === "teacher") {
        const { data, error } = await client.rpc("teacher_update_student_data", {
          p_student_id: normalizedStudentId(studentId),
          p_student_data: studentData,
        });
        if (error) throw error;
        if (!data) throw new Error("This student is not assigned to your account.");
        return;
      }
      const { data: userResult, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const { error } = await client.from("student_profiles")
        .update({ student_data: studentData })
        .eq("auth_user_id", userResult.user.id);
      if (error) throw error;
    },
  };
})();
