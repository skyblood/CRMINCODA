/**
 * Google Drive Service — OAuth2 authentication (user tokens from session)
 *
 * Folder structure: ROOT / COUNTRY / CLIENT_NAME / PROJECT_NAME
 *
 * Setup:
 *   1. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET to .env
 *   2. Set GOOGLE_DRIVE_ROOT_FOLDER_ID in .env (ID de la carpeta raíz en Drive)
 *   3. User must connect via GET /api/calendar/auth (includes Drive scope)
 *
 * Tokens are passed in from req.session.googleTokens — no service account needed.
 */

/**
 * Build an authenticated Drive client from OAuth2 tokens.
 * @param {object} tokens - { access_token, refresh_token, expiry_date, ... }
 */
async function getClientFromTokens(tokens) {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials(tokens);
    return google.drive({ version: 'v3', auth });
}

/**
 * Finds an existing folder by name within a parent, or creates it.
 * Idempotent — safe to call multiple times.
 */
export async function findOrCreateFolder(name, parentId, tokens) {
    const drive = await getClientFromTokens(tokens);
    const sanitized = name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Sin_nombre';

    const listRes = await drive.files.list({
        q: `name='${sanitized.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    if (listRes.data.files?.length > 0) {
        return listRes.data.files[0].id;
    }

    const createRes = await drive.files.create({
        requestBody: {
            name: sanitized,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });
    return createRes.data.id;
}

/**
 * Ensures the full folder path exists: ROOT / country / clientName / projectName
 * Creates any missing folders in order.
 */
export async function ensureFolderPath(country, clientName, projectName, tokens) {
    const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID no está configurado en .env');
    if (!tokens?.access_token) throw new Error('No hay sesión de Google activa. Conecta tu cuenta en Configuración → Google Calendar.');

    const countryId  = await findOrCreateFolder(country     || 'Sin_Pais',      rootId,    tokens);
    const clientId   = await findOrCreateFolder(clientName  || 'Sin_Cliente',   countryId, tokens);
    const projectId  = await findOrCreateFolder(projectName || 'Sin_Proyecto',  clientId,  tokens);
    return projectId;
}

/**
 * Creates a versioned Google Doc from HTML content in a Drive folder.
 * Counts existing docs with the same base name to auto-increment version.
 */
export async function createOrVersionTechnicalDoc(folderId, projectName, htmlContent, tokens) {
    const drive = await getClientFromTokens(tokens);
    const { Readable } = await import('stream');

    const baseName = `Propuesta_Tecnica_${projectName.replace(/[/\\?%*:|"<>]/g, '_').trim()}`;

    const listRes = await drive.files.list({
        q: `name contains '${baseName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    const version = (listRes.data.files?.length || 0) + 1;
    const filename = `${baseName}_v${version}`;

    const stream = Readable.from(Buffer.from(htmlContent, 'utf-8'));

    const createRes = await drive.files.create({
        requestBody: {
            name: filename,
            mimeType: 'application/vnd.google-apps.document',
            parents: [folderId],
        },
        media: {
            mimeType: 'text/html',
            body: stream,
        },
        fields: 'id, webViewLink',
    });

    const fileId = createRes.data.id;

    await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
    });

    const metaRes = await drive.files.get({ fileId, fields: 'webViewLink' });

    return {
        fileId,
        webViewLink: metaRes.data.webViewLink ?? '',
        version,
        filename,
    };
}

/**
 * Uploads a PDF buffer to a Drive folder and makes it readable by anyone with the link.
 */
export async function uploadPDF(folderId, filename, pdfBuffer, tokens) {
    const drive = await getClientFromTokens(tokens);
    const { Readable } = await import('stream');

    const stream = Readable.from(pdfBuffer);

    const createRes = await drive.files.create({
        requestBody: {
            name: filename,
            mimeType: 'application/pdf',
            parents: [folderId],
        },
        media: {
            mimeType: 'application/pdf',
            body: stream,
        },
        fields: 'id, webViewLink, webContentLink',
    });

    const fileId = createRes.data.id;

    await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
    });

    const metaRes = await drive.files.get({
        fileId,
        fields: 'webViewLink, webContentLink',
    });

    return {
        fileId,
        webViewLink:    metaRes.data.webViewLink    ?? '',
        webContentLink: metaRes.data.webContentLink ?? '',
    };
}
