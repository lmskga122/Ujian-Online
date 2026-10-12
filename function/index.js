const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin harus login.");
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Khusus admin.");
}
function cleanString(v, max=160) {
  return typeof v === "string" ? v.trim().slice(0,max) : "";
}
function hash(v) { return crypto.createHash("sha256").update(v).digest("hex"); }

// Mahasiswa harus sudah dimasukkan admin ke daftar_mahasiswa/{NIM}.
// deviceId adalah ID acak yang dibuat browser dan disimpan di localStorage.
// Ini mencegah login ulang normal dari browser/perangkat berbeda, tetapi bukan bukti identitas
// yang anti-manipulasi. Untuk keamanan lebih tinggi, aktifkan Firebase Auth/PIN peserta.
exports.studentLogin = onCall({ enforceAppCheck: false }, async (request) => {
  const name = cleanString(request.data?.name);
  const nim = cleanString(request.data?.nim, 32);
  const deviceId = cleanString(request.data?.deviceId, 200);
  if (!name || !nim || !deviceId) throw new HttpsError("invalid-argument", "Nama, NIM, dan ID perangkat wajib diisi.");
  const studentRef = db.collection("daftar_mahasiswa").doc(nim);
  const sessionRef = db.collection("exam_sessions").doc(nim);
  return db.runTransaction(async tx => {
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) throw new HttpsError("not-found", "NIM belum terdaftar. Hubungi admin.");
    const student = studentSnap.data();
    if (cleanString(student.name).toLocaleLowerCase("id-ID") !== name.toLocaleLowerCase("id-ID")) {
      throw new HttpsError("permission-denied", "Nama dan NIM tidak cocok.");
    }
    const sessionSnap = await tx.get(sessionRef);
    const state = sessionSnap.exists ? sessionSnap.data() : {};
    if (state.status === "submitted") throw new HttpsError("failed-precondition", "NIM ini sudah menyelesaikan ujian dan tidak dapat mengulang.");
    if (state.status === "locked") throw new HttpsError("failed-precondition", "Akses ujian terkunci. Hubungi admin untuk membuka kembali.");
    if (state.status === "active") {
      throw new HttpsError("failed-precondition", "Sesi ujian sudah dimulai. Login ulang diblokir; jika koneksi terputus, hubungi admin untuk membuka akses.");
    }
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const configSnap = await tx.get(db.collection("exam_config").doc("current"));
    const config = configSnap.exists ? configSnap.data() : { durationMinutes: 20, active: true };
    if (config.active === false) throw new HttpsError("failed-precondition", "Ujian belum dibuka oleh admin.");
    const now = Timestamp.now();
    const expiresAt = state.status === "active" && state.expiresAt ? state.expiresAt :
      Timestamp.fromMillis(now.toMillis() + Math.max(1, Math.min(Number(config.durationMinutes)||20,300))*60*1000);
    tx.set(sessionRef, {
      nim, name: student.name, kelas: student.kelas || "",
      status: "active", deviceHash: hash(deviceId), sessionToken,
      startedAt: state.startedAt || now, expiresAt,
      tabViolations: state.tabViolations || 0,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, name: student.name, nim, kelas: student.kelas || "",
      sessionToken, status: "active", expiresAt: expiresAt.toMillis(),
      durationMinutes: Math.max(1, Math.min(Number(config.durationMinutes)||20,300)) };
  });
});

