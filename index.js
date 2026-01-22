const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { leerFacturas } = require("./gmailReader");

const app = express();

/* ================================
   CORS
================================ */
app.use(cors());

/* ================================
   SERVIR FACTURAS
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
   OAUTH CLIENT (ENV)
================================ */
function getOAuthClient() {
  const { 
    GMAIL_CLIENT_ID, 
    GMAIL_CLIENT_SECRET, 
    GMAIL_REDIRECT_URI 
  } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REDIRECT_URI) {
    throw new Error("Faltan variables de entorno de Gmail OAuth");
  }

  return new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
}

/* ================================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("✅ CRIGA Backend activo");
});

/* ================================
   AUTORIZAR GMAIL
================================ */
app.get("/auth/gmail", (req, res) => {
  try {
    const oAuth2Client = getOAuthClient();

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    });

    res.redirect(authUrl);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Error iniciando OAuth Gmail");
  }
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

    console.log("✅ Gmail autorizado correctamente");
    await leerFacturas(oAuth2Client);

    res.send("✅ Gmail autorizado y facturas procesadas. Puedes cerrar esta ventana.");
  } catch (error) {
    console.error("❌ Error OAuth:", error);
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
  console.log(`🚀 CRIGA Backend activo en puerto ${PORT}`);
});
