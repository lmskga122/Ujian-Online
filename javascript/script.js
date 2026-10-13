// ============================================================
// SISTEM UJIAN ONLINE
// Login admin: Firebase Authentication + custom claim admin
// Fitur admin dan pengelolaan data demo tetap dipertahankan.
//
// PENTING:
// - Data ujian/mahasiswa/soal di bawah masih localStorage.
// - Autosave jawaban masih lokal, belum Firestore.
// - Untuk ujian resmi, integrasikan penyimpanan server tepercaya.
// ============================================================

let questions = [
  { q: "HTML digunakan untuk...", a: "Membuat struktur halaman web", options: ["Mengatur logika program", "Mendesain database", "Membuat struktur halaman web", "Mengatur server", "Mengelola jaringan"] },
  { q: "Tag HTML untuk membuat paragraf adalah...", a: "<p>", options: ["<h1>", "<p>", "<div>", "<span>", "<br>"] },
  { q: "CSS digunakan untuk...", a: "Mengatur tampilan web", options: ["Membuat struktur web", "Menyimpan data", "Mengatur tampilan web", "Mengelola server", "Menjalankan logika"] },
  { q: "Properti CSS untuk mengubah warna teks adalah...", a: "color", options: ["background-color", "text-style", "color", "font-weight", "text-align"] },
  { q: "JavaScript digunakan untuk...", a: "Menambah interaksi pada web", options: ["Mengatur tampilan saja", "Membuat database", "Menambah interaksi pada web", "Mendesain UI", "Mengatur server saja"] },
  { q: "Tag untuk membuat link adalah...", a: "<a>", options: ["<link>", "<a>", "<href>", "<url>", "<nav>"] },
  { q: "Atribut untuk menentukan tujuan link adalah...", a: "href", options: ["src", "alt", "href", "link", "action"] },
  { q: "Tag untuk menampilkan gambar adalah...", a: "<img>", options: ["<image>", "<img>", "<pic>", "<src>", "<figure>"] },
  { q: "Atribut src digunakan untuk...", a: "Menentukan sumber file", options: ["Mengatur warna", "Menentukan sumber file", "Menentukan ukuran", "Mengatur teks", "Menyimpan data"] },
  { q: "Properti CSS untuk mengatur ukuran font adalah...", a: "font-size", options: ["font-style", "font-size", "text-size", "size", "font-weight"] },
  { q: "Fungsi alert() di JavaScript digunakan untuk...", a: "Menampilkan pesan popup", options: ["Menyimpan data", "Menampilkan pesan popup", "Menghapus data", "Mengatur warna", "Membuat form"] },
  { q: "Penulisan komentar di HTML adalah...", a: "<!-- komentar -->", options: ["// komentar", "/* komentar */", "<!-- komentar -->", "# komentar", "** komentar **"] },
  { q: "Penulisan komentar di JavaScript adalah...", a: "// komentar", options: ["<!-- -->", "// komentar", "** komentar **", "## komentar", "%% komentar"] },
  { q: "Tag untuk membuat form adalah...", a: "<form>", options: ["<input>", "<form>", "<label>", "<button>", "<submit>"] },
  { q: "Tag input untuk teks adalah...", a: '<input type="text">', options: ['<input type="text">', "<text>", "<textbox>", '<input type="string">', "<input text>"] },
  { q: "CSS dapat ditulis di dalam file dengan ekstensi...", a: ".css", options: [".html", ".js", ".css", ".php", ".txt"] },
  { q: "JavaScript biasanya ditulis dalam file berekstensi...", a: ".js", options: [".java", ".script", ".js", ".json", ".tsv"] },
  { q: "Tag <br> berfungsi untuk...", a: "Pindah baris", options: ["Membuat paragraf", "Membuat garis", "Pindah baris", "Membuat spasi", "Membuat tabel"] },
  { q: "Properti CSS untuk mengatur posisi teks adalah...", a: "text-align", options: ["text-style", "text-align", "align-text", "position-text", "font-align"] },
  { q: "Event onclick pada JavaScript terjadi saat...", a: "Tombol diklik", options: ["Halaman dimuat", "Mouse bergerak", "Tombol diklik", "Keyboard ditekan", "Halaman ditutup"] }
];


async function loadQuestionsFromFirebase() {
  try {
    const db = window.firebaseServices?.db;

    if (!db) {
      throw new Error("Koneksi Firestore belum tersedia.");
    }

    const snapshot = await db.collection("bank_soal").get();

    if (snapshot.empty) {
      throw new Error("Koleksi bank_soal masih kosong.");
    }

    const loadedQuestions = snapshot.docs
      .map((doc) => {
        const data = doc.data();

        // Mendukung dua format dokumen Firebase.
        const questionText =
          data.question || data.pertanyaan || data.q || "";

        const rawOptions = data.options || data.pilihan || [];

        const options = Array.isArray(rawOptions)
          ? rawOptions
          : Object.values(rawOptions);

        const rawAnswer =
          data.answer || data.menjawab || data.jawaban || data.a || "";

        const answerText = String(rawAnswer).trim();
        const answerIndex = "ABCDE".indexOf(
          answerText.toUpperCase()
        );

        // Jika kunci berbentuk A, B, C, D, atau E,
        // ubah menjadi teks pilihan jawaban.
        const answer =
          answerIndex >= 0 && options[answerIndex] !== undefined
            ? options[answerIndex]
            : answerText;

        return {
          q: questionText,
          a: answer,
          options: options.map(String),
          points: Number(data.points ?? data.poin ?? 1)
        };
      })
      .filter(
        (q) =>
          q.q &&
          q.options.length >= 2 &&
          q.a &&
          q.options.includes(q.a)
      );

    if (loadedQuestions.length === 0) {
      throw new Error(
        "Dokumen ditemukan, tetapi format soal atau kunci jawabannya belum sesuai."
      );
    }

    questions = loadedQuestions;

    console.log(
      `${questions.length} soal berhasil dimuat dari Firebase.`
    );

    return true;
  } catch (error) {
    console.error("Gagal memuat soal Firebase:", error);
    alert("Soal dari Firebase gagal dimuat: " + error.message);
    return false;
  }
}

// ============================================================
// STATE
// ============================================================

let currentIdx = 0;
let userAnswers = {};
let timer = null;
let timeLeft = 0;
let questionOrder = [];
let shuffledOptions = {};
let tabViolationCount = 0;
let autosaveTimer = null;

const MAX_TAB_VIOLATIONS = 2;
const AUTOSAVE_INTERVAL_MS = 5000;
const DRAFT_KEY = "cbt_unimed_active_draft";

let currentUser = "";
let currentNim = "";
let userClass = "";
let loginMode = "student";
let submitting = false;
let authenticatedAdmin = null;