// Jawaban diserahkan hanya melalui backend. Kunci jawaban dibaca di server, bukan client.
exports.submitExam = onCall(async (request) => {
  const nim = cleanString(request.data?.nim, 32);
  const deviceId = cleanString(request.data?.deviceId, 200);
  const sessionToken = cleanString(request.data?.sessionToken, 200);
  const answers = request.data?.answers;
  const status = cleanString(request.data?.status, 120) || "Selesai";
  if (!nim || !deviceId || !sessionToken || !answers || typeof answers !== "object") {
    throw new HttpsError("invalid-argument", "Data pengumpulan tidak lengkap.");
  }
  const sessionRef = db.collection("exam_sessions").doc(nim);
  const studentRef = db.collection("daftar_mahasiswa").doc(nim);
  const resultRef = db.collection("exam_results").doc(nim);
  return db.runTransaction(async tx => {
    const [ss, st, rs] = await Promise.all([tx.get(sessionRef), tx.get(studentRef), tx.get(resultRef)]);
    if (!ss.exists || !st.exists) throw new HttpsError("not-found", "Sesi atau mahasiswa tidak ditemukan.");
    const s = ss.data();
    if (s.status === "submitted" || rs.exists) throw new HttpsError("already-exists", "Ujian ini sudah pernah dikumpulkan.");
    if (s.status !== "active" || s.deviceHash !== hash(deviceId) || s.sessionToken !== sessionToken) {
      throw new HttpsError("permission-denied", "Sesi tidak valid. Hubungi admin.");
    }
    if (Timestamp.now().toMillis() > s.expiresAt.toMillis()) {
      // tetap kumpulkan jawaban yang dikirim ketika sesi sudah kedaluwarsa
    }
    const qSnap = await tx.get(db.collection("bank_soal").where("active", "==", true));
    let earned = 0, maxScore = 0, count = 0;
    const safeAnswers = {};
    qSnap.forEach(doc => {
      const q = doc.data(); const id = doc.id; const points = Math.max(1, Number(q.points)||1);
      maxScore += points; count++;
      const selected = cleanString(answers[id], 500);
      safeAnswers[id] = selected;
      if (selected && selected === q.answerText) earned += points;
    });
    const score = maxScore ? Number((earned / maxScore * 100).toFixed(2)) : 0;
    tx.create(resultRef, {
      nim, name: st.data().name, kelas: st.data().kelas || "",
      answers: safeAnswers, score, earned, maxScore, totalQuestions: count,
      status, tabViolations: Math.max(0, Number(request.data?.tabViolations)||0),
      submittedAt: FieldValue.serverTimestamp()
    });
    tx.update(sessionRef, { status: "submitted", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, score, earned, maxScore, totalQuestions: count, status: "submitted" };
  });
});

exports.adminUpsertStudent = onCall(async request => {
  requireAdmin(request);
  const name = cleanString(request.data?.name), nim = cleanString(request.data?.nim, 32), kelas = cleanString(request.data?.kelas, 40);
  if (!name || !nim || !kelas) throw new HttpsError("invalid-argument", "Nama, NIM, dan kelas wajib diisi.");
  const ref = db.collection("daftar_mahasiswa").doc(nim);
  const snap = await ref.get();
  if (snap.exists && snap.data().nim !== nim) throw new HttpsError("already-exists", "NIM sudah digunakan.");
  await ref.set({ name, nim, kelas, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, nim };
});

exports.adminReopenStudent = onCall(async request => {
  requireAdmin(request);
  const nim = cleanString(request.data?.nim, 32);
  const reason = cleanString(request.data?.reason, 300);
  if (!nim || !reason) throw new HttpsError("invalid-argument", "NIM dan alasan pembukaan akses wajib diisi.");
  const ref = db.collection("exam_sessions").doc(nim);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    tx.set(ref, {
      nim, status: "locked", reopenRequested: true, reopenReason: reason,
      reopenBy: request.auth.uid, reopenAt: FieldValue.serverTimestamp(),
      // reset status secara eksplisit menjadi not_started. Hasil lama tetap disimpan
      // dan perlu diarsipkan/dihapus admin melalui prosedur terpisah bila mengizinkan ujian ulang.
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    // Kebijakan default: pembukaan kembali setelah gangguan menghapus kunci sesi aktif,
    // tetapi tidak menghapus hasil final. Jika sudah submitted, tidak boleh membuka ulang.
    if (snap.exists && snap.data().status === "submitted") {
      throw new HttpsError("failed-precondition", "Ujian sudah dikumpulkan. Gunakan prosedur izin ujian ulang terpisah.");
    }
    tx.set(ref, { status: "not_started", deviceHash: FieldValue.delete(), sessionToken: FieldValue.delete(),
      startedAt: FieldValue.delete(), expiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { ok: true, status: "not_started" };
});

exports.adminSetExamConfig = onCall(async request => {
  requireAdmin(request);
  const durationMinutes = Math.max(1, Math.min(Number(request.data?.durationMinutes)||20, 300));
  const active = request.data?.active === true;
  await db.collection("exam_config").doc("current").set({
    durationMinutes, active, updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true, durationMinutes, active };
});

exports.adminGetDashboard = onCall(async request => {
  requireAdmin(request);
  const [students, results, sessions] = await Promise.all([
    db.collection("daftar_mahasiswa").get(),
    db.collection("exam_results").get(),
    db.collection("exam_sessions").get()
  ]);
  return {
    studentCount: students.size, resultCount: results.size,
    sessions: sessions.docs.map(d => ({ nim: d.id, status: d.data().status || "not_started",
      name: d.data().name || "", kelas: d.data().kelas || "",
      tabViolations: d.data().tabViolations || 0 }))
  };
});
