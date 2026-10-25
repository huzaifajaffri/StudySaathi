StudySaathi (browser-only version)

Run: keep index.html and app.js together, then open index.html in a current
browser. If browser storage is blocked for local files, run
"python -m http.server 8000" in this folder and open
http://localhost:8000. The basic study features need no packages or AI API.
The app logic lives in app.js. The Manrope font loads from Google Fonts when
online; the page works without it.

Roles
- Teacher: after email confirmation is disabled in Supabase, create an account
  (name + email + password) and sign in immediately, then assign student IDs, publish
  multiple-choice quizzes or timed theoretical tests to selected students, post
  materials and assignments, and review each student's answers and the correct
  answers for completed quizzes. A setup notice on teacher sign-in explains that
  student IDs must be created before students can sign in.
- Teachers sign in with their email and password. Supabase email confirmation
  must be disabled for immediate account creation. New teacher passwords must
  be at least 8 characters; teachers migrating an old local account can reuse
  its existing password.
- Teachers assign each student a unique ID and share that student's one-time
  activation code privately. On any device, the student enters the ID and code,
  chooses a password once, and thereafter signs in using only the assigned ID
  and password.
- A teacher-assigned quiz appears only in the selected students' portals and
  allows one submission per student. After submitting, the quiz is marked
  Submitted and cannot be started again. Self-practice quizzes remain repeatable.
- A theoretical test uses written-response questions, the same student targeting
  and one-submission rule, and a teacher-set time limit in minutes. Its timer
  begins when a student starts and answers are submitted automatically at expiry.
  Teachers can review and mark each response in the separate Theoretical tests
  tab, then release total marks and a percentage-based rating. Students see a
  message that results will be announced soon after submission, then a
  result-release notice on sign-in and can ask questions on each marked answer;
  teachers can reply in that question's discussion. Rating bands: 90%+
  Excellent, 80-89% Very good, 70-79% Good, 60-69% Satisfactory, 50-59%
  Needs improvement, below 50% Keep practicing.
- Students and teachers can fill in multiple question comments or replies for
  one theoretical test and send them together with one button. The home-page
  result link, "View Result and Ask Questions," is hidden after the student opens
  the released results; a later newly released result can show a new link.
- New quiz submissions show a prominent unread dot beside the teacher's Quizzes
  tab. New theoretical-test submissions and student comments show the same dot
  beside Theoretical tests. Opening the corresponding tab clears its submission
  indicator; opening Theoretical tests also marks student comments as read.
- A teacher's new reply to a theoretical-test question shows a dark unread dot
  beside the student's Quizzes option. The dot clears when the student opens
  Quizzes. Same-browser tabs update when a result or reply is saved.
- Student progress includes submitted MCQ quiz scores and released theoretical
  test marks, ordered by result date. Unreleased theoretical marks are not shown.
- Quiz and test results, assignments, dashboard items and learning materials
  identify the teacher as "Sir [name]".
- Deleting a teacher's quiz or test also removes its attempts, released results,
  active timer state and related progress from the students assigned to it.
- Quizzes published before student-specific assignment was added have no
  recipient list and are hidden from student portals.

Important limits
- App data is stored in this browser's IndexedDB and localStorage on this device
  only. On startup, existing records are merged into the existing StudySaathi
  database; the app does not clear or recreate saved accounts or results. Writes
  are serialized and request strict IndexedDB durability where supported. A
  local copy remains available as a cache/backup.
- Shared sign-in and cross-device records require the Supabase migration and
  `activate-student` Edge Function to be deployed to the project configured in
  `supabase-client.js`. Both are deployed for the configured project, and the
  static site has been redeployed. The static site does not use Next.js, so
  Next.js server helpers, middleware, `page.tsx`, and `.env.local` are not used.
- To configure Supabase, run
  `supabase/migrations/20261025000000_shared_student_access.sql` in the
  project's SQL Editor, then run
  `npx supabase login` and
  `npx supabase functions deploy activate-student --project-ref vwvunnqjzckieizwvjsm`.
  Supabase supplies the server-side `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; if configuring another project
  where the key is not available, add it only through the Supabase dashboard.
  Never put the service-role key in this website or commit it. Redeploy the
  static site after these steps.
- In the Supabase dashboard, open Authentication > Providers > Email and turn
  off Confirm email so teacher accounts can sign in immediately without email
  verification. If a teacher account was created while confirmation was still
  enabled, confirm that existing account once in Authentication > Users after
  changing the setting. Teacher email and password remain the sign-in
  credentials; disabling confirmation does not remove password authentication.
- Set Supabase Auth's Site URL to the deployed site origin. Redirect URLs are
  needed only if email-based confirmation or recovery flows are enabled.
- Existing browser-only teacher records are copied from the browser that holds
  them. Email sign-in is never blocked by local-data migration. If needed, the
  teacher can enter the old device password separately in the import prompt;
  the source records are retained. The teacher must privately share each
  generated one-time activation code with the corresponding student.
- A student's pre-existing local study history is merged into their shared
  profile on first sign-in from the browser that holds that history. Local
  backup copies are retained.
- Browser storage can still be removed by clearing browser data. The local
  cache does not replace the shared database or its backups.
- Detailed answer reviews are saved for quiz attempts completed after this
  update. Older attempts retain their scores but do not contain the selected
  answers needed for a per-question review. Teachers can see incorrect
  questions and the student's answer alongside the correct answer.
- Copy blocking during an active quiz deters normal text selection, copy/cut
  shortcuts and context-menu copying. It cannot prevent screenshots, browser
  developer tools or other ways of capturing content.
- Marks, releases and question discussions are saved locally and synced to the
  shared database for authenticated users after Supabase is configured.
- The legacy browser-only teacher password hashes remain on the original device;
  new passwords and cross-device authentication are handled by Supabase Auth.
- Sample question bank is a small original demonstration set, not an official
  syllabus or past papers.

Deploying updates
- This is a static HTML/CSS/JavaScript site. It has no build command; Netlify
  should publish the repository root (`.`). These settings are in the root
  `netlify.toml`.
- The existing Netlify site association is stored locally in
  `.netlify/state.json`. That local state is ignored by Git.
- To enable push-to-deploy, initialize Git for this folder in VS Code, create
  a GitHub repository, and publish this folder to it. Then, in Netlify, open
  the existing site and go to Site configuration > Build & deploy >
  Continuous deployment. Link the GitHub repository and select the branch
  used for production. Keep the base directory and build command empty, and
  set the publish directory to `.`.
- After the initial link, pushing commits to the production branch triggers
  automatic Netlify deployments. A normal save in VS Code does not deploy
  until the changes are committed and pushed.
