require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== AUTHENTICATION MIDDLEWARE ==========
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
};

// ========== HELPER FUNCTIONS ==========
async function isAdmin(userId) {
  const { data, error } = await supabase
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
    const { error } = await supabase
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

const uploadImage = async (file, userId, bucket = 'lost-found') => {
  const fileName = `${userId}/${uuidv4()}-${file.originalname}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file.buffer, { contentType: file.mimetype });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
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
        const url = await uploadImage(file, req.user.id, 'lost-found');
        imageUrls.push(url);
      }
    }

    const { data, error } = await supabase
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

app.get('/api/lost-found', async (req, res) => {
  try {
    const { type, category } = req.query;
    let query = supabase.from('lost_found_items').select('*');
    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lost-found/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
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
    const { data: item, error: fetchError } = await supabase
      .from('lost_found_items')
      .select('user_id, images')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const admin = await isAdmin(req.user.id);
    if (item.user_id !== req.user.id && !admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (item.images && item.images.length > 0) {
      for (const url of item.images) {
        const path = url.split('/').slice(-2).join('/');
        await supabase.storage.from('lost-found').remove([path]);
      }
    }

    const { error } = await supabase
      .from('lost_found_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Item deleted' });
  } catch (error) {
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { title, content, category } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

    const { data, error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Personal Timetable (weekly and one-time events) -----
app.get('/api/timetable/personal', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
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
    let query = supabase
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

    const { data, error } = await supabase
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
    const { data: event, error: fetchError } = await supabase
      .from('personal_timetables')
      .select('user_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (event.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { title } = req.body;
    if (!title || !req.file) {
      return res.status(400).json({ error: 'Title and PDF file are required' });
    }

    const file = req.file;
    const fileName = `academic-calendar/${uuidv4()}-${file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('academic-calendars')
      .upload(fileName, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('academic_calendars')
      .insert({
        title,
        file_path: fileName,
        uploaded_by: req.user.id
      })
      .select();
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('academic-calendars').getPublicUrl(fileName);
    res.json({ ...data[0], file_url: publicUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- QR Codes ----- (if you have this feature, include; otherwise skip)
app.get('/api/qrcodes', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
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
    const { error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(fileName, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('qr-codes').getPublicUrl(fileName);

    const { data, error } = await supabase
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
    const { data: qr, error: fetchError } = await supabase
      .from('user_qr_codes')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    if (fetchError) throw fetchError;

    const fileName = qr.file_path.split('/').slice(-2).join('/');
    await supabase.storage.from('qr-codes').remove([fileName]);

    const { error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Please upload an image file (e.g. PNG, JPG)' });
    }

    const ext = req.file.originalname.split('.').pop() || 'png';
    const fileName = `current.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('bus-schedule')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('bus-schedule').getPublicUrl(fileName);

    const { error: dbError } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { mealType, dayOfWeek, items, category } = req.body;
    if (!mealType || dayOfWeek === undefined || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const { data, error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { doctorName, specialization, dayOfWeek, startTime, endTime } = req.body;
    if (!doctorName || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const { data, error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { name, url, logo_url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });

    const { data, error } = await supabase
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
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await supabase
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