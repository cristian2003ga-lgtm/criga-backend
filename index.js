const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { leerFacturas } = require("./gmailReader");

const app = express();

/* ================================
   CORS (DEBE IR ARRIBA)
================================ */
app.use(cors());

/* ================================
   SERVIR CARPETA FACTURAS
================================ */
app.use(
  "/facturas",
  express.static(path.join(__dirname, "facturas"))
);

/* ================================
   CONFIG
================================ */
const PORT = process.env.PORT || 3000;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly"
];

/* ================================
   OAUTH CLIENT (ENV VARIABLES)
================================ */
function getOAuthClient() {
  const client_id = process.env.GMAIL_CLIENT_ID;
  const client_secret = process.env.GMAIL_CLIENT_SECRET;
  const redirect_uri = process.env.GMAIL_REDIRECT_URI;

  if (!client_id || !client_secret || !redirect_uri) {
    throw new Error("❌ Faltan variables de entorno de Gmail OAuth");
  }

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uri
  );
}

/* ================================
   AUTORIZAR GMAIL
================================ */
app.get("/", (req, res) => {
  const oAuth2Client = getOAuthClient();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });

  res.redirect(authUrl);
});

/* ================================
   CALLBACK GMAIL
================================ */
app.get("/oauth2callback", async (req, res) => {
  try {
    const code = req.query.code;
    const oAuth2Client = getOAuthClient();

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    res.send("✅ Gmail autorizado correctamente. Ya puedes cerrar esta ventana.");
    console.log("✅ Gmail autorizado, leyendo facturas...");

    await leerFacturas(oAuth2Client);

  } catch (error) {
    console.error("❌ Error OAuth:", error.message);
    res.status(500).send("Error autorizando Gmail");
  }
});

/* ================================
   API – LISTAR FACTURAS
================================ */
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

/* ================================
   SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});