const $ = id => document.getElementById(id);

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem("cbt_unimed_results") || "[]");
  } catch {
    return [];
  }
}

if ($("year")) {
  $("year").textContent = new Date().getFullYear();
}

// ============================================================
// LOGIN MODE
// ============================================================
function setLoginMode(mode) {
  console.log("setLoginMode dipanggil:", mode);

  loginMode = mode;

  $("student-tab")?.classList.toggle("active", mode === "student");
  $("admin-tab")?.classList.toggle("active", mode === "admin");
  $("student-form")?.classList.toggle("hidden", mode !== "student");
  $("admin-form")?.classList.toggle("hidden", mode !== "admin");
  $("login-message")?.classList.add("hidden");
}
function setLoginMode(mode) {
  loginMode = mode;

  $("student-tab")?.classList.toggle("active", mode === "student");
  $("admin-tab")?.classList.toggle("active", mode === "admin");
  $("student-form")?.classList.toggle("hidden", mode !== "student");
  $("admin-form")?.classList.toggle("hidden", mode !== "admin");
  $("login-message")?.classList.add("hidden");
}

function showLoginMessage(message) {
  const el = $("login-message");
  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.remove("hidden");
}

// ============================================================
// LOGIN ADMIN FIREBASE
// Membutuhkan window.firebaseServices dari index.html.
// ============================================================

async function checkAdmin(event) {
  if (event) event.preventDefault();

  const email = $("admin-email")?.value.trim();
  const password = $("admin-pass")?.value;

  if (!email || !password) {
    showLoginMessage("Masukkan email dan kata sandi admin.");
    return;
  }

  const services = window.firebaseServices;

  if (
    !services ||
    !services.auth ||
    !services.signInWithEmailAndPassword ||
    !services.signOut
  ) {
    showLoginMessage(
      "Firebase belum terhubung. Periksa konfigurasi Firebase pada index.html."
    );
    console.error("window.firebaseServices belum tersedia.");
    return;
  }

  const button = document.querySelector(
    '#admin-form button[type="submit"]'
  );

  const originalText = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = "Memverifikasi...";
  }

  try {
    const credential = await services.signInWithEmailAndPassword(
      services.auth,
      email,
      password
    );

    // Paksa mengambil token baru agar custom claim terbaru terbaca.
    const tokenResult = await credential.user.getIdTokenResult(true);

    if (tokenResult.claims.admin !== true) {
      await services.signOut(services.auth);
      throw new Error(
        "Akun berhasil login, tetapi belum memiliki hak admin (admin: true)."
      );
    }

    authenticatedAdmin = credential.user;

    $("login-section")?.classList.add("hidden");
    $("exam-section")?.classList.add("hidden");
    $("result-section")?.classList.remove("hidden");
    $("score-summary")?.replaceChildren();

    if ($("score-summary")) {
      $("score-summary").innerHTML =
        "<p>Autentikasi admin Firebase berhasil.</p>";
    }

    $("admin-login-area")?.classList.add("hidden");
    $("admin-content")?.classList.remove("hidden");

    $("logged-admin")?.replaceChildren(
      document.createTextNode(credential.user.email || email)
    );

    loadLeaderboard();
    refreshAdminStats();

    window.scrollTo({ top: 0, behavior: "smooth" });

  } catch (error) {
    console.error("Login admin gagal:", error);

    const messages = {
      "auth/invalid-credential": "Email atau kata sandi Firebase salah.",
      "auth/invalid-email": "Format email tidak valid.",
      "auth/too-many-requests": "Terlalu banyak percobaan login. Coba lagi nanti.",
      "auth/network-request-failed": "Koneksi internet bermasalah.",
      "auth/operation-not-allowed": "Metode Email/Password belum diaktifkan di Firebase Authentication."
    };

    showLoginMessage(
      messages[error.code] || error.message || "Login admin gagal."
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Masuk ke panel admin";
    }
  }
}

// ============================================================
// LOGIN MAHASISWA - MODE LOKAL
// Ini belum melakukan validasi terhadap daftar Firestore.
// ============================================================


