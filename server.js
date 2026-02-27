require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

// ========== API ROUTES ==========
// ----- Mess Crowd System -----
// Get current occupancy (using sliding window of last 30 mins within meal window)
app.get('/api/mess/occupancy', async (req, res) => {
  try {
    // Define meal windows (hardcoded for demo; can be moved to a config table)
    const now = new Date();
    const hour = now.getHours();
    let mealWindow;
    if (hour >= 7 && hour < 9) mealWindow = 'breakfast';
    else if (hour >= 12 && hour < 14) mealWindow = 'lunch';
    else if (hour >= 19 && hour < 21) mealWindow = 'dinner';
    else mealWindow = 'none';

    let occupancy = 0;
    let color = 'green';
    const totalCapacity = 300; // should come from config

    if (mealWindow !== 'none') {
      // Count scans in last 30 minutes
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60000);
      const { count, error } = await supabase
        .from('mess_scans')
        .select('*', { count: 'exact', head: true })
        .gte('scanned_at', thirtyMinsAgo.toISOString())
        .eq('meal_window', mealWindow);

      if (error) throw error;
      occupancy = count;

      // Color coding based on occupancy percentage
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

// Simulate a scan (user checks in)
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
// Helper function to upload an image to Supabase Storage
const uploadImage = async (file, userId, bucket = 'lost-found') => {
  const fileName = `${userId}/${uuidv4()}-${file.originalname}`;
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file.buffer, { contentType: file.mimetype });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return publicUrl;
};

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Create a lost/found item (with up to 5 images)
app.post('/api/lost-found', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const { type, title, description, category, contactEmail } = req.body;
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
        description,
        category,
        images: imageUrls,
        contact_email: contactEmail,
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

// Get all items (optionally filter by type and/or category)
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

// Optional: Delete an item (only by its owner or admin)
app.delete('/api/lost-found/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    // Check ownership (or admin role)
    const { data: item, error: fetchError } = await supabase
      .from('lost_found_items')
      .select('user_id, images')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    // Only allow deletion if user is owner or admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (item.user_id !== req.user.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete images from storage
    if (item.images && item.images.length > 0) {
      for (const url of item.images) {
        // Extract file path from URL (assuming public URL format)
        const path = url.split('/').slice(-2).join('/'); // e.g., "user-uuid/filename.jpg"
        await supabase.storage.from('lost-found').remove([path]);
      }
    }

    // Delete database record
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
// Helper to check if user is admin
async function isAdmin(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error || !data) return false;
  return data.role === 'admin';
}

// Get all notifications (optionally by category) - public
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

// Admin: create notification
app.post('/api/notifications', authenticate, async (req, res) => {
  try {
    // Check admin status
    const admin = await isAdmin(req.user.id);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { title, content, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

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

// Optional: Delete notification (admin only)
app.delete('/api/notifications/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
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

// ----- Personal Timetable -----
// Get user's personal events
app.get('/api/timetable/personal', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('personal_timetables')
      .select('*')
      .eq('user_id', req.user.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add personal event (with conflict check)
app.post('/api/timetable/personal', authenticate, async (req, res) => {
  try {
    const { eventName, dayOfWeek, startTime, endTime, location } = req.body;

    // Basic validation
    if (!eventName || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for overlapping events for this user on the same day
    const { data: existing, error: fetchError } = await supabase
      .from('personal_timetables')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('day_of_week', dayOfWeek)
      .lt('start_time', endTime)   // existing.start < new.end
      .gt('end_time', startTime);   // existing.end > new.start

    if (fetchError) throw fetchError;
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Time slot overlaps with an existing event' });
    }

    const { data, error } = await supabase
      .from('personal_timetables')
      .insert({
        user_id: req.user.id,
        event_name: eventName,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        location: location || null
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete personal event
app.delete('/api/timetable/personal/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    // Ensure event belongs to user
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

// ----- Course Timetable -----
// Get all course events (public)
app.get('/api/timetable/course', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('course_timetables')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Add a new course
app.post('/api/timetable/course', authenticate, async (req, res) => {
  try {
    // Check admin status (reuse isAdmin helper)
    const admin = await isAdmin(req.user.id);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { courseCode, courseName, dayOfWeek, startTime, endTime, venue, instructor } = req.body;
    if (!courseCode || !courseName || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('course_timetables')
      .insert({
        course_code: courseCode,
        course_name: courseName,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        venue: venue || null,
        instructor: instructor || null
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete a course
app.delete('/api/timetable/course/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    const { error } = await supabase
      .from('course_timetables')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Optional: Update a course (admin)
app.put('/api/timetable/course/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { courseCode, courseName, dayOfWeek, startTime, endTime, venue, instructor } = req.body;

    const { data, error } = await supabase
      .from('course_timetables')
      .update({
        course_code: courseCode,
        course_name: courseName,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        venue,
        instructor
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Bus Schedule -----
// Get all bus schedules (public)
app.get('/api/bus-schedule', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bus_schedules')
      .select('*')
      .order('route_name', { ascending: true })
      .order('arrival_time', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Add a bus schedule entry
app.post('/api/bus-schedule', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { routeName, stopName, arrivalTime } = req.body;
    if (!routeName || !stopName || !arrivalTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('bus_schedules')
      .insert({
        route_name: routeName,
        stop_name: stopName,
        arrival_time: arrivalTime
      })
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete a bus schedule entry
app.delete('/api/bus-schedule/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { error } = await supabase
      .from('bus_schedules')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Bus schedule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Optional: Update a bus schedule entry
app.put('/api/bus-schedule/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { routeName, stopName, arrivalTime } = req.body;

    const { data, error } = await supabase
      .from('bus_schedules')
      .update({
        route_name: routeName,
        stop_name: stopName,
        arrival_time: arrivalTime
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----- Mess Menu -----
// Get mess menus (public)
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

// Admin: Add a menu entry
app.post('/api/mess-menu', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { mealType, dayOfWeek, items, category } = req.body;
    if (!mealType || dayOfWeek === undefined || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required fields' });
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

// Admin: Delete a menu entry
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

// Admin: Update a menu entry (optional)
app.put('/api/mess-menu/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { mealType, dayOfWeek, items, category } = req.body;
    const { data, error } = await supabase
      .from('mess_menus')
      .update({ meal_type: mealType, day_of_week: dayOfWeek, items, category })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- PHC Timetable -----
// Get all PHC schedules (public)
app.get('/api/phc-timetable', async (req, res) => {
  try {
    const { doctor, specialization } = req.query;
    let query = supabase.from('phc_timetable').select('*');
    if (doctor) query = query.ilike('doctor_name', `%${doctor}%`);
    if (specialization) query = query.ilike('specialization', `%${specialization}%`);
    const { data, error } = await query.order('day_of_week', { ascending: true })
                                         .order('start_time', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Add a PHC schedule entry
app.post('/api/phc-timetable', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { doctorName, specialization, dayOfWeek, startTime, endTime } = req.body;
    if (!doctorName || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
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

// Admin: Delete a PHC schedule entry
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

// Admin: Update a PHC schedule entry
app.put('/api/phc-timetable/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { doctorName, specialization, dayOfWeek, startTime, endTime } = req.body;

    const { data, error } = await supabase
      .from('phc_timetable')
      .update({
        doctor_name: doctorName,
        specialization,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Restaurant Ordering -----
// Get all restaurants (public)
app.get('/api/restaurants', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Add a restaurant
app.post('/api/restaurants', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { name, url, logo_url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

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

// Admin: Delete a restaurant
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

// Admin: Update a restaurant (optional)
app.put('/api/restaurants/:id', authenticate, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { name, url, logo_url } = req.body;
    const { data, error } = await supabase
      .from('restaurants')
      .update({ name, url, logo_url })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


