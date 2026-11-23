const firebaseConfig = {
  apiKey: "AIzaSyCaItBb-o6NMogGu5BZk31RYxQyp_Gx4IA",
  authDomain: "history-a993d.firebaseapp.com",
  databaseURL: "https://history-a993d-default-rtdb.firebaseio.com",
  projectId: "history-a993d",
  storageBucket: "history-a993d.firebasestorage.app",
  messagingSenderId: "60668885097",
  appId: "1:60668885097:web:7f458f35971357baa64af8",
  measurementId: "G-H9VDJ1Z2N0"
};

const firebaseSdk = "https://www.gstatic.com/firebasejs/13.3.0";
let servicesPromise;
const ADMIN_UID = "ZmsmHQe9OZMbbWRBkTTe65iqRfJ2";
const TEACHER_UID = "2Bf8YaJUOFOlXtgy8Isui0pcdRi2";

function loginToEmail(login) {
  const value = String(login).trim();
  return value.includes("@") ? value : `${value}@history.local`;
}

async function getServices() {
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import(`${firebaseSdk}/firebase-app.js`),
      import(`${firebaseSdk}/firebase-auth.js`),
      import(`${firebaseSdk}/firebase-database.js`)
    ]).then(([appSdk, authSdk, databaseSdk]) => {
      const app = appSdk.initializeApp(firebaseConfig);
      return {
        auth: authSdk.getAuth(app),
        authSdk,
        database: databaseSdk.getDatabase(app),
        databaseSdk
      };
    });
  }
  return servicesPromise;
}

async function getSignedInUser(services) {
  const { auth, authSdk } = services;
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const unsubscribe = authSdk.onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
        return;
      }
      try {
        const credential = await authSdk.signInAnonymously(auth);
        resolve(credential.user);
      } catch (error) {
        reject(error);
      }
    }, reject);
  });
}

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createClassroom({ title, moduleId, moduleTitle, workId, workLabel, classId = "" }) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  const { ref, set } = services.databaseSdk;
  const code = createCode();
  const meta = {
    ownerUid: user.uid,
    title,
    moduleId,
    moduleTitle,
    workId,
    workLabel,
    classId,
    status: "open",
    createdAt: Date.now()
  };
  await set(ref(services.database, `classrooms/${code}/meta`), meta);
  return { code, uid: user.uid, meta };
}

export async function signInTeacher(email, password) {
  const services = await getServices();
  const credential = await services.authSdk.signInWithEmailAndPassword(services.auth, email.trim(), password);
  const role = credential.user.uid === ADMIN_UID ? "admin" : credential.user.uid === TEACHER_UID ? "teacher" : "student";
  return { uid: credential.user.uid, email: credential.user.email, role };
}

export async function signInStudent(login, password) {
  const services = await getServices();
  const credential = await services.authSdk.signInWithEmailAndPassword(services.auth, loginToEmail(login), password);
  if (credential.user.uid === ADMIN_UID || credential.user.uid === TEACHER_UID) throw new Error("STUDENT_ACCOUNT_REQUIRED");
  const snapshot = await services.databaseSdk.get(
    services.databaseSdk.ref(services.database, `managed/students/${credential.user.uid}`)
  );
  if (!snapshot.exists()) throw new Error("STUDENT_ACCOUNT_NOT_REGISTERED");
  const student = snapshot.val();
  if (student.active !== true) throw new Error("STUDENT_ACCOUNT_BLOCKED");
  return { uid: credential.user.uid, email: credential.user.email, name: student.name, classId: student.classId };
}

export async function signOutTeacher() {
  const services = await getServices();
  await services.authSdk.signOut(services.auth);
}

export async function createManagedClass(title) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  if (user.uid !== ADMIN_UID && user.uid !== TEACHER_UID) throw new Error("CLASSROOM_FORBIDDEN");
  const id = `class-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await services.databaseSdk.set(
    services.databaseSdk.ref(services.database, `managed/classes/${id}`),
    { title: title.trim().slice(0, 70), teacherUid: user.uid, createdAt: Date.now(), active: true }
  );
  return { id, title: title.trim() };
}

export async function createStudentAccount({ login, password, name, classId }) {
  const services = await getServices();
  const teacher = await getSignedInUser(services);
  if (teacher.uid !== ADMIN_UID && teacher.uid !== TEACHER_UID) throw new Error("CLASSROOM_FORBIDDEN");
  if (!name.trim() || !login.trim() || password.length < 6) throw new Error("CHECK_STUDENT_FIELDS");

  const appName = `student-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const app = services.appSdk.initializeApp(firebaseConfig, appName);
  const studentAuth = services.authSdk.getAuth(app);
  try {
    const credential = await services.authSdk.createUserWithEmailAndPassword(studentAuth, loginToEmail(login), password);
    const uid = credential.user.uid;
    await services.databaseSdk.set(
      services.databaseSdk.ref(services.database, `managed/students/${uid}`),
      { name: name.trim().slice(0, 60), login: login.trim().slice(0, 100), classId, active: true, createdAt: Date.now(), createdByUid: teacher.uid }
    );
    await services.databaseSdk.set(
      services.databaseSdk.ref(services.database, `managed/classes/${classId}/students/${uid}`),
      true
    );
    await services.authSdk.signOut(studentAuth);
    return { uid, name: name.trim(), login: login.trim(), classId };
  } finally {
    await services.appSdk.deleteApp(app);
  }
}

export async function setStudentActive(uid, active) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  if (user.uid !== ADMIN_UID && user.uid !== TEACHER_UID) throw new Error("CLASSROOM_FORBIDDEN");
  await services.databaseSdk.update(
    services.databaseSdk.ref(services.database, `managed/students/${uid}`),
    { active: Boolean(active), blockedAt: active ? null : Date.now() }
  );
}