async function startExam() {
  // Selalu mulai sesi baru; jangan pulihkan sesi lama.
  localStorage.removeItem(DRAFT_KEY);

  currentUser = $("username")?.value.trim() || "";
  currentNim = $("student-nim")?.value.trim() || "";

  if (!currentUser || !currentNim) {
    showLoginMessage("Isi nama lengkap dan NIM terlebih dahulu.");
    return;
  }

  // Validasi nama, NIM, dan kelas dari Firebase.
  try {
    const db = window.firebaseServices?.db;

    if (!db) {
      throw new Error("Koneksi Firebase belum tersedia.");
    }

    const snapshot = await db
      .collection("daftar_mahasiswa")
      .where("nim", "==", currentNim)
      .limit(1)
      .get();

    if (snapshot.empty) {
      showLoginMessage("NIM tidak terdaftar. Periksa kembali NIM kamu.");
      return;
    }

    const mahasiswa = snapshot.docs[0].data();
    const namaTerdaftar = String(
      mahasiswa.nama || mahasiswa.name || ""
    ).trim();

    if (namaTerdaftar.toLowerCase() !== currentUser.toLowerCase()) {
      showLoginMessage("Nama tidak sesuai dengan NIM yang terdaftar.");
      return;
    }

    userClass = String(mahasiswa.kelas || "").trim();

    if (!userClass) {
      showLoginMessage("Kelas belum terdaftar. Hubungi administrator.");
      return;
    }
  } catch (error) {
    console.error("Validasi mahasiswa gagal:", error);
    showLoginMessage(
      "Gagal memeriksa data mahasiswa. Periksa koneksi Firebase."
    );
    return;
  }

  // Muat soal terlebih dahulu.
  const loaded = await loadQuestionsFromFirebase();

  if (!loaded || !Array.isArray(questions) || questions.length === 0) {
    return;
  }

  // Mulai ujian baru.
  currentIdx = 0;
  userAnswers = {};

  const settings = readAdminData("settings", {
    duration: 30,
    count: 20,
    pass: 70
  });

  timeLeft = Math.max(1, Number(settings.duration) || 30) * 60;
  tabViolationCount = 0;

  questionOrder = questions.map((_, i) => i);
  shuffleArray(questionOrder);

  shuffledOptions = {};

  questions.forEach((q, i) => {
    shuffledOptions[i] = q.options.map((opt, j) => ({
      text: opt,
      originalIndex: j
    }));

    shuffleArray(shuffledOptions[i]);
  });

  submitting = false;

  // Tampilkan halaman ujian.
  $("login-section")?.classList.add("hidden");
  $("result-section")?.classList.add("hidden");
  $("exam-section")?.classList.remove("hidden");

  if ($("display-name")) {
    $("display-name").textContent =
      `${currentUser} · ${currentNim} · Kelas ${userClass}`;
  }

  renderQuestion();
  renderNavigation();
  updateTimerDisplay();
  startTimer();
  persistDraft();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Blokir menu klik kanan pada area ujian
document.addEventListener("contextmenu", event => {
  if (isExamActive() && event.target.closest("#exam-section")) {
    event.preventDefault();
  }
});

// Blokir seleksi teks dengan mouse pada area ujian
document.addEventListener("selectstart", event => {
  if (isExamActive() && event.target.closest("#exam-section")) {
    event.preventDefault();
  }
});

// Blokir penyalinan melalui shortcut keyboard
document.addEventListener("keydown", event => {
  if (!isExamActive()) return;

  const key = event.key.toLowerCase();

  if (
    (event.ctrlKey || event.metaKey) &&
    ["c", "x"].includes(key)
  ) {
    if (event.target.closest("#exam-section")) {
      event.preventDefault();
    }
  }
});

// Blokir event salin pada area ujian
document.addEventListener("copy", event => {
  if (isExamActive() && event.target.closest("#exam-section")) {
    event.preventDefault();
  }
});

// ============================================================
// SOAL ACAK
// ============================================================

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function actualQuestionIndex(displayIndex) {
  return questionOrder[displayIndex] ?? displayIndex;
}

function renderQuestion() {
  const actualIdx = actualQuestionIndex(currentIdx);
  const q = questions[actualIdx];

  const options = shuffledOptions[actualIdx] ||
    q.options.map((text, originalIndex) => ({ text, originalIndex }));

  if ($("question-progress")) {
    $("question-progress").textContent =
      `SOAL ${currentIdx + 1} DARI ${questions.length}`;
  }

  if ($("question-container")) {
    $("question-container").innerHTML = `
      <div class="question-box">
        <span class="question-number">
          PERTANYAAN ${String(currentIdx + 1).padStart(2, "0")}
        </span>

        <p class="main-question">${escapeHtml(q.q)}</p>

        <div class="option-list">
          ${options.map((opt, i) => `
            <label class="option-item">
              <input
                type="radio"
                name="answer"
                value="${i}"
                ${userAnswers[actualIdx] === opt.text ? "checked" : ""}
                onchange="saveAnswer(${i})"
              >
              <span>${String.fromCharCode(65 + i)}. ${escapeHtml(opt.text)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }

  if ($("prev-question")) $("prev-question").disabled = currentIdx === 0;
  $("next-question")?.classList.toggle("hidden", currentIdx === questions.length - 1);
  $("submit-exam")?.classList.toggle("hidden", currentIdx !== questions.length - 1);

  renderNavigation();
}

function renderNavigation() {
  if (!$("question-nav")) return;

  $("question-nav").innerHTML = questions.map((_, displayIdx) => {
    const actual = actualQuestionIndex(displayIdx);

    return `
      <button
        type="button"
        class="${displayIdx === currentIdx ? "active" : ""} ${userAnswers[actual] !== undefined ? "answered" : ""}"
        aria-label="Soal ${displayIdx + 1}"
        onclick="goToQuestion(${displayIdx})"
      >
        ${displayIdx + 1}
      </button>
    `;
  }).join("");
}

function saveAnswer(optionIndex) {
  const actual = actualQuestionIndex(currentIdx);
  const option = (shuffledOptions[actual] || [])[optionIndex];

  if (!option) return;

  userAnswers[actual] = option.text;
  persistDraft();
  renderNavigation();
}

function changeQuestion(step) {
  currentIdx = Math.max(0, Math.min(questions.length - 1, currentIdx + step));
  renderQuestion();
}

function goToQuestion(index) {
  currentIdx = index;
  renderQuestion();
}

// ============================================================
// AUTOSAVE LOKAL
// ============================================================

function persistDraft() {
  const draft = {
    name: currentUser,
    nim: currentNim,
    class: userClass,
    currentIdx,
    answers: userAnswers,
    timeLeft,
    questionOrder,
    shuffledOptions,
    tabViolationCount,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn("Draf lokal tidak dapat disimpan.", error);
  }
}



async function resumeExamAfterRefresh() {
  // Sesi ujian tidak boleh dipulihkan setelah refresh.
  localStorage.removeItem(DRAFT_KEY);
}

function startAutosave() {
  clearInterval(autosaveTimer);
  persistDraft();
  autosaveTimer = setInterval(persistDraft, AUTOSAVE_INTERVAL_MS);
}

function startTimer() {
  clearInterval(timer);
  startAutosave();

  timer = setInterval(() => {
    if (timeLeft <= 0) {
      finishExam("Waktu habis");
      return;
    }

    timeLeft--;
    updateTimerDisplay();

    if (timeLeft % 5 === 0) persistDraft();
  }, 1000);
}

function updateTimerDisplay() {
  if (!$("timer")) return;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  $("timer").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  $("timer").style.color = timeLeft <= 60 ? "#c84b53" : "";
}

// ============================================================
// SELESAIKAN UJIAN - MODE LOKAL
// ============================================================

function submitExam() {
  const unanswered = questions.filter((_, i) => userAnswers[i] === undefined).length;

  const message = unanswered
    ? `Masih ada ${unanswered} soal belum dijawab. Tetap kumpulkan ujian?`
    : "Kumpulkan jawaban sekarang?";

  if (confirm(message)) finishExam("Selesai");
}

function finishExam(status) {
  if (submitting) return;

  submitting = true;
  clearInterval(timer);
  clearInterval(autosaveTimer);
  persistDraft();

  let correct = 0;

  questions.forEach((q, i) => {
    if (userAnswers[i] === q.a) correct++;
  });

  const score = Number(((correct / questions.length) * 100).toFixed(2));

  const record = {
    name: currentUser,
    nim: currentNim,
    class: userClass,
    score,
    status,
    date: new Date().toISOString(),
    correct,
    total: questions.length,
    answers: userAnswers,
    tabViolations: tabViolationCount
  };

  const history = readHistory();
  history.push(record);

  localStorage.setItem("cbt_unimed_results", JSON.stringify(history));
  localStorage.removeItem(DRAFT_KEY);

  $("exam-section")?.classList.add("hidden");
  $("result-section")?.classList.remove("hidden");

  if ($("score-summary")) {
    $("score-summary").innerHTML = `
      <div class="score-number">${score}</div>
      <p>Nilai lokal · ${correct} benar dari ${questions.length} soal</p>
      <p><strong>${escapeHtml(currentUser)}</strong> · ${escapeHtml(currentNim)} · Kelas ${escapeHtml(userClass)}</p>
      <p>Status: ${escapeHtml(status)}</p>
      <p>Waktu: ${new Date(record.date).toLocaleString("id-ID")}</p>
    `;
  }

  $("admin-content")?.classList.add("hidden");
  $("admin-login-area")?.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// REKAP NILAI
// ============================================================

function loadLeaderboard() {
  const history = readHistory().sort((a, b) => Number(b.score) - Number(a.score));

  if (!$("leaderboard-body")) return;

  $("leaderboard-body").innerHTML = history.length
    ? history.map((d, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(d.name || "")}</td>
          <td>${escapeHtml(d.nim || "-")}</td>
          <td>${escapeHtml(d.class || "")}</td>
          <td><strong>${Number(d.score || 0).toFixed(2)}</strong></td>
          <td>${escapeHtml(d.status || "")}</td>
          <td>${escapeHtml(d.date ? new Date(d.date).toLocaleString("id-ID") : "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7" style="text-align:center;padding:24px">Belum ada hasil lokal.</td></tr>`;
}

function downloadData() {
  const history = readHistory();

  if (!history.length) {
    alert("Belum ada data lokal untuk diunduh.");
    return;
  }

  const headers = ["No", "Nama", "NIM", "Kelas", "Nilai", "Status", "Waktu"];
  const rows = history.map((d, i) => [
    i + 1, d.name, d.nim, d.class, d.score, d.status, d.date
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n");

  downloadText(
    `Rekap_Ujian_${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv;charset=utf-8;"
  );
}

function clearAllData() {
  if (!confirm("Hapus seluruh hasil ujian lokal di browser ini?")) return;

  localStorage.removeItem("cbt_unimed_results");
  loadLeaderboard();
  alert("Hasil lokal di browser ini telah dihapus. Data Firebase tidak terpengaruh.");
}

// ============================================================
// LOGOUT ADMIN FIREBASE
// ============================================================

async function checkAdmin() {
  const email = $("admin-email")?.value.trim();
  const password = $("admin-pass")?.value;

  if (!email || !password) {
    showLoginMessage("Masukkan email dan kata sandi admin.");
    return;
  }

  const services = window.firebaseServices;

  if (
    !services?.auth ||
    !services?.signInWithEmailAndPassword
  ) {
    showLoginMessage(
      "Firebase belum terhubung. Periksa konfigurasi Firebase di index.html."
    );
    return;
  }

  const button = $("admin-form")?.querySelector(
    'button[type="submit"]'
  );

  const originalText = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = "Memeriksa akun...";
  }

  try {
    const credential =
      await services.signInWithEmailAndPassword(
        services.auth,
        email,
        password
      );

    // Paksa mengambil token terbaru agar custom claim admin diperiksa.
    const tokenResult = await credential.user.getIdTokenResult(true);

    if (tokenResult.claims.admin !== true) {
      await services.signOut(services.auth);

      authenticatedAdmin = null;

      showLoginMessage(
        "Akun berhasil masuk, tetapi belum memiliki hak admin."
      );

      return;
    }

    authenticatedAdmin = credential.user;

    $("login-section")?.classList.add("hidden");
    $("exam-section")?.classList.add("hidden");
    $("result-section")?.classList.remove("hidden");

    $("admin-login-area")?.classList.add("hidden");
    $("admin-content")?.classList.remove("hidden");

    $("logged-admin")?.replaceChildren(
      document.createTextNode(credential.user.email || email)
    );

    // Muat rekap demo lokal yang sudah ada.
    if (typeof loadLeaderboard === "function") {
      loadLeaderboard();
    }

    if (typeof showAdminTab === "function") {
      showAdminTab("overview");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });

  } catch (error) {
    console.error("Login admin gagal:", error);

    const messages = {
      "auth/invalid-credential":
        "Email atau kata sandi salah.",
      "auth/invalid-email":
        "Format email tidak valid.",
      "auth/user-not-found":
        "Akun admin tidak ditemukan di Firebase Authentication.",
      "auth/wrong-password":
        "Kata sandi salah.",
      "auth/too-many-requests":
        "Terlalu banyak percobaan login. Coba lagi nanti.",
      "auth/network-request-failed":
        "Koneksi internet bermasalah."
    };

    showLoginMessage(
      messages[error.code] ||
      "Login gagal: " + (error.message || "Kesalahan tidak diketahui.")
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Masuk ke panel admin";
    }
  }
}

function resetApp() {
  if (!confirm("Kembali ke halaman login?")) return;

  clearInterval(timer);
  clearInterval(autosaveTimer);

  $("result-section")?.classList.add("hidden");
  $("exam-section")?.classList.add("hidden");
  $("login-section")?.classList.remove("hidden");

  $("student-form")?.reset();
  $("admin-form")?.reset();

  setLoginMode("student");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLoginFromResult() {
  $("result-section")?.classList.add("hidden");
  $("login-section")?.classList.remove("hidden");
  $("admin-form")?.reset();
  setLoginMode("admin");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// UTILITAS HTML
// ============================================================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function csvEscape(value) {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

function downloadText(name, text, type) {
  const blob = new Blob(["\ufeff" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// ============================================================
// DETEKSI PERPINDAHAN TAB
// Peringatan pertama; pelanggaran kedua mengakhiri ujian.
// Browser tidak bisa sepenuhnya memblokir Google Lens atau HP kedua.
// ============================================================

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState !== "hidden" ||
    $("exam-section")?.classList.contains("hidden") ||
    submitting
  ) return;

  tabViolationCount++;
  persistDraft();

  if (tabViolationCount === 1) {
    alert("Peringatan 1 dari 2: jangan berpindah tab. Pelanggaran berikutnya akan mengakhiri ujian.");
  } else if (tabViolationCount >= MAX_TAB_VIOLATIONS) {
    alert("Batas perpindahan tab tercapai. Ujian akan diakhiri.");
    finishExam("Diakhiri: batas perpindahan tab tercapai");
  }
});


window.addEventListener("beforeunload", event => {
  if (!$("exam-section")?.classList.contains("hidden") && !submitting) {
    persistDraft();
    event.preventDefault();
    event.returnValue = "";
  }
});


/* ============================================================
   DETEKSI PELANGGARAN UJIAN
   ============================================================ */

let violationDialogOpen = false;
let ignoreNextVisibilityEvent = false;
let fullscreenViolationActive = false;

function examIsRunning() {
  return (
    !$("exam-section")?.classList.contains("hidden") &&
    !submitting
  );
}

function enterExamFullscreen() {
  if (document.fullscreenElement) {
    return Promise.resolve(true);
  }

  if (!document.documentElement.requestFullscreen) {
    console.warn("Browser tidak mendukung fullscreen.");
    return Promise.resolve(false);
  }

  return document.documentElement.requestFullscreen()
    .then(() => true)
    .catch(error => {
      console.warn("Fullscreen gagal diaktifkan:", error);
      return false;
    });
}

function handleExamViolation(reason) {
  if (!examIsRunning() || violationDialogOpen) return;

  violationDialogOpen = true;
  persistDraft();

  const message =
    reason === "fullscreen"
      ? "DILARANG KELUAR DARI MODE FULLSCREEN.\n\n" +
        "Jika memilih YA, jawaban akan dikirim dan ujian diakhiri.\n\n" +
        "Kirim jawaban sekarang?"
      : "DILARANG BERPINDAH TAB.\n\n" +
        "Jika memilih YA, jawaban akan dikirim dan ujian diakhiri.\n\n" +
        "Kirim jawaban sekarang?";

  const submitNow = window.confirm(message);
  violationDialogOpen = false;

  if (submitNow) {
    finishExam(
      reason === "fullscreen"
        ? "Diakhiri: keluar dari fullscreen"
        : "Diakhiri: berpindah tab"
    );
    return;
  }

  persistDraft();

  ignoreNextVisibilityEvent = true;
  window.setTimeout(() => {
    ignoreNextVisibilityEvent = false;
  }, 1000);
}

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState !== "hidden" ||
    !examIsRunning() ||
    violationDialogOpen ||
    ignoreNextVisibilityEvent
  ) {
    return;
  }

  handleExamViolation("tab");
});

document.addEventListener("fullscreenchange", () => {
  if (!examIsRunning() || violationDialogOpen) return;

  if (document.fullscreenElement) {
    fullscreenViolationActive = false;
    return;
  }

  if (fullscreenViolationActive) return;

  fullscreenViolationActive = true;
  handleExamViolation("fullscreen");
});

// ============================================================
// MANAJEMEN DATA ADMIN LOKAL
// ============================================================

const ADMIN_KEYS = {
  exams: "cbt_demo_exams",
  questions: "cbt_demo_questions",
  students: "cbt_demo_students",
  settings: "cbt_demo_settings"
};

function readAdminData(key, fallback = []) {
  try {
    return JSON.parse(
      localStorage.getItem(ADMIN_KEYS[key]) || JSON.stringify(fallback)
    );
  } catch {
    return fallback;
  }
}

function writeAdminData(key, value) {
  localStorage.setItem(ADMIN_KEYS[key], JSON.stringify(value));
}

function showAdminTab(tab, button) {
  document.querySelectorAll(".admin-view").forEach(v => v.classList.add("hidden"));

  const view = $("admin-view-" + tab);
  if (view) view.classList.remove("hidden");

  document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));

  if (button) {
    button.classList.add("active");
  } else {
    const match = [...document.querySelectorAll(".admin-tab")].find(b =>
      b.getAttribute("onclick")?.includes("'" + tab + "'")
    );
    match?.classList.add("active");
  }

  if (tab === "overview") refreshAdminStats();
  if (tab === "exams") renderExams();
  if (tab === "questions") renderAdminQuestions();
  if (tab === "students") renderStudents();
  if (tab === "results") loadLeaderboard();
}



async function refreshAdminStats() {
  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;

  if (!db || !auth?.currentUser) {
    console.error("Firebase atau sesi admin belum tersedia.");
    return;
  }

  const collections = [
    { name: "ujian", element: "stat-exams" },
    { name: "bank_soal", element: "stat-questions" },
    { name: "daftar_mahasiswa", element: "stat-students" },
    { name: "exam_results", element: "stat-results" }
  ];

  for (const item of collections) {
    try {
      const snapshot = await db.collection(item.name).get();
      const element = $(item.element);

      if (element) {
        element.textContent = snapshot.size;
      }

      console.log(
        `[Statistik] ${item.name}: ${snapshot.size} dokumen`
      );
    } catch (error) {
      console.error(
        `[Statistik] Gagal membaca ${item.name}:`,
        error.code,
        error.message
      );
    }
  }
}



// ============================================================
// MANAJEMEN UJIAN
// ============================================================


async function saveExam(event) {
  event.preventDefault();

  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;

  if (!db || !auth?.currentUser) {
    alert("Firebase belum terhubung atau admin belum login.");
    return;
  }

  const id = $("exam-edit-id").value || ("exam_" + Date.now());

  const item = {
    title: $("exam-title").value.trim(),
    kelas: $("exam-class").value.trim(),
    duration: Math.max(1, Number($("exam-duration").value) || 45),
    start: $("exam-start").value,
    end: $("exam-end").value,
    count: Math.max(1, Number($("exam-count").value) || 30),
    status: $("exam-status").value,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!item.title || !item.kelas) {
    alert("Judul ujian dan kelas wajib diisi.");
    return;
  }

  try {
    const token = await auth.currentUser.getIdTokenResult(true);

    if (token.claims.admin !== true) {
      alert("Akun ini tidak memiliki hak admin.");
      return;
    }

    await db.collection("ujian").doc(id).set(item, { merge: true });

    alert("Ujian berhasil disimpan ke Firestore.");

    resetExamForm();
    await renderExams();
    await refreshAdminStats();

  } catch (error) {
    console.error("Gagal menyimpan ujian:", error);

    alert(
      "Ujian gagal disimpan ke Firestore.\n" +
      (error.message || "Periksa koneksi dan izin Firebase.")
    );
  }
}

async function renderExams() {
  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;
  const body = $("exam-list-body");

  if (!body) return;

  if (!db || !auth?.currentUser) {
    body.innerHTML =
      '<tr><td colspan="7">Firebase atau sesi admin belum tersedia.</td></tr>';
    return;
  }

  try {
    const token = await auth.currentUser.getIdTokenResult();

    if (token.claims.admin !== true) {
      throw new Error("Akun tidak memiliki hak admin.");
    }

    const snapshot = await db.collection("ujian").get();

    const exams = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    body.innerHTML = exams.length
      ? exams.map(x => `
          <tr>
            <td>${escapeHtml(x.title || "")}</td>
            <td>${escapeHtml(x.kelas || "")}</td>
            <td>${Number(x.duration) || 45} menit</td>
            <td>${Number(x.count) || 30}</td>
            <td>${escapeHtml(x.start || "-")}</td>
            <td>${escapeHtml(x.status || "-")}</td>
            <td>
              <button
                type="button"
                class="btn-secondary small-btn"
                onclick="editExam('${x.id}')">
                Edit
              </button>
              <button
                type="button"
                class="btn-danger small-btn"
                onclick="deleteExam('${x.id}')">
                Hapus
              </button>
            </td>
          </tr>
        `).join("")
      : '<tr><td colspan="7"><div class="admin-empty">Belum ada ujian.</div></td></tr>';

  } catch (error) {
    console.error("Gagal memuat daftar ujian:", error);
    body.innerHTML =
      '<tr><td colspan="7">Gagal memuat ujian. Periksa izin Firestore.</td></tr>';
  }
}

async function editExam(id) {
  const db = window.firebaseServices?.db;
  if (!db) return;

  try {
    const doc = await db.collection("ujian").doc(id).get();

    if (!doc.exists) {
      alert("Data ujian tidak ditemukan.");
      return;
    }

    const x = doc.data();

    $("exam-edit-id").value = doc.id;
    $("exam-title").value = x.title || "";
    $("exam-class").value = x.kelas || "";
    $("exam-duration").value = x.duration || 45;
    $("exam-start").value = x.start || "";
    $("exam-end").value = x.end || "";
    $("exam-count").value = x.count || 30;
    $("exam-status").value = x.status || "Aktif";

    if ($("exam-form-title")) {
      $("exam-form-title").textContent = "Edit ujian";
    }

    $("exam-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    console.error("Gagal membuka ujian:", error);
    alert("Gagal membuka data ujian. Periksa izin Firestore.");
  }
}

async function deleteExam(id) {
  if (!confirm("Hapus ujian ini dari Firestore?")) return;

  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;

  if (!db || !auth?.currentUser) {
    alert("Admin belum login.");
    return;
  }

  try {
    const token = await auth.currentUser.getIdTokenResult();

    if (token.claims.admin !== true) {
      throw new Error("Akun tidak memiliki hak admin.");
    }

    await db.collection("ujian").doc(id).delete();

    alert("Ujian berhasil dihapus.");
    await renderExams();
    await refreshAdminStats();

  } catch (error) {
    console.error("Gagal menghapus ujian:", error);
    alert("Gagal menghapus ujian: " + error.message);
  }
}


function resetExamForm() {
  $("exam-form")?.reset();

  if ($("exam-edit-id")) {
    $("exam-edit-id").value = "";
  }

  const settings = readAdminData("settings", {
    duration: 30,
    count: 20,
    pass: 70
  });

  if ($("exam-duration")) {
    $("exam-duration").value = settings.duration ?? 30;
  }

  if ($("exam-count")) {
    $("exam-count").value = settings.count ?? 20;
  }

  if ($("exam-form-title")) {
    $("exam-form-title").textContent = "Buat ujian baru";
  }
}

// ============================================================
// BANK SOAL
// ============================================================

function saveQuestion(event) {
  event.preventDefault();

  const list = readAdminData("questions", []);

  list.push({
    id: "q_" + Date.now(),
    question: $("question-text").value.trim(),
    options: ["a", "b", "c", "d", "e"].map(k => $("option-" + k).value.trim()),
    answer: $("question-answer").value,
    points: Math.max(1, Number($("question-points").value) || 1)
  });

  writeAdminData("questions", list);
  event.target.reset();
  renderAdminQuestions();
  refreshAdminStats();

  alert("Soal ditambahkan ke bank soal lokal.");
}

async function renderAdminQuestions() {
  const listElement = $("question-list");
  const countElement = $("question-count-label");

  if (!listElement) return;

  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;

  if (!db || !auth?.currentUser) {
    listElement.innerHTML =
      '<div class="admin-empty">Admin belum terhubung ke Firebase.</div>';
    return;
  }

  try {
    const token = await auth.currentUser.getIdTokenResult();

    if (token.claims.admin !== true) {
      throw new Error("Akun tidak memiliki hak admin.");
    }

    listElement.innerHTML =
      '<div class="admin-empty">Memuat bank soal dari Firebase...</div>';

    const snapshot = await db.collection("bank_soal").get();

    const list = snapshot.docs.map(function(doc) {
      const data = doc.data();

      const rawOptions = data.options || data.pilihan || [];
      const options = Array.isArray(rawOptions)
        ? rawOptions
        : Object.values(rawOptions);

      const answer = String(
        data.answer || data.menjawab || data.jawaban || ""
      ).trim();

      return {
        id: doc.id,
        question: data.question || data.pertanyaan || data.q || "",
        options: options,
        answer: answer,
        points: Number(data.points ?? data.poin ?? 1)
      };
    }).filter(function(q) {
      return q.question && q.options.length >= 2;
    });

    if (countElement) {
      countElement.textContent = list.length;
    }

    if (list.length === 0) {
      listElement.innerHTML =
        '<div class="admin-empty">Belum ada soal di Firestore.</div>';
      return;
    }


listElement.innerHTML = list.map(function(q, i) {
  return `
    <article class="question-admin-item">
      <strong>${i + 1}. ${escapeHtml(q.question)}</strong>

      <small>
        Kunci: ${escapeHtml(q.answer || "-")}
        · Skor: ${q.points}
      </small>

      <div style="margin-top: 12px;">
        <button
          type="button"
          class="btn-danger small-btn"
          onclick="deleteQuestion('${q.id}')">
          Hapus soal
        </button>
      </div>
    </article>
  `;
}).join("");


    console.log(
      "Jumlah soal yang dibaca dari Firestore:",
      list.length
    );

  } catch (error) {
    console.error("Gagal memuat bank soal:", error);

    listElement.innerHTML =
      '<div class="admin-empty">Gagal memuat bank soal: ' +
      escapeHtml(error.message) +
      '</div>';
  }
}


async function deleteQuestion(id) {
  const confirmed = confirm(
    "Yakin ingin menghapus soal ini dari Firebase?"
  );

  if (!confirmed) return;

  const db = window.firebaseServices?.db;
  const auth = window.firebaseServices?.auth;

  if (!db || !auth?.currentUser) {
    alert("Firebase belum terhubung atau admin belum login.");
    return;
  }

  try {
    const token = await auth.currentUser.getIdTokenResult();

    if (token.claims.admin !== true) {
      alert("Akun ini tidak memiliki hak admin.");
      return;
    }

    await db.collection("bank_soal").doc(id).delete();

    alert("Soal berhasil dihapus dari Firebase.");

    await renderAdminQuestions();

    if (typeof refreshAdminStats === "function") {
      refreshAdminStats();
    }
  } catch (error) {
    console.error("Gagal menghapus soal:", error);
    alert("Gagal menghapus soal: " + error.message);
  }
}


// ============================================================
// PARSER CSV
// Format mahasiswa: name,nim,kelas
// Format soal: question,optionA,optionB,optionC,optionD,optionE,answer,points
// ============================================================

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];

  const parseLine = line => {
    const output = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && line[i + 1] === '"' && quoted) {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        output.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    output.push(current.trim());
    return output;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());

  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const object = {};

    headers.forEach((header, index) => {
      object[header] = values[index] || "";
    });

    return object;
  });
}

