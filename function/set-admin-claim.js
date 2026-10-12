const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp({
  credential: applicationDefault(),
  projectId: "website-sistem-ujian-online"
});

async function main() {
  const uid = process.argv[2];

  if (!uid) {
    throw new Error("UID admin wajib diberikan.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);

  if ((user.email || "").toLowerCase() !== "admin@gmail.com") {
    throw new Error(
      "Email UID tidak cocok dengan admin@gmail.com. Hak admin tidak diubah."
    );
  }

  const existingClaims = user.customClaims || {};

  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    admin: true
  });

  console.log("Hak admin berhasil diberikan.");
  console.log("Email:", user.email);
  console.log("UID:", user.uid);
  console.log("Claim admin: true");
  console.log("Silakan logout lalu login kembali.");
}

main().catch((error) => {
  console.error("Gagal menetapkan hak admin:", error.message);
  process.exit(1);
});