export async function readManagedData() {
  const services = await getServices();
  const user = await getSignedInUser(services);
  if (user.uid !== ADMIN_UID && user.uid !== TEACHER_UID) throw new Error("CLASSROOM_FORBIDDEN");
  const snapshot = await services.databaseSdk.get(services.databaseSdk.ref(services.database, "managed"));
  return snapshot.exists() ? snapshot.val() : { classes: {}, students: {} };
}

export async function publishAnnouncement({ version, title, details }) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  if (user.uid !== ADMIN_UID) throw new Error("ADMIN_FORBIDDEN");
  const id = `release-${Date.now()}`;
  await services.databaseSdk.set(
    services.databaseSdk.ref(services.database, `announcements/${id}`),
    { version: String(version).trim().slice(0, 30), title: title.trim().slice(0, 100), details: details.trim().slice(0, 1000), publishedBy: "Андрей Витальевич", publishedAt: Date.now() }
  );
  return id;
}

export function watchAnnouncements(handlers) {
  let unsubscribe;
  getServices().then(async (services) => {
    await getSignedInUser(services);
    unsubscribe = services.databaseSdk.onValue(
      services.databaseSdk.ref(services.database, "announcements"),
      (snapshot) => handlers.onAnnouncements(snapshot.exists() ? snapshot.val() : {}),
      handlers.onError
    );
  }).catch(handlers.onError);
  return () => {
    if (unsubscribe) unsubscribe();
  };
}

export async function joinClassroom(code, name, deviceSummary) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  const { database, databaseSdk } = services;
  const metaSnapshot = await databaseSdk.get(databaseSdk.ref(database, `classrooms/${code}/meta`));
  if (!metaSnapshot.exists()) throw new Error("Занятие не найдено или код введён неверно.");
  const meta = metaSnapshot.val();
  if (meta.status !== "open") throw new Error("Это занятие уже закрыто.");
  const studentSnapshot = await databaseSdk.get(databaseSdk.ref(database, `managed/students/${user.uid}`));
  if (!studentSnapshot.exists() || studentSnapshot.val().active !== true) throw new Error("STUDENT_ACCOUNT_BLOCKED");
  if (meta.classId && studentSnapshot.val().classId !== meta.classId) throw new Error("STUDENT_CLASS_MISMATCH");

  await databaseSdk.set(databaseSdk.ref(database, `classrooms/${code}/participants/${user.uid}`), {
    name: name.trim().slice(0, 30),
    device: String(deviceSummary).slice(0, 160),
    deviceConsentAt: Date.now(),
    joinedAt: Date.now()
  });
  const responseSnapshot = await databaseSdk.get(databaseSdk.ref(database, `classrooms/${code}/responses/${user.uid}`));
  return { uid: user.uid, meta, response: responseSnapshot.exists() ? responseSnapshot.val() : null };
}

export function watchClassroom(code, role, uid, handlers) {
  let active = true;
  let services;
  const unsubscribers = [];
  getServices().then(async (loaded) => {
    services = loaded;
    await getSignedInUser(services);
    if (!active) return;
    const { database, databaseSdk } = services;
    const subscribe = (path, handler) => {
      const unsubscribe = databaseSdk.onValue(
        databaseSdk.ref(database, `classrooms/${code}/${path}`),
        (snapshot) => handler(snapshot.exists() ? snapshot.val() : null),
        handlers.onError
      );
      unsubscribers.push(unsubscribe);
    };

    subscribe("meta", handlers.onMeta);
    if (role === "teacher") {
      subscribe("participants", handlers.onParticipants);
      subscribe("responses", handlers.onResponses);
    } else {
      subscribe(`responses/${uid}`, handlers.onResponse);
    }
  }).catch((error) => handlers.onError(error));

  return () => {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export async function submitResponse(code, uid, text) {
  const services = await getServices();
  await getSignedInUser(services);
  const responseRef = services.databaseSdk.ref(services.database, `classrooms/${code}/responses/${uid}`);
  const result = await services.databaseSdk.runTransaction(responseRef, (current) => {
    if (current && current.annulled !== true) return;
    return { text: text.trim().slice(0, 2000), submittedAt: Date.now() };
  }, { applyLocally: false });
  if (!result.committed) throw new Error("CLASSROOM_ATTEMPT_EXISTS");
}

export async function submitClassroomResult(code, uid, result) {
  const services = await getServices();
  await getSignedInUser(services);
  const responseRef = services.databaseSdk.ref(services.database, `classrooms/${code}/responses/${uid}`);
  const transaction = await services.databaseSdk.runTransaction(responseRef, (current) => {
    if (current && current.annulled !== true) return;
    return {
      activity: result.activity,
      score: result.score,
      total: result.total,
      text: result.text,
      submittedAt: Date.now()
    };
  }, { applyLocally: false });
  if (!transaction.committed) throw new Error("CLASSROOM_ATTEMPT_EXISTS");
}

export async function annulClassroomAttempt(code, uid) {
  const services = await getServices();
  await getSignedInUser(services);
  const responseRef = services.databaseSdk.ref(services.database, `classrooms/${code}/responses/${uid}`);
  const transaction = await services.databaseSdk.runTransaction(responseRef, (current) => {
    if (!current || current.annulled === true) return;
    return { ...current, annulled: true, annulledAt: Date.now() };
  }, { applyLocally: false });
  if (!transaction.committed) throw new Error("CLASSROOM_ATTEMPT_NOT_FOUND");
}

export async function closeClassroom(code) {
  const services = await getServices();
  await getSignedInUser(services);
  await services.databaseSdk.update(
    services.databaseSdk.ref(services.database, `classrooms/${code}/meta`),
    { status: "closed" }
  );
}
