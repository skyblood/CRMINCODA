/**
 * Google Calendar OAuth2 + Events API
 *
 * Required .env variables:
 *   GOOGLE_CLIENT_ID     — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — from Google Cloud Console
 *   APP_URL              — e.g. https://crm.yourdomain.com (for the redirect URI)
 *
 * Authorized redirect URI to add in Google Cloud Console:
 *   {APP_URL}/api/calendar/oauth2callback
 */
import { Router } from 'express';

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive',
].join(' ');
const getRedirectUri = (req) =>
  `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/api/calendar/oauth2callback`;

function getOAuth2Client(req) {
  // Dynamic import so the server starts even without the googleapis package
  return import('googleapis').then(({ google }) => {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
  });
}

/** GET /api/calendar/auth  — initiates OAuth2 flow */
router.get('/auth', async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: 'Google Calendar not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env' });
  }
  try {
    const auth = await getOAuth2Client(req);
    const url = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/calendar/oauth2callback — Google redirects here after user consent */
router.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const auth = await getOAuth2Client(req);
    const { tokens } = await auth.getToken(code);
    // Store tokens per user in session
    req.session.googleTokens = tokens;
    res.redirect('/#/'); // redirect back to CRM
  } catch (e) {
    res.status(500).send(`OAuth error: ${e.message}`);
  }
});

/** GET /api/calendar/status — check if current user is connected */
router.get('/status', (req, res) => {
  const connected = !!(req.session?.googleTokens?.access_token);
  res.json({ connected });
});

/** DELETE /api/calendar/disconnect — revoke tokens */
router.delete('/disconnect', (req, res) => {
  delete req.session.googleTokens;
  res.json({ success: true });
});

/**
 * POST /api/calendar/events  — create a calendar event
 * Body: { title, description, start (ISO), end (ISO), attendees?: string[] }
 */
router.post('/events', async (req, res) => {
  if (!req.session?.googleTokens) {
    return res.status(401).json({ error: 'Not connected to Google Calendar' });
  }
  const { title, description, start, end, attendees = [] } = req.body;
  if (!title || !start) return res.status(400).json({ error: 'title and start are required' });

  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    auth.setCredentials(req.session.googleTokens);

    // Refresh tokens silently if expired
    auth.on('tokens', (tokens) => { req.session.googleTokens = { ...req.session.googleTokens, ...tokens }; });

    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: { dateTime: start, timeZone: 'UTC' },
        end: { dateTime: end || new Date(new Date(start).getTime() + 3_600_000).toISOString(), timeZone: 'UTC' },
        attendees: attendees.map(email => ({ email })),
      },
    });

    res.json({ id: event.data.id, htmlLink: event.data.htmlLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/calendar/events?days=7  — list upcoming events
 */
router.get('/events', async (req, res) => {
  if (!req.session?.googleTokens) return res.status(401).json({ error: 'Not connected' });
  const days = Math.min(30, parseInt(req.query.days) || 7);

  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    auth.setCredentials(req.session.googleTokens);
    auth.on('tokens', (tokens) => { req.session.googleTokens = { ...req.session.googleTokens, ...tokens }; });

    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + days * 86_400_000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      htmlLink: e.htmlLink,
    }));
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
