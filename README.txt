StudySaathi (browser-only version)

Run: keep index.html and app.js together, then open index.html in a current
browser. If browser storage is blocked for local files, run
"python -m http.server 8000" in this folder and open
http://localhost:8000. The basic study features need no packages or AI API.
The app logic lives in app.js. The Manrope font loads from Google Fonts when
online; the page works without it.

Roles
- Teacher: create an account with a username, display name and password, then
  sign in immediately without providing an email address, assign student IDs, publish
  multiple-choice quizzes or timed theoretical tests to selected students, post
  materials and assignments, and review each student's answers and the correct
  answers for completed quizzes. A setup notice on teacher sign-in explains that
  student IDs must be created before students can sign in.
- Teachers sign in with their username and password. New usernames must be
  3-20 lowercase letters, numbers or underscores; passwords must be at least
  8 characters. Teachers migrating an old local account can reuse
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
- Shared sign-in and cross-device records require the Supabase migrations and
  `activate-student` and `create-teacher` Edge Functions to be deployed to the
  project configured in `supabase-client.js`. The shared-data migration and
  student activation function are already deployed; the teacher username
  migration and account-creation function must also be deployed. The static site
  does not use Next.js, so
  Next.js server helpers, middleware, `page.tsx`, and `.env.local` are not used.
- To configure Supabase, run
  `supabase/migrations/20261025000000_shared_student_access.sql` and
  `supabase/migrations/20261025010000_teacher_username_auth.sql` in the
  project's SQL Editor, then run
  `npx supabase login` and
  `npx supabase functions deploy activate-student create-teacher --project-ref vwvunnqjzckieizwvjsm`.
  Supabase supplies the server-side `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; if configuring another project
  where the key is not available, add it only through the Supabase dashboard.
  Never put the service-role key in this website or commit it. Redeploy the
  static site after these steps.
- Teacher accounts are created by the `create-teacher` Edge Function using
  Supabase's server-side admin API and an internal non-routable email address.
  The service-role key remains server-side. The function confirms its internal
  account email, so email confirmation is not needed for teacher signup.
- The teacher profile trigger trusts only Supabase-managed app metadata, so a
  browser cannot grant itself the teacher role by setting user metadata.
- New teacher accounts use a 3-to-20-character username containing letters,
  numbers, or underscores. Existing email-based teacher accounts can still sign
  in by entering their email in the same sign-in field; no email signup option
  is shown.
- Set Supabase Auth's Site URL to the deployed site origin. Email redirects
  are not used for teacher registration or sign-in.
- Existing browser-only teacher records are copied from the browser that holds
  them. Username sign-in is never blocked by local-data migration. If needed, the
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
- This is a static HTML/CSS/JavaScript site. It has no build command. Vercel is
  the new production host from the public GitHub repository
  `huzaifajaffri/StudySaathi`; the existing Netlify site remains live until it
  is removed from the Netlify dashboard.
- Vercel uses the repository root (`./`), the Other framework preset, no build
  command, and `.` as the output directory. The Vercel GitHub app is connected
  only to this repository.
- Push commits to the `main` branch to trigger automatic Vercel deployments.
  Saving files in VS Code alone does not deploy; commit and push the changes.
