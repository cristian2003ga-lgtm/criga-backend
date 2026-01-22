const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { google } = require("googleapis");

// ================================
// PATHS
// ================================
const BASE_DIR = __dirname;
const ZIP_DIR = path.join(BASE_DIR, "facturas/zip");
const EXTRACT_DIR = path.join(BASE_DIR, "facturas/extraidas");
const TOKEN_PATH = path.join(BASE_DIR, "token.json");

[ZIP_DIR, EXTRACT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ================================
// GMAIL CLIENT
// ================================
function getGmailClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("❌ token.json no existe. Autoriza Gmail primero.");
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));

  return google.gmail({ version: "v1", auth });
}

// ================================
// VALIDAR ASUNTO DIAN
// ================================
function esFacturaDian(subject) {
  return subject.split(";").length >= 6;
}

// ================================
// DESCARGAR ADJUNTO
// ================================
async function descargarAdjunto(gmail, messageId, attachmentId, filename, destino) {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId
  });

  const buffer = Buffer.from(
    res.data.data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  const filePath = path.join(destino, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ================================
// EXTRAER ZIP
// ================================
async function extraerZip(zipPath) {
  const archivos = [];

  await fs.createReadStream(zipPath)
    .pipe(unzipper.Parse())
    .on("entry", entry => {
      const nombre = entry.path.toLowerCase();
      if (nombre.endsWith(".pdf") || nombre.endsWith(".xml")) {
        const destino = path.join(EXTRACT_DIR, entry.path);
        entry.pipe(fs.createWriteStream(destino));
        archivos.push(destino);
      } else {
        entry.autodrain();
      }
    })
    .promise();

  return archivos;
}

// ================================
// MAIN
// ================================
async function leerFacturas() {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.list({
    userId: "me",
    q: "has:attachment"
  });

  for (const msg of res.data.messages || []) {
    const detalle = await gmail.users.messages.get({
      userId: "me",
      id: msg.id
    });

    const subject =
      detalle.data.payload.headers.find(h => h.name === "Subject")?.value || "";

    if (!esFacturaDian(subject)) continue;

    console.log("\n🧾 FACTURA DETECTADA");
    console.log("Asunto:", subject);

    const parts = detalle.data.payload.parts || [];

    for (const part of parts) {
      if (!part.filename?.toLowerCase().endsWith(".zip")) continue;

      const zipPath = await descargarAdjunto(
        gmail,
        msg.id,
        part.body.attachmentId,
        part.filename,
        ZIP_DIR
      );

      console.log("📦 ZIP descargado:", zipPath);

      const archivos = await extraerZip(zipPath);

      const pdf = archivos.find(f => f.endsWith(".pdf"));
      const xml = archivos.find(f => f.endsWith(".xml"));

      if (pdf && xml) {
        console.log("✅ PDF y XML extraídos");
        console.log("PDF:", pdf);
        console.log("XML:", xml);
      } else {
        console.log("⚠️ ZIP no contiene PDF y XML válidos");
      }
    }
  }
}

module.exports = { leerFacturas };
