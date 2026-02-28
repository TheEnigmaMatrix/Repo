require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Middleware
app.use(express.json());

// Fix "Cannot GET /pages/" – redirect bare /pages/ or /pages to dashboard (before static)
app.get('/pages', (req, res) => res.redirect('/dashboard.html'));
app.get('/pages/', (req, res) => res.redirect('/dashboard.html'));

app.use(express.static(path.join(__dirname, 'public')));

// ========== AUTHENTICATION MIDDLEWARE ==========
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  req.token = token;
  // Supabase client scoped to the logged-in user (so RLS + storage policies work).
  req.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  next();
};

// ========== HELPER FUNCTIONS ==========
async function isAdmin(supabaseClient, userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error || !data) return false;
  return data.role === 'admin';
}

// ========== API ROUTES ==========

// ----- Mess Crowd System -----
app.get('/api/mess/occupancy', async (req, res) => {
  try {
    const now = new Date();
    const hour = now.getHours();
    let mealWindow;
    if (hour >= 7 && hour < 9) mealWindow = 'breakfast';
    else if (hour >= 12 && hour < 14) mealWindow = 'lunch';
    else if (hour >= 19 && hour < 21) mealWindow = 'dinner';
    else mealWindow = 'none';

    let occupancy = 0;
    let color = 'green';
    const totalCapacity = 300;

    if (mealWindow !== 'none') {
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60000);
      const { count, error } = await supabase
        .from('mess_scans')
        .select('*', { count: 'exact', head: true })
        .gte('scanned_at', thirtyMinsAgo.toISOString())
        .eq('meal_window', mealWindow);
      if (error) throw error;
      occupancy = count;
      const percent = (occupancy / totalCapacity) * 100;
      if (percent < 40) color = 'green';
      else if (percent < 70) color = 'yellow';
      else color = 'red';
    }
    res.json({ mealWindow, occupancy, totalCapacity, color });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mess/scan', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const hour = now.getHours();
    let mealWindow;
    if (hour >= 7 && hour < 9) mealWindow = 'breakfast';
    else if (hour >= 12 && hour < 14) mealWindow = 'lunch';
    else if (hour >= 19 && hour < 21) mealWindow = 'dinner';
    else return res.status(400).json({ error: 'No active meal window' });
    const { error } = await req.supabase
      .from('mess_scans')
      .insert({ user_id: req.user.id, meal_window: mealWindow });
    if (error) throw error;
    res.json({ message: 'Scan recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Lost & Found -----
const upload = multer({ storage: multer.memoryStorage() });

const uploadImage = async (supabaseClient, file, userId, bucket = 'lost-found') => {
  const fileName = `${userId}/${uuidv4()}-${file.originalname}`;
  const { error } = await supabaseClient.storage
    .from(bucket)
    .upload(fileName, file.buffer, { contentType: file.mimetype });
  if (error) throw error;
  const { data: { publicUrl } } = supabaseClient.storage.from(bucket).getPublicUrl(fileName);
  return publicUrl;
};

app.post('/api/lost-found', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const { type, title, description, category, contactInfo } = req.body;
    if (!type || !title || !category || !contactInfo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['lost', 'found'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadImage(req.supabase, file, req.user.id, 'lost-found');
        imageUrls.push(url);
      }
    }

    const { data, error } = await req.supabase
      .from('lost_found_items')
      .insert({
        type,
        title,
        description: description || null,
        category,
        images: imageUrls,
        contact_info: contactInfo,
        user_id: req.user.id
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Visible to all LOGGED-IN users (shared feed)
app.get('/api/lost-found', authenticate, async (req, res) => {
  try {
    const { type, category } = req.query;
    let query = req.supabase.from('lost_found_items').select('*');
    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lost-found/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await req.supabase
      .from('lost_found_items')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/lost-found/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: item, error: fetchError } = await req.supabase
      .from('lost_found_items')
      .select('user_id, images')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const admin = await isAdmin(req.supabase, req.user.id);
    if (item.user_id !== req.user.id && !admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (item.images && item.images.length > 0) {
      for (const url of item.images) {
        const path = url.split('/').slice(-2).join('/');
        await req.supabase.storage.from('lost-found').remove([path]);
      }
    }

    const { error } = await req.supabase
      .from('lost_found_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Student uploads (per-user, saved forever) -----
// Table required: student_uploads (user_id uuid, upload_type text, file_path text, updated_at timestamptz, created_at timestamptz)
// Unique constraint required: unique(user_id, upload_type)
// Storage bucket required: student-uploads (public recommended for simple <img src>)

const ALLOWED_UPLOAD_TYPES = new Set(['academic-calendar', 'bus-schedule', 'course-timetable']);

app.get('/api/student-uploads/:type', authenticate, async (req, res) => {
  try {
    const type = req.params.type;
    if (!ALLOWED_UPLOAD_TYPES.has(type)) return res.status(400).json({ error: 'Invalid upload type' });

    const { data, error } = await req.supabase
      .from('student_uploads')
      .select('file_path, updated_at')
      .eq('user_id', req.user.id)
      .eq('upload_type', type)
      .maybeSingle();
    if (error) throw error;

    if (!data?.file_path) return res.json({ imageUrl: null, updatedAt: null });
    const { data: { publicUrl } } = req.supabase.storage.from('student-uploads').getPublicUrl(data.file_path);
    res.json({ imageUrl: publicUrl, updatedAt: data.updated_at || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/student-uploads/:type', authenticate, upload.single('image'), async (req, res) => {
  try {
    const type = req.params.type;
    if (!ALLOWED_UPLOAD_TYPES.has(type)) return res.status(400).json({ error: 'Invalid upload type' });

    if (!req.file || !req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'Please upload an image file (PNG/JPG/WebP)' });
    }

    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
    const filePath = `${req.user.id}/${type}.${ext}`;

    const { error: uploadError } = await req.supabase.storage
      .from('student-uploads')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) throw uploadError;

    const { error: upsertError } = await req.supabase
      .from('student_uploads')
      .upsert(
        { user_id: req.user.id, upload_type: type, file_path: filePath, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,upload_type' }
      );
    if (upsertError) throw upsertError;

    const { data: { publicUrl } } = req.supabase.storage.from('student-uploads').getPublicUrl(filePath);
    res.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----- Notifications -----
app.get('/api/notifications', async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase.from('notifications').select('*');
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/notifications', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { title, content, category } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

    const { data, error } = await req.supabase
      .from('notifications')
      .insert({ title, content, category, created_by: req.user.id })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notifications/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await req.supabase
      .from('notifications')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Gmail / Email notifications (student: connect Gmail, watch senders, get "email from X" alerts) -----
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const STATE_SECRET = process.env.GMAIL_STATE_SECRET || process.env.SUPABASE_JWT_SECRET || 'gmail-state-secret-change-me';

function createGmailOAuth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3000'}/api/gmail/callback`
  );
}

function createState(userId) {
  const payload = Buffer.from(userId, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(state) {
  if (!state || !state.includes('.')) return null;
  const [payload, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

app.get('/api/gmail/auth-url', authenticate, (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Gmail integration not configured' });
    }
    const oauth2 = createGmailOAuth2();
    const state = createState(req.user.id);
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
      state,
    });
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = verifyState(state);
    if (!userId || !code) {
      return res.redirect('/pages/notifications.html?gmail=error');
    }
    const oauth2 = createGmailOAuth2();
    const { tokens } = await oauth2.getToken(code);
    const { error } = await supabase.from('gmail_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expiry_date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    res.redirect('/pages/notifications.html?gmail=connected');
  } catch (err) {
    console.error(err);
    res.redirect('/pages/notifications.html?gmail=error');
  }
});

app.get('/api/gmail/status', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('gmail_tokens').select('user_id').eq('user_id', req.user.id).maybeSingle();
    res.json({ connected: !!data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/watched-senders', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gmail_watched_senders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gmail/watched-senders', authenticate, async (req, res) => {
  try {
    const { sender_email, display_name } = req.body;
    if (!sender_email || !display_name) {
      return res.status(400).json({ error: 'sender_email and display_name required' });
    }
    const email = String(sender_email).trim().toLowerCase();
    const name = String(display_name).trim();
    const { data, error } = await supabase
      .from('gmail_watched_senders')
      .insert({ user_id: req.user.id, sender_email: email, display_name: name })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/gmail/watched-senders/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('gmail_watched_senders')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/email', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('received_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/email/unseen-count', authenticate, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('email_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('seen', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/notifications/email/:id/seen', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('email_notifications')
      .update({ seen: true })
      .eq('id', id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Marked as seen' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/email/mark-all-seen', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('email_notifications')
      .update({ seen: true })
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'All marked as seen' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync Gmail: fetch recent messages from watched senders and create email_notifications
async function getValidGmailClient(userId) {
  const { data: row, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error || !row) return null;
  const oauth2 = createGmailOAuth2();
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  });
  if (row.expiry_date && row.expiry_date < Date.now()) {
    const { credentials } = await oauth2.refreshAccessToken();
    await supabase.from('gmail_tokens').update({
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    oauth2.setCredentials(credentials);
  }
  return oauth2;
}

app.post('/api/gmail/sync', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: senders, error: sendersErr } = await supabase
      .from('gmail_watched_senders')
      .select('sender_email, display_name')
      .eq('user_id', userId);
    if (sendersErr || !senders || senders.length === 0) {
      return res.json({ synced: 0, message: 'No watched senders' });
    }
    const auth = await getValidGmailClient(userId);
    if (!auth) {
      return res.status(400).json({ error: 'Gmail not connected or token expired. Reconnect in Notices.' });
    }
    const gmail = google.gmail({ version: 'v1', auth });
    const senderMap = {};
    senders.forEach(s => {
      const e = String(s.sender_email || '').trim().toLowerCase();
      if (e) senderMap[e] = s.display_name || e;
    });

    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'in:inbox is:unread',
    });
    const messages = list.messages || [];
    let created = 0;
    for (const m of messages) {
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id: m.id });
      const fromHeader = msg.payload?.headers?.find(h => h.name.toLowerCase() === 'from');
      const subjectHeader = msg.payload?.headers?.find(h => h.name.toLowerCase() === 'subject');
      const from = fromHeader?.value || '';
      const fromEmail = (from.match(/<([^>]+)>/) || [null, from])[1] || from;
      const addr = fromEmail.trim().toLowerCase();
      if (!senderMap[addr]) continue;
      const receivedAt = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : new Date().toISOString();
      const { error: insErr } = await supabase.from('email_notifications').insert({
        user_id: userId,
        from_email: addr,
        from_name: senderMap[addr],
        gmail_message_id: m.id,
        subject: subjectHeader?.value || null,
        received_at: receivedAt,
        seen: false,
      });
      if (!insErr) created++;
    }
    res.json({ synced: true, newCount: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});

// ----- Personal Timetable (weekly and one-time events) -----
app.get('/api/timetable/personal', authenticate, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('personal_timetables')
      .select('*')
      .eq('user_id', req.user.id)
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/timetable/personal', authenticate, async (req, res) => {
  try {
    const { eventName, dayOfWeek, startTime, endTime, location, eventDate } = req.body;
    
    if (!eventName || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if ((dayOfWeek === undefined || dayOfWeek === '') && !eventDate) {
      return res.status(400).json({ error: 'Either day of week or specific date is required' });
    }
    if (dayOfWeek !== undefined && dayOfWeek !== '' && eventDate) {
      return res.status(400).json({ error: 'Cannot provide both day of week and date' });
    }

    // Check for overlaps
    let query = req.supabase
      .from('personal_timetables')
      .select('*')
      .eq('user_id', req.user.id);

    if (dayOfWeek !== undefined && dayOfWeek !== '') {
      query = query.eq('day_of_week', dayOfWeek)
                   .lt('start_time', endTime)
                   .gt('end_time', startTime);
    } else {
      query = query.eq('event_date', eventDate)
                   .lt('start_time', endTime)
                   .gt('end_time', startTime);
    }

    const { data: existing, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Time slot overlaps with an existing event' });
    }

    const insertData = {
      user_id: req.user.id,
      event_name: eventName,
      start_time: startTime,
      end_time: endTime,
      location: location || null
    };
    if (dayOfWeek !== undefined && dayOfWeek !== '') {
      insertData.day_of_week = dayOfWeek;
      insertData.event_date = null;
    } else {
      insertData.event_date = eventDate;
      insertData.day_of_week = null;
    }

    const { data, error } = await req.supabase
      .from('personal_timetables')
      .insert(insertData)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/timetable/personal/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: event, error: fetchError } = await req.supabase
      .from('personal_timetables')
      .select('user_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (event.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { error } = await req.supabase
      .from('personal_timetables')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Academic Calendar -----
app.get('/api/academic-calendar', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('academic_calendars')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    if (data) {
      const { data: { publicUrl } } = supabase.storage.from('academic-calendars').getPublicUrl(data.file_path);
      res.json({ ...data, file_url: publicUrl });
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/academic-calendar', authenticate, upload.single('pdf'), async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { title } = req.body;
    if (!title || !req.file) {
      return res.status(400).json({ error: 'Title and PDF file are required' });
    }

    const file = req.file;
    const fileName = `academic-calendar/${uuidv4()}-${file.originalname}`;
    const { error: uploadError } = await req.supabase.storage
      .from('academic-calendars')
      .upload(fileName, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw uploadError;

    const { data, error } = await req.supabase
      .from('academic_calendars')
      .insert({
        title,
        file_path: fileName,
        uploaded_by: req.user.id
      })
      .select();
    if (error) throw error;

    const { data: { publicUrl } } = req.supabase.storage.from('academic-calendars').getPublicUrl(fileName);
    res.json({ ...data[0], file_url: publicUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- QR Codes ----- (if you have this feature, include; otherwise skip)
app.get('/api/qrcodes', authenticate, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('user_qr_codes')
      .select('*')
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/qrcodes', authenticate, upload.single('qrImage'), async (req, res) => {
  try {
    const { name } = req.body;
    const file = req.file;
    const fileName = `qr/${req.user.id}/${uuidv4()}-${file.originalname}`;
    const { error: uploadError } = await req.supabase.storage
      .from('qr-codes')
      .upload(fileName, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = req.supabase.storage.from('qr-codes').getPublicUrl(fileName);

    const { data, error } = await req.supabase
      .from('user_qr_codes')
      .insert({ user_id: req.user.id, name, file_path: publicUrl })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/qrcodes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: qr, error: fetchError } = await req.supabase
      .from('user_qr_codes')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    if (fetchError) throw fetchError;

    const fileName = qr.file_path.split('/').slice(-2).join('/');
    await req.supabase.storage.from('qr-codes').remove([fileName]);

    const { error } = await req.supabase
      .from('user_qr_codes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'QR deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Bus Schedule (image: admin uploads, students view) -----
// Table required: bus_schedule_image (id int primary key default 1, image_url text, updated_at timestamptz, updated_by uuid)
// Storage bucket required: bus-schedule (public)

app.get('/api/bus-schedule/image', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bus_schedule_image')
      .select('image_url')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    res.json({ imageUrl: data?.image_url || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bus-schedule/image', authenticate, upload.single('scheduleImage'), async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Please upload an image file (e.g. PNG, JPG)' });
    }

    const ext = req.file.originalname.split('.').pop() || 'png';
    const fileName = `current.${ext}`;
    const { error: uploadError } = await req.supabase.storage
      .from('bus-schedule')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = req.supabase.storage.from('bus-schedule').getPublicUrl(fileName);

    const { error: dbError } = await req.supabase
      .from('bus_schedule_image')
      .upsert(
        { id: 1, image_url: publicUrl, updated_at: new Date().toISOString(), updated_by: req.user.id },
        { onConflict: 'id' }
      );
    if (dbError) throw dbError;
    res.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----- Mess Menu -----
app.get('/api/mess-menu', async (req, res) => {
  try {
    const { day, category } = req.query;
    let query = supabase.from('mess_menus').select('*');
    if (day !== undefined) query = query.eq('day_of_week', day);
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('day_of_week').order('meal_type');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mess-menu', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { mealType, dayOfWeek, items, category } = req.body;
    if (!mealType || dayOfWeek === undefined || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const { data, error } = await req.supabase
      .from('mess_menus')
      .insert({
        meal_type: mealType,
        day_of_week: dayOfWeek,
        items: items,
        category: category || 'veg'
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mess-menu/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await req.supabase
      .from('mess_menus')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Menu entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- PHC Timetable -----
app.get('/api/phc-timetable', async (req, res) => {
  try {
    const { doctor, specialization } = req.query;
    let query = supabase.from('phc_timetable').select('*');
    if (doctor) query = query.ilike('doctor_name', `%${doctor}%`);
    if (specialization) query = query.ilike('specialization', `%${specialization}%`);
    const { data, error } = await query.order('day_of_week').order('start_time');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/phc-timetable', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { doctorName, specialization, dayOfWeek, startTime, endTime } = req.body;
    if (!doctorName || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const { data, error } = await req.supabase
      .from('phc_timetable')
      .insert({
        doctor_name: doctorName,
        specialization: specialization || null,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/phc-timetable/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await req.supabase
      .from('phc_timetable')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'PHC schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Restaurant Ordering -----
app.get('/api/restaurants', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restaurants', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { name, url, logo_url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });

    const { data, error } = await req.supabase
      .from('restaurants')
      .insert({ name, url, logo_url: logo_url || null })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/restaurants/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.supabase, req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await req.supabase
      .from('restaurants')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Restaurant deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});