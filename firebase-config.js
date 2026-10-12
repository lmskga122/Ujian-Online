
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCJVo3mIRQ-mtu_8ksRevBpn2P5NGdLX18",
    authDomain: "website-sistem-ujian-online.firebaseapp.com",
    projectId: "website-sistem-ujian-online",
    storageBucket: "website-sistem-ujian-online.firebasestorage.app",
    messagingSenderId: "766905942729",
    appId: "1:766905942729:web:2ebbd79bbb7d3affe8c318"
  };

  try {
    if (!window.firebase) {
      throw new Error(
        "Firebase SDK belum dimuat. Periksa script di index.html."
      );
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    // Pastikan SDK Authentication dan Firestore tersedia.
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Satu objek layanan untuk digunakan script.js.
    window.firebaseServices = {
      auth: auth,
      db: db,

      signInWithEmailAndPassword: function (
        authInstance,
        email,
        password
      ) {
        return authInstance.signInWithEmailAndPassword(
          email,
          password
        );
      },

      signOut: function (authInstance) {
        return authInstance.signOut();
      }
    };

    console.log(
      "[Firebase] Project:",
      firebase.app().options.projectId
    );
    console.log("[Firebase] Authentication siap:", !!auth);
    console.log("[Firebase] Firestore siap:", !!db);
  } catch (error) {
    console.error("[Firebase] Inisialisasi gagal:", error);
  }
})();
