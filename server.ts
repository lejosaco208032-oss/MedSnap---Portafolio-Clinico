import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

// --- API Routes ---

// Get Google OAuth URL
app.get("/api/auth/google/url", (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ url });
});

// OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // Store tokens in a secure cookie
    res.cookie('google_tokens', JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticación exitosa. Esta ventana se cerrará automáticamente.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Error de autenticación");
  }
});

// Check connection status
app.get("/api/drive/status", (req, res) => {
  const tokens = req.cookies.google_tokens;
  res.json({ connected: !!tokens });
});

// List folders in Drive
app.get("/api/drive/folders", async (req, res) => {
  const tokensCookie = req.cookies.google_tokens;
  if (!tokensCookie) return res.status(401).json({ error: "No conectado" });

  const tokens = JSON.parse(tokensCookie);
  oauth2Client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    res.json({ folders: response.data.files });
  } catch (error) {
    res.status(500).json({ error: "Error al listar carpetas" });
  }
});

// List sync files in a folder
app.get("/api/drive/files/:folderId", async (req, res) => {
  const tokensCookie = req.cookies.google_tokens;
  if (!tokensCookie) return res.status(401).json({ error: "No conectado" });

  const { folderId } = req.params;
  const tokens = JSON.parse(tokensCookie);
  oauth2Client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and name contains 'medsnap_sync_' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      spaces: 'drive'
    });
    res.json({ files: response.data.files });
  } catch (error) {
    res.status(500).json({ error: "Error al listar archivos" });
  }
});

// Download a sync file
app.get("/api/drive/download/:fileId", async (req, res) => {
  const tokensCookie = req.cookies.google_tokens;
  if (!tokensCookie) return res.status(401).json({ error: "No conectado" });

  const { fileId } = req.params;
  const tokens = JSON.parse(tokensCookie);
  oauth2Client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Error al descargar archivo" });
  }
});

// Sync data to Drive
app.post("/api/drive/sync", async (req, res) => {
  const tokensCookie = req.cookies.google_tokens;
  if (!tokensCookie) {
    return res.status(401).json({ error: "No conectado a Google Drive" });
  }

  const { records, targetFolderId } = req.body;
  const tokens = JSON.parse(tokensCookie);
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    let folderId = targetFolderId;

    // 1. If no folder ID provided, find or create the "MedSnap_Data" folder
    if (!folderId) {
      const folderSearch = await drive.files.list({
        q: "name = 'MedSnap_Data' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id)',
        spaces: 'drive'
      });

      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        folderId = folderSearch.data.files[0].id!;
      } else {
        const folderMetadata = {
          name: 'MedSnap_Data',
          mimeType: 'application/vnd.google-apps.folder'
        };
        const folder = await drive.files.create({
          requestBody: folderMetadata,
          fields: 'id'
        });
        folderId = folder.data.id!;
      }
    }

    // 2. Upload the records as a JSON file
    const fileName = `medsnap_sync_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };
    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(records, null, 2)
    };

    await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id'
    });

    res.json({ success: true, message: "Sincronización completada", folderId });
  } catch (error) {
    console.error("Error syncing to Drive:", error);
    res.status(500).json({ error: "Error al sincronizar con Google Drive" });
  }
});

// Logout from Google Drive
app.post("/api/auth/google/logout", (req, res) => {
  res.clearCookie('google_tokens', {
    secure: true,
    sameSite: 'none'
  });
  res.json({ success: true });
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
