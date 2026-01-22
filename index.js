const fs = require("fs");
const path = require("path");
const express = require("express");
const { google } = require("googleapis");
const { leerFacturas } = require("./gmailReader");

const app = express();

// ================================
// SERVIR CARPETA FACTURAS
// ================================
app.use(
  "/facturas",
  express.static(path.join(__dirname, "facturas"))
);


// ================================
// CONFIG
// ================================
const PORT = 3000;
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly"
];

// ================================
// OAUTH CLIENT
// ================================
function getOAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.web;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
}

// ================================
// AUTORIZAR
// ================================
app.get("/", (req, res) => {
  const oAuth2Client = getOAuthClient();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });

  res.redirect(authUrl);
});

// ================================
// CALLBACK
// ================================
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const oAuth2Client = getOAuthClient();

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  res.send("✅ Gmail autorizado correctamente. Puedes cerrar esta ventana.");
  console.log("✅ Token guardado en token.json");

  await leerFacturas();
});



// ================================
// API – LISTAR FACTURAS
// ================================
app.get("/api/facturas", (req, res) => {
  const FACTURAS_DIR = path.join(__dirname, "facturas");

  if (!fs.existsSync(FACTURAS_DIR)) {
    return res.json([]);
  }

  const archivos = fs.readdirSync(FACTURAS_DIR, { recursive: true });

  const facturas = archivos
    .filter(a => a.endsWith(".xml"))
    .map(xml => {
      const base = path.basename(xml, ".xml");
      const dir = path.dirname(xml);

      const pdfPath = path.join(FACTURAS_DIR, dir, `${base}.pdf`);

      return {
        id: base,
        xml: `/facturas/${xml.replace(/\\/g, "/")}`,
        pdf: fs.existsSync(pdfPath)
          ? `/facturas/${path.join(dir, `${base}.pdf`).replace(/\\/g, "/")}`
          : null
      };
    });

  res.json(facturas);
});



// ================================
// SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);

  if (fs.existsSync(TOKEN_PATH)) {
    console.log("🔑 Token existente, leyendo facturas...");
    leerFacturas()
      .then(() => console.log("✔ Proceso finalizado"))
      .catch(err => console.error("❌ Error:", err.message));
  } else {
    console.log("👉 Abre el navegador para autorizar Gmail");
  }
});

const cors = require("cors");
app.use(cors());
