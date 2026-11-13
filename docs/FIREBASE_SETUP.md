# Live Classroom: Firebase Realtime Database

The classroom uses Firebase Authentication and Realtime Database. No VPS, Node.js, npm, or build step is required; the browser SDK is loaded from Google's CDN only when Live Classroom is opened.

## One-time Firebase setup

1. In **Authentication → Sign-in method**, enable **Email/Password** and **Anonymous**.
2. In **Authentication → Users**, choose **Add user** and create the owner and teacher accounts with their email addresses and strong passwords. Share passwords privately; do not put them in the repository or send them in chat.
3. Copy both users' **UIDs** from the Users list. The repository's `database.rules.json` currently allows these two UIDs to create classrooms.
4. Paste the contents of `database.rules.json` into **Realtime Database → Rules** and publish. If you replace either account later, update the UID allowlist in that file first. Never use open/test rules such as `.read: true` or `.write: true`.
5. In **Authentication → Settings → Authorized domains**, ensure the website hostname is listed. Add `localhost` / `127.0.0.1` for local tests and the GitHub Pages hostname when publishing.
6. Open the website, enter the teacher email/password in **Live Classroom**, create a session, and test its QR/link in a second browser or device.

The public Web app configuration is in `src/firebase-classroom.js`. Its API key and project identifiers are intended for a browser app; never put service-account keys or user passwords in this repository. Analytics is not initialized.

## Classroom workflow

- The teacher signs in with the account created in Firebase Console.
- The teacher chooses a module and activity, then creates a session with an eight-character code and QR/link.
- Students join anonymously with a display name and complete the assigned test, crossword, or game.
- The app checks those activities in the browser and sends the score to the teacher's live panel.
- Each student can submit once per classroom. While the session is open, the teacher can choose **АННУЛИРОВАТЬ · РАЗРЕШИТЬ ПОВТОР** on that student's result to allow one new attempt.
- The teacher closes the session to stop new joins and submissions.

The teacher account is allowed to create and manage sessions by its Firebase UID in the database rules. Students can only write their own participant record and one result; database rules reject a second submission until the teacher annuls the existing attempt. Anyone with a valid class link/code can join while a session is open.

## Important limitations

Automatic checking runs in the student's browser. Since the exercises and answer keys are part of the static site, a technically skilled student could inspect or alter the reported score. Use results for classroom practice, not as tamper-proof official grades. Trusted server-side scoring would require a backend; Firebase Spark does not provide a VPS or an always-on server.

The one-attempt limit is tied to the student's anonymous Firebase account for that browser. Clearing browser data or switching browsers/devices creates a different anonymous account and cannot be reliably identified as the same student without individual sign-in.

Firebase Auth keeps the teacher signed in on that browser. The app saves the active session code in that browser so the teacher can reopen the panel; save the code/link separately if it must survive clearing browser data or moving to another device. Closing a session does not delete its records. Remove old entries under `/classrooms/<code>` from the Realtime Database Data view when no longer needed.

Avoid sensitive personal data. Review current Spark quotas in Firebase Console; sessions and results consume Realtime Database storage and downloads.
