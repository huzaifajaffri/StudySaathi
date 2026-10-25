(() => {
  const cloud = window.studySaathiCloud;
  if (!cloud) return;

  let authenticatedRole = null;
  let syncingStorage = false;
  let workspaceSaveQueue = Promise.resolve();
  const saveTimers = new Map();
  const originalSetItem = Storage.prototype.setItem;
  const app = () => document.querySelector("#app");
  const session = () => {
    try { return JSON.parse(sessionStorage.getItem("sses") || "null"); }
    catch { return null; }
  };
  const displayError = message => {
    let notice = document.querySelector("#cloud-error");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "cloud-error";
      notice.className = "db-error";
      notice.setAttribute("role", "alert");
      document.body.appendChild(notice);
    }
    notice.textContent = message;
  };
  const clearError = () => document.querySelector("#cloud-error")?.remove();
  const updateDatabaseStatus = shared => {
    const badge = document.querySelector(".db-status");
    if (!badge) return;
    badge.title = shared
      ? "Your profile and assigned study data are loaded from the shared database."
      : "A local copy of your study data is kept on this device.";
    badge.lastChild.textContent = shared ? "Shared database" : "Local cache";
  };
  const reportError = error => {
    console.error("StudySaathi shared database operation failed:", error);
    displayError(error?.message || "Could not save to the shared database. Please retry.");
  };
  const json = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  };
  const showMessage = (message, isError = false) => {
    const target = app();
    if (!target) return;
    let notice = target.querySelector("#cloud-form-message");
    if (!notice) {
      notice = document.createElement("p");
      notice.id = "cloud-form-message";
      notice.setAttribute("role", isError ? "alert" : "status");
      target.querySelector(".c")?.appendChild(notice);
    }
    notice.className = isError ? "er" : "ok";
    notice.textContent = message;
  };
  const showLegacyImportPrompt = (teacherName, userId, message) => {
    const target = app();
    if (!target) return;
    target.querySelector("#cloud-legacy-import")?.remove();
    const card = document.createElement("section");
    card.id = "cloud-legacy-import";
    card.className = "c";
    card.innerHTML = "<h2>Import saved records from this device</h2><p></p><div class=\"row\"><label>Old device password<br><input type=\"password\" autocomplete=\"current-password\"></label><button class=\"p\" type=\"button\">Import records</button></div><p class=\"m\" role=\"status\"></p>";
    card.querySelector("p").textContent = message;
    card.querySelector("button").addEventListener("click", async event => {
      const button = event.currentTarget;
      const password = card.querySelector("input").value;
      const status = card.querySelector("[role=\"status\"]");
      button.disabled = true;
      status.textContent = "";
      try {
        const codes = await migrateLegacyTeacherData(teacherName, password);
        if (codes === null) {
          status.textContent = "That password did not match the old account. You are still signed in; the saved records have not been changed.";
          button.disabled = false;
          return;
        }
        originalSetItem.call(localStorage, `ss-cloud-legacy-migrated-${userId}`, "1");
        sessionStorage.removeItem(`ss-cloud-legacy-import-pending-${userId}`);
        if (codes.length) {
          const codeMessage = codes.map(item => item.error
            ? `${item.name} (${item.id}): ${item.error}`
            : `${item.name} (${item.id}) activation code: ${item.code}`).join("\n");
          window.alert(`Existing local student records were copied without deleting the originals. Share each activation code privately; codes expire in 7 days.\n\n${codeMessage}`);
        }
        location.reload();
      } catch (error) {
        console.error("Could not import the teacher's existing local records:", error);
        status.textContent = `Import could not be completed: ${error.message || "database operation failed"}. Your original records remain saved here.`;
        button.disabled = false;
      }
    });
    target.appendChild(card);
  };
  const workspaceOf = data => ({
    q: (data.q || []).filter(item => item && item.t),
    m: (data.m || []).filter(item => item && item.t),
    a: (data.a || []).filter(item => item && item.t),
  });
  const preserveLocalData = () => {
    const previous = localStorage.getItem("ssauth");
    if (previous && !localStorage.getItem("ssauth_legacy_backup")) {
      originalSetItem.call(localStorage, "ssauth_legacy_backup", previous);
    }
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("ss_") || key.endsWith("_legacy_backup")) continue;
      const backupKey = `${key}_legacy_backup`;
      if (!localStorage.getItem(backupKey)) {
        originalSetItem.call(localStorage, backupKey, localStorage.getItem(key));
      }
    }
  };
  const mergeUnique = (remote = [], local = [], keyOf = value => JSON.stringify(value)) => {
    const merged = new Map();
    for (const item of local) merged.set(keyOf(item), item);
    for (const item of remote) merged.set(keyOf(item), { ...merged.get(keyOf(item)), ...item });
    return [...merged.values()];
  };
  const mergeStudentData = (remote = {}, local = {}) => {
    const merged = { ...local, ...remote };
    merged.at = mergeUnique(remote.at || [], local.at || [], attempt => attempt.qid ? `qid:${attempt.qid}` : JSON.stringify(attempt))
      .map(attempt => {
        const localAttempt = (local.at || []).find(item => attempt.qid ? item.qid === attempt.qid : JSON.stringify(item) === JSON.stringify(attempt));
        const remoteAttempt = (remote.at || []).find(item => attempt.qid ? item.qid === attempt.qid : JSON.stringify(item) === JSON.stringify(attempt));
        const combined = { ...localAttempt, ...remoteAttempt };
        if (Array.isArray(localAttempt?.a) || Array.isArray(remoteAttempt?.a)) {
          const length = Math.max(localAttempt?.a?.length || 0, remoteAttempt?.a?.length || 0);
          combined.a = Array.from({ length }, (_, index) => {
            const localAnswer = localAttempt?.a?.[index] || {};
            const remoteAnswer = remoteAttempt?.a?.[index] || {};
            const answer = { ...localAnswer, ...remoteAnswer };
            const comments = mergeUnique(remoteAnswer.comments || [], localAnswer.comments || [],
              comment => JSON.stringify([comment.from, comment.text, comment.at]));
            if (comments.length) answer.comments = comments;
            return answer;
          });
        }
        return combined;
      })
      .sort((left, right) => Number(left.at || 0) - Number(right.at || 0));
    merged.tasks = mergeUnique(remote.tasks || [], local.tasks || []);
    merged.cards = mergeUnique(remote.cards || [], local.cards || []);
    merged.activeTests = { ...(local.activeTests || {}), ...(remote.activeTests || {}) };
    return merged;
  };
  const persistWorkspace = async () => {
    const current = session();
    if (syncingStorage || authenticatedRole !== "teacher" || !current) return;
    const data = json("ssauth", {});
    const snapshot = workspaceOf(data);
    const save = workspaceSaveQueue.catch(() => {}).then(() => cloud.saveWorkspace(current.u, snapshot));
    workspaceSaveQueue = save;
    await save;
  };
  const persistStudentData = async key => {
    const current = session();
    if (syncingStorage || !current || !key.startsWith("ss_")) return;
    const studentId = key.slice(3);
    if (!/^[a-z0-9_]{3,20}$/.test(studentId)) return;
    const data = json(key, null);
    if (!data) return;
    await cloud.saveStudentData(studentId, data, authenticatedRole);
  };
  const queueStorageSave = key => {
    if (key === "ssauth" && authenticatedRole === "teacher") {
      void persistWorkspace().catch(reportError);
      return;
    }
    if (!key.startsWith("ss_")) return;
    const current = session();
    if (!current || (authenticatedRole !== "teacher" && authenticatedRole !== "student")) return;
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(() => {
      saveTimers.delete(key);
      void persistStudentData(key).catch(reportError);
    }, 350));
  };
  const flushPendingSaves = async () => {
    const pending = [...saveTimers.keys()];
    for (const key of pending) {
      clearTimeout(saveTimers.get(key));
      saveTimers.delete(key);
    }
    await Promise.all(pending.map(key => persistStudentData(key)));
    await workspaceSaveQueue;
  };
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage) queueStorageSave(String(key));
  };

  const setCloudCache = (profile, workspace, students = []) => {
    const teacherName = profile.display_name || workspace.teacherName || "Teacher";
    const studentId = profile.student_id || null;
    const teacherKey = profile.user_id || profile.teacher_id;
    const teacher = { n: teacherName, id: teacherKey };
    const roster = students.map(item => ({
      id: item.student_id,
      n: item.display_name,
      t: teacherName,
    }));
    const ownStudent = studentId ? [{
      id: studentId,
      n: profile.display_name,
      t: teacherName,
    }] : [];
    const authData = {
      t: [teacher],
      s: studentId ? ownStudent : roster,
      q: workspace.q || [],
      m: workspace.m || [],
      a: workspace.a || [],
    };

    preserveLocalData();
    syncingStorage = true;
    try {
      originalSetItem.call(localStorage, "ssauth", JSON.stringify(authData));
      for (const student of students) {
        originalSetItem.call(localStorage, `ss_${student.student_id}`, JSON.stringify(student.student_data || {}));
      }
      if (studentId) originalSetItem.call(localStorage, `ss_${studentId}`, JSON.stringify(profile.student_data || {}));
    } finally {
      syncingStorage = false;
    }
    return { teacherName, teacherKey, studentId };
  };

  const legacyTeacherFor = name => {
    const legacy = json("ssauth_legacy_backup", json("ssauth", {}));
    return {
      legacy,
      teacher: (legacy.t || []).find(item => item.n?.trim().toLowerCase() === name.trim().toLowerCase()),
    };
  };
  const verifiesLegacyPassword = async (teacher, password) => {
    if (!teacher?.s || !teacher?.h) return false;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(teacher.s + password),
    );
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    return hash === teacher.h;
  };
  const migrateLegacyTeacherData = async (teacherName, password) => {
    const { legacy, teacher } = legacyTeacherFor(teacherName);
    if (!teacher) return [];
    if (!await verifiesLegacyPassword(teacher, password)) return null;
    const owned = (legacy.q || []).filter(item => item.t === teacher.n);
    const materials = (legacy.m || []).filter(item => item.t === teacher.n);
    const assignments = (legacy.a || []).filter(item => item.t === teacher.n);
    const students = (legacy.s || []).filter(item => item.t === teacher.n);
    const activationCodes = [];
    for (const student of students) {
      const code = cloud.makeActivationCode();
      try {
        await cloud.createStudentInvite(student.id, student.n, code, new Date(Date.now() + 7 * 86400000).toISOString());
        const saved = json(`ss_${student.id}_legacy_backup`, json(`ss_${student.id}`, null));
        if (saved) await cloud.saveStudentData(student.id, saved, "teacher");
        activationCodes.push({ id: student.id, name: student.n, code });
      } catch (error) {
        console.error(`Could not migrate legacy student ${student.id}:`, error);
        activationCodes.push({ id: student.id, name: student.n, error: error.message });
      }
    }
    await cloud.saveWorkspace(session()?.u, {
      q: owned, m: materials, a: assignments,
    });
    return activationCodes;
  };

  const finishLogin = async (user, reloadAfterLoad = false) => {
    clearError();
    let legacyImportMessage = null;
    let legacyDataImported = false;
    const pendingImportKey = `ss-cloud-legacy-import-pending-${user.id}`;
    const teacherResult = await cloud.client.from("teacher_profiles")
      .select("user_id,display_name").eq("user_id", user.id).maybeSingle();
    if (teacherResult.error) throw teacherResult.error;
    if (teacherResult.data) {
      const loaded = await cloud.loadTeacher(user.id);
      const { teacherName } = setCloudCache(loaded.profile, loaded.workspace, loaded.students);
      authenticatedRole = "teacher";
      sessionStorage.setItem("sses", JSON.stringify({ r: "t", k: teacherName, n: teacherName, u: user.id }));
      const legacy = legacyTeacherFor(teacherName).teacher;
      const migrationKey = `ss-cloud-legacy-migrated-${user.id}`;
      if (legacy && sessionStorage.getItem(pendingImportKey) !== "1" &&
          localStorage.getItem(migrationKey) !== "1" &&
          !(loaded.workspace.q || []).length && !(loaded.workspace.m || []).length && !(loaded.workspace.a || []).length) {
        try {
          const codes = await migrateLegacyTeacherData(teacherName, window.studySaathiPendingPassword || "");
          if (codes === null) {
            legacyImportMessage = "You are signed in. To import older records from this device, enter the old device password below. This is separate from your teacher sign-in password; your saved records will remain untouched.";
          } else {
            originalSetItem.call(localStorage, migrationKey, "1");
            legacyDataImported = true;
            if (codes.length) {
              const message = codes.map(item => item.error
                ? `${item.name} (${item.id}): ${item.error}`
                : `${item.name} (${item.id}) activation code: ${item.code}`).join("\n");
              window.alert(`Existing local student records were copied without deleting the originals. Share each activation code privately; codes expire in 7 days.\n\n${message}`);
            }
          }
        } catch (error) {
          console.error("Could not import the teacher's existing local records:", error);
          legacyImportMessage = `You are signed in, but the older records could not be imported yet: ${error.message || "database operation failed"}. Your originals remain saved here; you can retry below.`;
        }
      }
      if (sessionStorage.getItem(pendingImportKey) === "1") {
        legacyImportMessage = "You are signed in. To import older records from this device, enter the old device password below. This is separate from your teacher sign-in password; your saved records will remain untouched.";
      }
    } else {
      const loaded = await cloud.loadStudent(user.id);
      const { profile, workspace } = loaded;
      const info = setCloudCache({
        display_name: profile.display_name,
        student_id: profile.student_id,
        teacher_id: profile.teacher_id,
      }, workspace);
      authenticatedRole = "student";
      sessionStorage.setItem("sses", JSON.stringify({
        r: "s",
        k: profile.student_id,
        n: profile.display_name,
        u: user.id,
      }));
      const importKey = `ss-cloud-imported-${user.id}`;
      const legacyData = json(`ss_${profile.student_id}_legacy_backup`, null);
      if (legacyData && localStorage.getItem(importKey) !== "1") {
        const merged = mergeStudentData(profile.student_data || {}, legacyData);
        await cloud.saveStudentData(profile.student_id, merged, "student");
        originalSetItem.call(localStorage, `ss_${profile.student_id}`, JSON.stringify(merged));
        originalSetItem.call(localStorage, importKey, "1");
      }
      if (info.studentId !== profile.student_id) throw new Error("The student profile could not be verified.");
    }
    window.studySaathiPendingPassword = "";
    updateDatabaseStatus(true);
    location.hash = "home";
    if (reloadAfterLoad) {
      if (legacyImportMessage) sessionStorage.setItem(pendingImportKey, "1");
      sessionStorage.setItem("ss-cloud-hydrated-user", user.id);
      location.reload();
      return;
    }
    window.dispatchEvent(new StorageEvent("storage", { key: "ssauth", newValue: localStorage.getItem("ssauth") }));
    const current = session();
    if (current?.r === "s") {
      window.dispatchEvent(new StorageEvent("storage", { key: `ss_${current.k}`, newValue: localStorage.getItem(`ss_${current.k}`) }));
    }
    if (legacyDataImported) {
      sessionStorage.setItem("ss-cloud-hydrated-user", user.id);
      location.reload();
      return;
    }
    if (legacyImportMessage) {
      sessionStorage.setItem(pendingImportKey, "1");
      setTimeout(() => showLegacyImportPrompt(session()?.n || "Teacher", user.id, legacyImportMessage), 100);
    }
  };

  const activateStudent = async (studentId, code, password) => {
    const { error } = await cloud.activateStudent(studentId, code, password);
    if (error) throw error;
    const { data, error: loginError } = await cloud.signInStudent(studentId, password);
    if (loginError) throw loginError;
    if (!data.user) throw new Error("Account activated, but sign-in did not complete. Sign in with your student ID and new password.");
    await finishLogin(data.user, true);
  };

  const showActivationForm = () => {
    const target = app();
    if (!target) return;
    target.innerHTML = `<h1>Activate student account</h1><div class="c"><p>Enter the student ID and the one-time activation code provided by your teacher. Then create a password for signing in on any device.</p><label>Student ID<br><input id="activation-id" autocomplete="username" autocapitalize="none"></label><label>One-time activation code<br><input id="activation-code" autocomplete="one-time-code"></label><label>Create password (at least 10 characters)<br><input id="activation-password" type="password" autocomplete="new-password"></label><p id="activation-error" class="er" role="alert"></p><div class="row"><button class="p" id="activate-account">Activate account</button><button id="activation-back">Back to sign in</button></div></div>`;
    target.querySelector("#activation-back").onclick = () => location.reload();
    target.querySelector("#activate-account").onclick = async () => {
      const button = target.querySelector("#activate-account");
      const id = target.querySelector("#activation-id").value.trim();
      const code = target.querySelector("#activation-code").value.trim();
      const password = target.querySelector("#activation-password").value;
      const error = target.querySelector("#activation-error");
      if (!/^[a-z0-9_]{3,20}$/i.test(id) || code.length < 32 || password.length < 10) {
        error.textContent = "Enter a valid student ID and activation code, and a password with at least 10 characters.";
        return;
      }
      button.disabled = true;
      error.textContent = "";
      try { await activateStudent(id, code, password); }
      catch (cause) {
        error.textContent = cause.message || "Could not activate this account. Ask your teacher for a new code.";
        button.disabled = false;
      }
    };
  };

  const addResponsiveLoginFields = () => {
    const studentId = app()?.querySelector("#si");
    if (studentId && !app().querySelector("#student-password")) {
      const card = studentId.closest(".c");
      const passwordLabel = document.createElement("label");
      passwordLabel.innerHTML = "Password<br><input id=\"student-password\" type=\"password\" autocomplete=\"current-password\">";
      studentId.closest("label")?.after(passwordLabel);
      const help = card?.querySelector(".m");
      if (help) help.textContent = "First time here? Activate your account with the one-time code from your teacher.";
      const activate = document.createElement("button");
      activate.type = "button";
      activate.textContent = "Activate student account";
      activate.id = "student-activate-link";
      card?.querySelector(".row")?.append(activate);
      activate.onclick = showActivationForm;
    }
    const teacherUsername = app()?.querySelector("#tn");
    if (teacherUsername) {
      teacherUsername.autocapitalize = "none";
      teacherUsername.autocomplete = "username";
      teacherUsername.placeholder = "Username";
      const usernameLabel = teacherUsername.closest("label");
      if (usernameLabel?.childNodes[0]?.nodeType === Node.TEXT_NODE) {
        usernameLabel.childNodes[0].textContent = "Teacher username";
      }
      const guidance = app().querySelector(".teacher-guidance p");
      if (guidance) guidance.textContent = "Sign in with your teacher username and password. Create an account without email or email verification.";
      const createMode = app()?.querySelector("#tg")?.textContent.toLowerCase().includes("create");
      let displayNameLabel = app()?.querySelector("#teacher-display-name")?.closest("label");
      if (createMode && usernameLabel && !displayNameLabel) {
        displayNameLabel = document.createElement("label");
        displayNameLabel.innerHTML = "Display name<br><input id=\"teacher-display-name\" autocomplete=\"name\" required>";
        usernameLabel.after(displayNameLabel);
      } else if (!createMode) {
        displayNameLabel?.remove();
      }
    }
    const teacherPassword = app()?.querySelector("#tp");
    if (teacherPassword) {
      teacherPassword.minLength = 8;
      const label = teacherPassword.closest("label");
      const createMode = app()?.querySelector("#tg")?.textContent.toLowerCase().includes("create");
      let hint = label?.querySelector(".teacher-password-hint");
      if (createMode && label && !hint) {
        hint = document.createElement("small");
        hint.className = "teacher-password-hint m";
        hint.textContent = "Use at least 8 characters.";
        label.appendChild(hint);
      } else if (!createMode) {
        hint?.remove();
      }
    }
  };

  const handleSignIn = async event => {
    const target = event.target.closest("#sg");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = app()?.querySelector("#si")?.value || "";
    const password = app()?.querySelector("#student-password")?.value || "";
    if (!/^[a-z0-9_]{3,20}$/i.test(id.trim()) || !password) {
      showMessage("Enter your student ID and password.", true);
      return;
    }
    target.disabled = true;
    try {
      const { data, error } = await cloud.signInStudent(id, password);
      if (error) throw error;
      if (!data.user) throw new Error("Student ID or password is incorrect.");
      await finishLogin(data.user, true);
    } catch (error) {
      showMessage(error.message || "Student ID or password is incorrect.", true);
      target.disabled = false;
    }
  };

  const handleTeacherAuth = async event => {
    const target = event.target.closest("#tg");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const username = app()?.querySelector("#tn")?.value.trim() || "";
    const name = app()?.querySelector("#teacher-display-name")?.value.trim() || "";
    const password = app()?.querySelector("#tp")?.value || "";
    const createMode = target.textContent.toLowerCase().includes("create");
    if (!username || !password) {
      showMessage("Enter your teacher username and password.", true);
      return;
    }
    if (createMode && (!/^[a-z0-9_]{3,20}$/i.test(username) || name.length < 2 || password.length < 8)) {
      showMessage("Choose a username of 3 to 20 letters, numbers, or underscores, enter your display name, and use a password with at least 8 characters.", true);
      return;
    }
    target.disabled = true;
    try {
      if (createMode) {
        const { data, error } = await cloud.signUpTeacher(username, password, name);
        if (error) throw error;
        if (!data.session || !data.user) {
          showMessage("Your account was created, but sign-in did not complete. Try signing in with your username and password.", true);
          target.disabled = false;
          return;
        }
        window.studySaathiPendingPassword = password;
        await finishLogin(data.user);
      } else {
        const { data, error } = await cloud.signInTeacher(username, password);
        if (error) throw error;
        if (!data.user) throw new Error("Username or password is incorrect.");
        window.studySaathiPendingPassword = password;
        await finishLogin(data.user);
      }
    } catch (error) {
      showMessage(error.message || "Could not sign in. Check your username and password.", true);
      target.disabled = false;
    }
  };

  const handleCreateStudent = async event => {
    const target = event.target.closest("#aa");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const name = app()?.querySelector("#an")?.value.trim() || "";
    const id = cloud.normalizedStudentId(app()?.querySelector("#ai")?.value || "");
    const data = json("ssauth", {});
    if (!name || !/^[a-z0-9_]{3,20}$/.test(id)) {
      showMessage("Enter a student name and an ID of 3 to 20 letters, numbers, or underscores.", true);
      return;
    }
    if ((data.s || []).some(student => student.id.toLowerCase() === id)) {
      showMessage("That student ID is already assigned on this device.", true);
      return;
    }
    target.disabled = true;
    const activationCode = cloud.makeActivationCode();
    try {
      await cloud.createStudentInvite(id, name, activationCode, new Date(Date.now() + 7 * 86400000).toISOString());
      data.s = [...(data.s || []), { id, n: name, t: session()?.n }];
      preserveLocalData();
      originalSetItem.call(localStorage, "ssauth", JSON.stringify(data));
      queueStorageSave("ssauth");
      window.alert(`Student assigned. Give this one-time activation code to ${name}. It expires in 7 days:\n\n${activationCode}`);
      const row = target.closest(".row");
      if (row?.querySelector("#an")) row.querySelector("#an").value = "";
      if (row?.querySelector("#ai")) row.querySelector("#ai").value = "";
      location.reload();
    } catch (error) {
      showMessage(error.message || "Could not assign this student. Check the ID and try again.", true);
      target.disabled = false;
    }
  };

  const blockLocalRemoval = event => {
    const target = event.target.closest("[data-rm]");
    if (!target || authenticatedRole !== "teacher") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage("This student is stored in the shared database. Student removal is disabled here to protect existing records.");
  };

  document.addEventListener("click", event => {
    if (event.target.closest("#lo")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void (async () => {
        await flushPendingSaves();
        const { error } = await cloud.client.auth.signOut();
        if (error) throw error;
        sessionStorage.removeItem("sses");
        sessionStorage.removeItem("ss-cloud-hydrated-user");
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith("ss-cloud-legacy-import-pending-")) sessionStorage.removeItem(key);
        }
        updateDatabaseStatus(false);
        location.reload();
      })().catch(reportError);
      return;
    }
    void handleSignIn(event);
    void handleTeacherAuth(event);
    void handleCreateStudent(event);
    blockLocalRemoval(event);
  }, true);

  new MutationObserver(addResponsiveLoginFields).observe(document.body, { childList: true, subtree: true });

  void cloud.client.auth.getSession().then(async ({ data, error }) => {
    if (error) return reportError(error);
    if (!data.session?.user) {
      if (session()) {
        sessionStorage.removeItem("sses");
        location.reload();
      }
      updateDatabaseStatus(false);
      return;
    }
    try {
      const existing = session();
      const alreadyHydrated = sessionStorage.getItem("ss-cloud-hydrated-user") === data.session.user.id;
      await finishLogin(data.session.user, !alreadyHydrated && existing?.u !== data.session.user.id);
      sessionStorage.setItem("ss-cloud-hydrated-user", data.session.user.id);
    } catch (cause) {
      console.error("Could not restore the shared StudySaathi session:", cause);
      await cloud.client.auth.signOut();
      sessionStorage.removeItem("sses");
      displayError(cause.message || "Could not load your shared profile. Sign in again.");
      location.reload();
    }
  });

  cloud.client.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      authenticatedRole = null;
      sessionStorage.removeItem("sses");
    }
  });
})();
