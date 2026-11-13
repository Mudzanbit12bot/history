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

export async function createClassroom({ title, moduleId, moduleTitle, workId, workLabel }) {
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
    status: "open",
    createdAt: Date.now()
  };
  await set(ref(services.database, `classrooms/${code}/meta`), meta);
  return { code, uid: user.uid, meta };
}

export async function signInTeacher(email, password) {
  const services = await getServices();
  const credential = await services.authSdk.signInWithEmailAndPassword(services.auth, email.trim(), password);
  return { uid: credential.user.uid, email: credential.user.email };
}

export async function signOutTeacher() {
  const services = await getServices();
  await services.authSdk.signOut(services.auth);
}

export async function joinClassroom(code, name, deviceSummary) {
  const services = await getServices();
  const user = await getSignedInUser(services);
  const { database, databaseSdk } = services;
  const metaSnapshot = await databaseSdk.get(databaseSdk.ref(database, `classrooms/${code}/meta`));
  if (!metaSnapshot.exists()) throw new Error("Занятие не найдено или код введён неверно.");
  const meta = metaSnapshot.val();
  if (meta.status !== "open") throw new Error("Это занятие уже закрыто.");

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