// ============================================================
// IMPOR MAHASISWA CSV
// ============================================================

async function importStudentsCsv() {
  const file = $("student-csv")?.files[0];

  if (!file) {
    alert("Pilih file CSV mahasiswa terlebih dahulu.");
    return;
  }

  const services = window.firebaseServices;
  const user = services?.auth?.currentUser;

  if (!services?.db || !user) {
    alert("Firebase belum terhubung atau admin belum login.");
    return;
  }

  try {
    // Pastikan token terbaru dan periksa hak admin.
    const tokenResult = await user.getIdTokenResult(true);

    if (tokenResult.claims.admin !== true) {
      alert("Akses ditolak. Akun belum memiliki hak admin.");
      return;
    }

    const rows = parseCsv(await file.text());

    if (!rows.length) {
      alert("CSV kosong atau tidak memiliki data mahasiswa.");
      return;
    }

    const students = new Map();
    let skipped = 0;

    for (const row of rows) {
      const name = String(row.name || row.nama || "").trim();
      const nim = String(row.nim || "").trim();
      const kelas = String(row.kelas || row.class || "").trim();

      if (!name || !/^\d+$/.test(nim) || !kelas) {
        skipped++;
        continue;
      }

      // NIM menjadi ID dokumen agar tidak membuat duplikat.
      students.set(nim, { name, nim, kelas });
    }

    if (students.size === 0) {
      alert("Tidak ada data valid. Periksa kolom name,nim,kelas.");
      return;
    }

    const db = services.db;
    const entries = [...students.entries()];

    // Firestore batch mendukung maksimal 500 operasi.
    // Pecah menjadi beberapa batch agar aman untuk CSV besar.
    let saved = 0;

    for (let i = 0; i < entries.length; i += 450) {
      const batch = db.batch();
      const chunk = entries.slice(i, i + 450);

      for (const [nim, student] of chunk) {
        const ref = db.collection("daftar_mahasiswa").doc(nim);

        batch.set(ref, {
          ...student,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      saved += chunk.length;
    }

    alert(
      `Impor Firebase berhasil.\n` +
      `Data tersimpan/diperbarui: ${saved}\n` +
      `Baris dilewati: ${skipped}\n\n` +
      `Data sudah dikirim ke Firestore.`
    );

    // Muat ulang daftar dari Firebase pada langkah integrasi berikutnya.
    console.log("Impor mahasiswa ke Firestore berhasil:", saved);

  } catch (error) {
    console.error("Impor mahasiswa ke Firestore gagal:", error.code, error.message);

    if (error.code === "permission-denied") {
      alert(
        "Firebase menolak penulisan. Pastikan admin memiliki claim admin: true " +
        "dan Rules Firestore sudah benar."
      );
    } else {
      alert("Impor gagal: " + (error.message || "Kesalahan tidak diketahui."));
    }
  }
}


async function saveStudent(event) {
  event.preventDefault();

  const name = $("student-name-admin").value.trim();
  const nim = $("student-nim-admin").value.trim();
  const kelas = $("student-class-admin").value.trim();

  if (!name || !/^\d+$/.test(nim) || !kelas) {
    alert("Isi nama, NIM angka, dan kelas.");
    return;
  }

  try {
    const user = firebase.auth().currentUser;

    if (!user) {
      alert("Silakan login sebagai admin terlebih dahulu.");
      return;
    }

    const token = await user.getIdTokenResult();

    if (token.claims.admin !== true) {
      alert("Akun ini tidak memiliki hak admin.");
      return;
    }

    const db = firebase.firestore();
    const studentRef = db.collection("daftar_mahasiswa").doc(nim);

    await studentRef.set({
      nama: name,
      nim: nim,
      kelas: kelas,
      diperbaruiPada:
        firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    event.target.reset();

    await renderStudents();

    if (typeof refreshAdminStats === "function") {
      await refreshAdminStats();
    }

    alert("Data mahasiswa berhasil disimpan ke Firebase.");

  } catch (error) {
    console.error("Gagal menyimpan mahasiswa:", error);

    alert(
      "Gagal menyimpan mahasiswa ke Firebase: " +
      error.message
    );
  }
}

async function renderStudents() {
  const tbody = $("student-list-body");
  const countLabel = $("student-count-label");

  if (!tbody) return;

  try {
    const user = firebase.auth().currentUser;

    if (!user) {
      tbody.innerHTML =
        '<tr><td colspan="4">Admin belum login.</td></tr>';
      return;
    }

    const token = await user.getIdTokenResult();

    if (token.claims.admin !== true) {
      throw new Error("Akun tidak memiliki hak admin.");
    }

    tbody.innerHTML =
      '<tr><td colspan="4">Memuat data mahasiswa...</td></tr>';

    const snapshot = await firebase.firestore()
      .collection("daftar_mahasiswa")
      .get();

    const students = snapshot.docs.map(function(doc) {
      const data = doc.data();

      return {
        name: data.nama || data.name || "",
        nim: String(data.nim || doc.id),
        kelas: data.kelas || ""
      };
    });

    if (countLabel) {
      countLabel.textContent = students.length;
    }

    if (students.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4"><div class="admin-empty">Belum ada mahasiswa.</div></td></tr>';
      return;
    }

    tbody.innerHTML = students.map(function(s) {
      return '<tr>' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td>' + escapeHtml(s.nim) + '</td>' +
        '<td>' + escapeHtml(s.kelas) + '</td>' +
        '<td><button class="btn-danger small-btn" onclick="deleteStudent(\'' +
        escapeHtml(s.nim) + '\')">Hapus</button></td>' +
        '</tr>';
    }).join("");

  } catch (error) {
    console.error("Gagal memuat mahasiswa:", error);

    if (countLabel) countLabel.textContent = "—";

    tbody.innerHTML =
      '<tr><td colspan="4"><div class="admin-empty">Gagal memuat data mahasiswa: ' +
      escapeHtml(error.message) +
      '</div></td></tr>';
  }
}

function deleteStudent(nim) {
  if (!confirm("Hapus mahasiswa ini dari daftar lokal?")) return;

  writeAdminData(
    "students",
    readAdminData("students").filter(s => String(s.nim) !== String(nim))
  );

  renderStudents();
  refreshAdminStats();
}

function downloadStudentTemplate() {
  const csv = [
    "name,nim,kelas",
    "Leo Michel,5243230041,B",
    "Nama Contoh,5243530002,XI IPA 1"
  ].join("\r\n");

  downloadText("template_mahasiswa.csv", csv, "text/csv;charset=utf-8;");
}

function downloadStudentsCsv() {
  const list = readAdminData("students");

  if (!list.length) {
    alert("Belum ada mahasiswa untuk diekspor.");
    return;
  }

  const csv = [
    ["name", "nim", "kelas"],
    ...list.map(s => [s.name, s.nim, s.kelas])
  ].map(row => row.map(csvEscape).join(",")).join("\r\n");

  downloadText("mahasiswa.csv", csv, "text/csv;charset=utf-8;");
}

// ============================================================
// IMPOR BANK SOAL CSV
// ============================================================


async function importQuestionsCsv() {
  const file = $("question-csv")?.files[0];

  if (!file) {
    alert("Pilih file CSV soal terlebih dahulu.");
    return;
  }

  const services = window.firebaseServices;
  const user = services?.auth?.currentUser;

  if (!services?.db || !user) {
    alert("Firebase belum terhubung atau admin belum login.");
    return;
  }

  try {
    // Periksa hak admin menggunakan token terbaru.
    const tokenResult = await user.getIdTokenResult(true);

    if (tokenResult.claims.admin !== true) {
      alert("Akses ditolak. Akun belum memiliki hak admin.");
      return;
    }

    const rows = parseCsv(await file.text());

    if (!rows.length) {
      alert("CSV kosong atau tidak memiliki data soal.");
      return;
    }

    const questionsToSave = [];
    let skipped = 0;

    for (const row of rows) {
      const question = String(
        row.question || row.pertanyaan || ""
      ).trim();

      const options = [
        row.optiona || row.a,
        row.optionb || row.b,
        row.optionc || row.c,
        row.optiond || row.d,
        row.optione || row.e
      ].map(value => String(value || "").trim());

      const answer = String(
        row.answer || row.jawaban || ""
      ).trim().toUpperCase();

      if (
        !question ||
        options.some(option => !option) ||
        !["A", "B", "C", "D", "E"].includes(answer)
      ) {
        skipped++;
        continue;
      }

      questionsToSave.push({
        id: "q_" + Date.now() + "_" + questionsToSave.length,
        question,
        options,
        answer,
        points: Math.max(
          1,
          Number(row.points || row.skor) || 1
        )
      });
    }

    if (questionsToSave.length === 0) {
      alert(
        "Tidak ada soal valid. Periksa kolom question, " +
        "optionA sampai optionE, answer, dan points."
      );
      return;
    }

    const db = services.db;
    let saved = 0;

    // Maksimal 450 operasi per batch.
    for (let i = 0; i < questionsToSave.length; i += 450) {
      const batch = db.batch();
      const chunk = questionsToSave.slice(i, i + 450);

      for (const question of chunk) {
        const ref = db.collection("bank_soal").doc(question.id);

        batch.set(ref, {
          ...question,
          updatedAt:
            firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      saved += chunk.length;
    }

    // Perbarui data lokal hanya setelah penyimpanan Firebase berhasil.
    const localList = readAdminData("questions", []);
    writeAdminData("questions", [
      ...localList,
      ...questionsToSave
    ]);

    renderAdminQuestions();
    refreshAdminStats();

    alert(
      `Impor bank soal ke Firebase berhasil.\n` +
      `Soal tersimpan: ${saved}\n` +
      `Baris dilewati: ${skipped}\n\n` +
      `Data telah dikirim ke Firestore.`
    );

    console.log("Impor bank soal berhasil:", saved);

  } catch (error) {
    console.error(
      "Impor bank soal gagal:",
      error.code,
      error.message
    );

    if (error.code === "permission-denied") {
      alert(
        "Firebase menolak penyimpanan. Pastikan akun memiliki " +
        "claim admin: true dan Rules Firestore mengizinkan penulisan."
      );
    } else {
      alert(
        "Impor soal gagal: " +
        (error.message || "Kesalahan tidak diketahui.")
      );
    }
  }
}

function downloadQuestionsCsv() {
  const list = readAdminData("questions", []);

  if (!list.length) {
    alert("Belum ada soal buatan admin untuk diekspor.");
    return;
  }

  const rows = [
    ["question", "optionA", "optionB", "optionC", "optionD", "optionE", "answer", "points"],
    ...list.map(q => [q.question, ...(q.options || []), q.answer, q.points])
  ];

  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");

  downloadText("bank_soal.csv", csv, "text/csv;charset=utf-8;");
}

// ============================================================
// PENGATURAN UJIAN
// ============================================================

function saveSettings(event) {
  event.preventDefault();

  const settings = {
    duration: Math.max(1, Number($("default-duration").value) || 30),
    count: Math.max(1, Number($("default-questions").value) || 20),
    pass: Math.min(100, Math.max(0, Number($("pass-score").value) || 70))
  };

  writeAdminData("settings", settings);
  resetExamForm();

  alert("Pengaturan tersimpan di browser ini, belum ke Firestore.");
}


/* ============================================================
   PEMULIHAN OTOMATIS SETELAH REFRESH
   ============================================================ */

async function autoResumeSavedExam() {
  const examSection = $("exam-section");

  // Jangan menimpa sesi yang sedang berjalan.
  if (
    !examSection ||
    !examSection.classList.contains("hidden")
  ) {
    return;
  }

  let draft;

  try {
    draft = JSON.parse(
      localStorage.getItem(DRAFT_KEY) || "null"
    );
  } catch (error) {
    console.error("Gagal membaca sesi ujian:", error);
    return;
  }

  if (
    !draft ||
    !draft.name ||
    !draft.nim ||
    !draft.class ||
    !Array.isArray(draft.questionOrder) ||
    !draft.questionOrder.length ||
    Number(draft.timeLeft) <= 0
  ) {
    return;
  }
}

/* =========================================================
   TAMPILAN AWAL HALAMAN
   Halaman baru selalu dimulai dari login.
   Tidak memulihkan sesi ujian sebelumnya.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const loginSection = document.getElementById("login-section");
  const examSection = document.getElementById("exam-section");
  const resultSection = document.getElementById("result-section");

  // Jangan mengubah tampilan jika elemen utama tidak ditemukan.
  if (!loginSection || !examSection || !resultSection) {
    console.error("Elemen utama halaman tidak ditemukan.");
    return;
  }

  // Tampilkan login; sembunyikan ruang ujian dan hasil.
  loginSection.classList.remove("hidden");
  examSection.classList.add("hidden");
  resultSection.classList.add("hidden");

  // Hapus draf agar tidak ada sesi lama yang dipulihkan.
  localStorage.removeItem(
    typeof DRAFT_KEY !== "undefined"
      ? DRAFT_KEY
      : "cbt_unimed_active_draft"
  );
});
