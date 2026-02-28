  -- ============================================================
  -- UAH IITJ – Supabase schema (run in Supabase SQL Editor)
  -- ============================================================

  -- Enable UUID extension
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- Profiles table (extends Supabase auth.users)
  CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- RLS: authenticated users can read profiles (needed for role checks)
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
  CREATE POLICY "profiles_select_authenticated"
    ON profiles FOR SELECT TO authenticated USING (true);

  -- Mess scans (for crowd estimation)
  CREATE TABLE IF NOT EXISTS mess_scans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    meal_window TEXT
  );

  -- Lost & Found items (column is contact_info to match app)
  -- If you already have contact_email, run once: ALTER TABLE lost_found_items RENAME COLUMN contact_email TO contact_info;
  CREATE TABLE IF NOT EXISTS lost_found_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    type TEXT CHECK (type IN ('lost', 'found')),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    images TEXT[],
    contact_info TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  ALTER TABLE lost_found_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "lost_found_select_authenticated" ON lost_found_items;
  CREATE POLICY "lost_found_select_authenticated"
    ON lost_found_items FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "lost_found_insert_own" ON lost_found_items;
  CREATE POLICY "lost_found_insert_own"
    ON lost_found_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  DROP POLICY IF EXISTS "lost_found_delete_own" ON lost_found_items;
  CREATE POLICY "lost_found_delete_own"
    ON lost_found_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

  -- Notifications (admin posted)
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
  );

  -- Personal timetables (if table exists, only add columns)
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'personal_timetables') THEN
      ALTER TABLE personal_timetables ADD COLUMN IF NOT EXISTS event_date DATE;
      ALTER TABLE personal_timetables ALTER COLUMN day_of_week DROP NOT NULL;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_personal_event_type') THEN
        ALTER TABLE personal_timetables ADD CONSTRAINT check_personal_event_type CHECK (
          (day_of_week IS NOT NULL AND event_date IS NULL) OR
          (day_of_week IS NULL AND event_date IS NOT NULL)
        );
      END IF;
    ELSE
      CREATE TABLE personal_timetables (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,
        day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
        event_date DATE,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        location TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT check_personal_event_type CHECK (
          (day_of_week IS NOT NULL AND event_date IS NULL) OR
          (day_of_week IS NULL AND event_date IS NOT NULL)
        )
      );
    END IF;
  END $$;

  -- Academic calendars (admin PDF upload – optional; student uploads use student_uploads)
  CREATE TABLE IF NOT EXISTS academic_calendars (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- User's saved QR codes
  CREATE TABLE IF NOT EXISTS user_qr_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Bus schedules (route/stop data; single image per user is in student_uploads)
  CREATE TABLE IF NOT EXISTS bus_schedules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    route_name TEXT NOT NULL,
    stop_name TEXT NOT NULL,
    arrival_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Optional: single global bus schedule image (if you still use /api/bus-schedule/image)
  CREATE TABLE IF NOT EXISTS bus_schedule_image (
    id INT PRIMARY KEY DEFAULT 1,
    image_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
  );

  -- Mess menus
  CREATE TABLE IF NOT EXISTS mess_menus (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner')),
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    items TEXT[],
    category TEXT CHECK (category IN ('veg', 'non-veg', 'jain')) DEFAULT 'veg',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- PHC timetable
  CREATE TABLE IF NOT EXISTS phc_timetable (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    doctor_name TEXT NOT NULL,
    specialization TEXT,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Restaurants
  CREATE TABLE IF NOT EXISTS restaurants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Student uploads (academic-calendar, bus-schedule, course-timetable images per user)
  CREATE TABLE IF NOT EXISTS student_uploads (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    upload_type TEXT NOT NULL CHECK (upload_type IN ('academic-calendar','bus-schedule','course-timetable')),
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS student_uploads_user_type_key
    ON student_uploads(user_id, upload_type);

  ALTER TABLE student_uploads ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "student_uploads_select_own" ON student_uploads;
  CREATE POLICY "student_uploads_select_own"
    ON student_uploads FOR SELECT TO authenticated USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "student_uploads_insert_own" ON student_uploads;
  CREATE POLICY "student_uploads_insert_own"
    ON student_uploads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  DROP POLICY IF EXISTS "student_uploads_update_own" ON student_uploads;
  CREATE POLICY "student_uploads_update_own"
    ON student_uploads FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Storage: student-uploads bucket (create bucket "student-uploads" as Public in Dashboard first)
  DROP POLICY IF EXISTS "student_uploads_insert_own_folder" ON storage.objects;
  CREATE POLICY "student_uploads_insert_own_folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'student-uploads'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  DROP POLICY IF EXISTS "student_uploads_update_own_folder" ON storage.objects;
  CREATE POLICY "student_uploads_update_own_folder"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'student-uploads'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  DROP POLICY IF EXISTS "student_uploads_delete_own_folder" ON storage.objects;
  CREATE POLICY "student_uploads_delete_own_folder"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'student-uploads'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
