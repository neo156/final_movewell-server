const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { User } = require('./models/user');
const { Progress } = require('./models/progress');
const { Streak } = require('./models/streak');

const app = express();
const port = process.env.PORT || 4000;
const mongoUri =
  process.env.MONGODB_URI ||
  'mongodb+srv://ninoespe01_db_user:ninoespe01_db_user@users.kkykygp.mongodb.net/?appName=Users';

app.use(cors());
app.use(express.json());

const jwtSecret = process.env.JWT_SECRET || 'development_secret_change_me';

const signToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, name: user.name }, jwtSecret, {
    expiresIn: '7d',
  });

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });
    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login existing user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().limit(50).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create user' });
  }
});

// Get current user profile (protected)
app.get('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile (protected)
app.put('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    user.name = name;
    user.email = email;
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload profile picture (protected)
app.put('/api/user/profile-picture', verifyToken, async (req, res) => {
  try {
    const { profilePicture } = req.body;
    if (!profilePicture) {
      return res.status(400).json({ error: 'Profile picture is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Store the image URI (in production, you'd upload to cloud storage and store the URL)
    user.profilePicture = profilePicture;
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

// Change password (protected)
app.put('/api/user/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ==================== PROGRESS TRACKING ENDPOINTS ====================

// Get today's progress
app.get('/api/progress/today', verifyToken, async (req, res) => {
  try {
    // Use local date to match user's timezone - create date at midnight local time
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let progress = await Progress.findOne({
      userId: req.userId,
      date: today,
    });

    if (!progress) {
      progress = await Progress.create({
        userId: req.userId,
        date: today,
      });
    }

    res.json(progress);
  } catch (err) {
    console.error('Get today progress error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get progress for a specific date range
app.get('/api/progress/range', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const progress = await Progress.find({
      userId: req.userId,
      date: { $gte: start, $lte: end },
    }).sort({ date: -1 });

    res.json(progress);
  } catch (err) {
    console.error('Get progress range error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Add steps
app.post('/api/progress/steps', verifyToken, async (req, res) => {
  try {
    const { steps } = req.body;
    if (typeof steps !== 'number' || steps < 0) {
      return res.status(400).json({ error: 'Valid steps count is required' });
    }

    // Use local date to match user's timezone - create date at midnight local time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      { $inc: { steps } },
      { new: true, upsert: true }
    );

    res.json(progress);
  } catch (err) {
    console.error('Add steps error:', err);
    res.status(500).json({ error: 'Failed to add steps' });
  }
});

// Record completed workout
app.post('/api/progress/workout', verifyToken, async (req, res) => {
  try {
    const { workoutId, title, duration, caloriesBurned, date } = req.body;
    if (!workoutId || !title || !duration) {
      return res.status(400).json({ error: 'Workout details are required' });
    }

    // Use date from client (user's local date) or fall back to server's local date
    let today;
    if (date && typeof date === 'string') {
      // Parse YYYY-MM-DD format from client and create UTC date to ensure correct date storage
      const [year, month, day] = date.split('-').map(Number);
      today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Fallback to server's local date
      today = new Date();
      today.setHours(0, 0, 0, 0);
    }

    // Check if this workoutId already exists to prevent duplicates
    const existingProgressToday = await Progress.findOne({
      userId: req.userId,
      date: today,
      'workoutsCompleted.workoutId': workoutId,
    });

    if (existingProgressToday) {
      // Workout already exists today, return existing progress without duplicating
      return res.json(existingProgressToday);
    }

    // Also check yesterday to prevent cross-day duplicates
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const existingProgressYesterday = await Progress.findOne({
      userId: req.userId,
      date: yesterday,
      'workoutsCompleted.workoutId': workoutId,
    });

    if (existingProgressYesterday) {
      // Workout already exists yesterday, return existing progress without duplicating
      return res.json(existingProgressYesterday);
    }

    // Ensure caloriesBurned is a number
    const caloriesValue = Number(caloriesBurned) || 0;

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          workoutsCompleted: {
            workoutId,
            title,
            duration,
            caloriesBurned: caloriesValue,
          },
        },
        $inc: {
          minutesExercised: duration,
          caloriesBurned: caloriesValue,
        },
      },
      { new: true, upsert: true }
    );

    // Update streak
    await updateStreak(req.userId);

    res.json(progress);
  } catch (err) {
    console.error('Record workout error:', err);
    res.status(500).json({ error: 'Failed to record workout' });
  }
});

// Record completed habit
app.post('/api/progress/habit', verifyToken, async (req, res) => {
  try {
    const { habitId, title, actual, date } = req.body;
    console.log('Received habit data:', { habitId, title, actual, body: req.body });
    
    if (!habitId || !title) {
      return res.status(400).json({ error: 'Habit details are required' });
    }

    // Use date from client (user's local date) or fall back to server's local date
    let today;
    if (date && typeof date === 'string') {
      // Parse YYYY-MM-DD format from client and create UTC date to ensure correct date storage
      const [year, month, day] = date.split('-').map(Number);
      today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Fallback to server's local date
      today = new Date();
      today.setHours(0, 0, 0, 0);
    }

    // Convert actual to number if it's a string
    let actualValue = actual;
    if (typeof actual === 'string') {
      actualValue = parseFloat(actual);
    }
    
    // Validate that Walking/Running habits have actual value
    if (title.includes('Walking') || title.includes('Running')) {
      if (actualValue === undefined || actualValue === null || isNaN(actualValue) || !isFinite(actualValue)) {
        console.error('Walking/Running habit missing or invalid actual value:', { title, actual, actualValue });
        return res.status(400).json({ error: 'Walking and Running habits require a valid distance value (km)' });
      }
      if (actualValue <= 0) {
        return res.status(400).json({ error: 'Distance must be greater than 0' });
      }
      if (actualValue > 10000) {
        return res.status(400).json({ error: 'Distance value is too large (max 10000 km)' });
      }
    }

    // Build habit object - MUST include actual for Walking/Running
    // For Walking/Running, actual is REQUIRED and was already validated above
    const habitToSave = {
      habitId: String(habitId),
      title: String(title),
      timestamp: new Date(),
    };
    
    // FORCE include actual for Walking/Running (already validated above)
    if (title.includes('Walking') || title.includes('Running')) {
      // actualValue was already validated, so it MUST be a valid number here
      habitToSave.actual = Number(actualValue);
      console.log('✓ Walking/Running - FORCED actual value:', habitToSave.actual, 'type:', typeof habitToSave.actual);
    } else if (actualValue !== undefined && actualValue !== null && !isNaN(actualValue) && isFinite(actualValue)) {
      // For other habits, include actual if provided
      habitToSave.actual = Number(actualValue);
      console.log('✓ Other habit - Added actual value:', habitToSave.actual);
    }
    
    console.log('📝 FINAL habit object BEFORE database save:');
    console.log(JSON.stringify(habitToSave, null, 2));
    console.log('📝 Object keys:', Object.keys(habitToSave));
    console.log('📝 actual field exists?', 'actual' in habitToSave);
    console.log('📝 actual value:', habitToSave.actual, 'type:', typeof habitToSave.actual);

    // Build the final habit object to push - ensure actual is included
    const habitToPush = {
      habitId: String(habitId),
      title: String(title),
      timestamp: new Date(),
    };
    
    // CRITICAL: For Walking/Running, actual MUST be included (already validated)
    if (title.includes('Walking') || title.includes('Running')) {
      habitToPush.actual = Number(actualValue);
      console.log('🔧🔧🔧 Walking/Running - actual added to habitToPush:', habitToPush.actual);
    } else if (actualValue !== undefined && actualValue !== null && !isNaN(actualValue) && isFinite(actualValue)) {
      habitToPush.actual = Number(actualValue);
    }
    
    console.log('🔧🔧🔧 FINAL habitToPush object:', JSON.stringify(habitToPush, null, 2));
    console.log('🔧🔧🔧 habitToPush.actual:', habitToPush.actual, 'type:', typeof habitToPush.actual);
    
    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          habitsCompleted: habitToPush,
        },
      },
      { new: true, upsert: true, runValidators: false }
    );

    console.log('💾 Database save completed');
    console.log('💾 Saved progress habitsCompleted (RAW):', JSON.stringify(progress.habitsCompleted, null, 2));
    console.log('💾 Verifying actual values in saved habits:');
    if (progress.habitsCompleted && Array.isArray(progress.habitsCompleted)) {
      progress.habitsCompleted.forEach((habit, index) => {
        const habitObj = habit.toObject ? habit.toObject() : habit;
        console.log(`  💾 Habit ${index} (${habitObj.title}):`, {
          habitId: habitObj.habitId,
          title: habitObj.title,
          actual: habitObj.actual,
          actualType: typeof habitObj.actual,
          hasActual: 'actual' in habitObj,
          allKeys: Object.keys(habitObj)
        });
      });
    }
    
    // Double-check by querying the database directly
    const verifyProgress = await Progress.findOne({ userId: req.userId, date: today });
    if (verifyProgress && verifyProgress.habitsCompleted) {
      console.log('🔍 VERIFICATION - Direct database query:');
      verifyProgress.habitsCompleted.forEach((habit, index) => {
        const habitObj = habit.toObject ? habit.toObject() : habit;
        console.log(`  🔍 Habit ${index}:`, JSON.stringify(habitObj, null, 2));
      });
    }

    // Update streak
    await updateStreak(req.userId);

    res.json({ success: true, habit: habitToSave, progress });
  } catch (err) {
    console.error('Record habit error:', err);
    res.status(500).json({ error: 'Failed to record habit' });
  }
});

// Record completed stretch
app.post('/api/progress/stretch', verifyToken, async (req, res) => {
  try {
    const { stretchId, title, duration, caloriesBurned, date } = req.body;
    if (!stretchId || !title || !duration) {
      return res.status(400).json({ error: 'Stretch details are required' });
    }

    // Use date from client (user's local date) or fall back to server's local date
    let today;
    if (date && typeof date === 'string') {
      // Parse YYYY-MM-DD format from client and create UTC date to ensure correct date storage
      const [year, month, day] = date.split('-').map(Number);
      today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Fallback to server's local date
      today = new Date();
      today.setHours(0, 0, 0, 0);
    }

    // Check if this stretchId already exists in today OR yesterday to prevent duplicates
    const existingProgressToday = await Progress.findOne({
      userId: req.userId,
      date: today,
      'stretchesCompleted.stretchId': stretchId,
    });

    if (existingProgressToday) {
      // Stretch already exists today, return existing progress without duplicating
      return res.json(existingProgressToday);
    }

    // Also check yesterday to prevent cross-day duplicates
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const existingProgressYesterday = await Progress.findOne({
      userId: req.userId,
      date: yesterday,
      'stretchesCompleted.stretchId': stretchId,
    });

    if (existingProgressYesterday) {
      // Stretch already exists yesterday, return existing progress without duplicating
      return res.json(existingProgressYesterday);
    }

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          stretchesCompleted: {
            stretchId,
            title,
            duration,
            caloriesBurned: caloriesBurned || 0,
          },
        },
        $inc: {
          minutesExercised: duration,
          caloriesBurned: caloriesBurned || 0,
        },
      },
      { new: true, upsert: true }
    );

    // Update streak
    await updateStreak(req.userId);

    res.json(progress);
  } catch (err) {
    console.error('Record stretch error:', err);
    res.status(500).json({ error: 'Failed to record stretch' });
  }
});

// Record completed warmup
app.post('/api/progress/warmup', verifyToken, async (req, res) => {
  try {
    const { warmupId, title, duration, caloriesBurned, date } = req.body;
    if (!warmupId || !title || !duration) {
      return res.status(400).json({ error: 'Warmup details are required' });
    }

    // Use date from client (user's local date) or fall back to server's local date
    let today;
    if (date && typeof date === 'string') {
      // Parse YYYY-MM-DD format from client and create UTC date to ensure correct date storage
      const [year, month, day] = date.split('-').map(Number);
      today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Fallback to server's local date
      today = new Date();
      today.setHours(0, 0, 0, 0);
    }

    // Check if this warmupId already exists in today OR yesterday to prevent duplicates
    const existingProgressToday = await Progress.findOne({
      userId: req.userId,
      date: today,
      'warmupsCompleted.warmupId': warmupId,
    });

    if (existingProgressToday) {
      // Warmup already exists today, return existing progress without duplicating
      return res.json(existingProgressToday);
    }

    // Also check yesterday to prevent cross-day duplicates
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const existingProgressYesterday = await Progress.findOne({
      userId: req.userId,
      date: yesterday,
      'warmupsCompleted.warmupId': warmupId,
    });

    if (existingProgressYesterday) {
      // Warmup already exists yesterday, return existing progress without duplicating
      return res.json(existingProgressYesterday);
    }

    // Ensure caloriesBurned is a number
    const caloriesValue = Number(caloriesBurned) || 0;

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          warmupsCompleted: {
            warmupId,
            title,
            duration,
            caloriesBurned: caloriesValue,
          },
        },
        $inc: {
          minutesExercised: duration,
          caloriesBurned: caloriesValue,
        },
      },
      { new: true, upsert: true }
    );

    // Update streak
    await updateStreak(req.userId);

    res.json(progress);
  } catch (err) {
    console.error('Record warmup error:', err);
    res.status(500).json({ error: 'Failed to record warmup' });
  }
});

// Get stats (summary)
app.get('/api/progress/stats', verifyToken, async (req, res) => {
  try {
    // Get date from query parameter or use today's date
    // Accept date in YYYY-MM-DD format from client, or use server's current date
    let today;
    const dateParam = req.query.date;
    
    if (dateParam && typeof dateParam === 'string') {
      // Parse YYYY-MM-DD format from client and create UTC date to match stored dates
      const [year, month, day] = dateParam.split('-').map(Number);
      today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Use current date in UTC to match how dates are stored
      const now = new Date();
      today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    }

    const todayProgress = await Progress.findOne({
      userId: req.userId,
      date: today,
    });

    const streak = await Streak.findOne({ userId: req.userId });

    // Calculate total distance from ALL Walking/Running habits for TODAY only
    let totalDistance = 0;
    if (todayProgress?.habitsCompleted && Array.isArray(todayProgress.habitsCompleted)) {
      todayProgress.habitsCompleted.forEach(habit => {
        if ((habit.title?.includes('Walking') || habit.title?.includes('Running')) && habit.actual) {
          totalDistance += Number(habit.actual) || 0;
        }
      });
    }

    // Get weekly data (last 7 days) - use UTC to match stored dates
    const weekStart = new Date(today);
    const dayOfWeek = today.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setUTCDate(today.getUTCDate() - daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    
    const weeklyProgress = await Progress.find({
      userId: req.userId,
      date: { $gte: weekStart, $lte: weekEnd },
    });

    const weeklyData = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    days.forEach((day, index) => {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + index);
      dayDate.setUTCHours(0, 0, 0, 0);
      
      // Find progress for this specific day - compare dates properly using UTC
      const dayProgress = weeklyProgress.find(p => {
        if (!p.date) return false;
        const pDate = new Date(p.date);
        // Normalize to UTC for comparison
        const pDateUTC = new Date(Date.UTC(pDate.getUTCFullYear(), pDate.getUTCMonth(), pDate.getUTCDate(), 0, 0, 0, 0));
        // Compare timestamps
        return pDateUTC.getTime() === dayDate.getTime();
      });
      
      // DEBUG: Log what we found for this day
      if (dayProgress) {
        console.log(`📅 ${day} (${dayDate.toISOString().split('T')[0]}): Found progress record`);
        console.log(`   - workoutsCompleted: ${dayProgress.workoutsCompleted?.length || 0} items`);
        if (dayProgress.workoutsCompleted && dayProgress.workoutsCompleted.length > 0) {
          console.log(`   - Workout details:`, dayProgress.workoutsCompleted.map(w => ({ title: w.title, workoutId: w.workoutId })));
        }
        console.log(`   - warmupsCompleted: ${dayProgress.warmupsCompleted?.length || 0} items`);
        console.log(`   - stretchesCompleted: ${dayProgress.stretchesCompleted?.length || 0} items`);
      } else {
        console.log(`📅 ${day} (${dayDate.toISOString().split('T')[0]}): No progress record found`);
      }
      
      // Sum ALL Walking and Running habits (not just the first one)
      let dayDistance = 0;
      if (dayProgress?.habitsCompleted && Array.isArray(dayProgress.habitsCompleted)) {
        dayProgress.habitsCompleted.forEach(habit => {
          if ((habit.title?.includes('Walking') || habit.title?.includes('Running')) && habit.actual) {
            dayDistance += Number(habit.actual) || 0;
          }
        });
      }
      
      // IMPORTANT: Only count workoutsCompleted, NOT warmups or stretches
      const workoutCount = dayProgress?.workoutsCompleted?.length || 0;
      
      weeklyData[day] = {
        workouts: workoutCount,
        habits: dayProgress?.habitsCompleted?.length || 0,
        minutes: dayProgress?.minutesExercised || 0,
        calories: dayProgress?.caloriesBurned || 0,
        km: dayDistance,
        streak: 0, // Weekly data doesn't track streak per day
      };
    });

    const stats = {
      today: {
        distance: totalDistance,
        minutesExercised: todayProgress?.minutesExercised || 0,
        caloriesBurned: todayProgress?.caloriesBurned || 0,
        workoutsCompleted: todayProgress?.workoutsCompleted?.length || 0,
        habitsCompleted: todayProgress?.habitsCompleted?.length || 0,
        stretchesCompleted: todayProgress?.stretchesCompleted?.length || 0,
        warmupsCompleted: todayProgress?.warmupsCompleted?.length || 0,
        habits: todayProgress?.habitsCompleted || [],
      },
      streak: {
        current: streak?.currentStreak || 0,
        longest: streak?.longestStreak || 0,
        totalWorkouts: streak?.totalWorkoutsCompleted || 0,
        totalHabits: streak?.totalHabitsCompleted || 0,
      },
      weekly: weeklyData,
    };

    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Helper function to update streak
async function updateStreak(userId) {
  try {
    let streak = await Streak.findOne({ userId });
    if (!streak) {
      streak = await Streak.create({ userId });
    }

    // Use local date to match user's timezone - create date at midnight local time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivityDate = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    let lastActivityDateLocal = null;
    if (lastActivityDate) {
      lastActivityDateLocal = new Date(lastActivityDate);
      lastActivityDateLocal.setHours(0, 0, 0, 0);
    }

    const todayTime = today.getTime();
    const lastActivityTime = lastActivityDateLocal?.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Check if this is today's activity
    if (todayTime !== lastActivityTime) {
      // Check if it's consecutive (yesterday + today)
      if (lastActivityTime && todayTime - lastActivityTime === oneDayMs) {
        streak.currentStreak += 1;
      } else if (todayTime !== lastActivityTime) {
        // If not consecutive, reset streak
        streak.currentStreak = 1;
      }

      // Update longest streak
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }

      streak.lastActivityDate = today;
    }

    streak.totalWorkoutsCompleted += 1;
    await streak.save();
  } catch (err) {
    console.error('Update streak error:', err);
  }
}

mongoose
  .connect(mongoUri, { dbName: process.env.MONGODB_DB || 'movewell' })
  .then(() => {
    console.log('Connected to MongoDB');
    // Listen on 0.0.0.0 to accept connections from other devices on the network
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${port}`);
      console.log(`Server accessible from network at http://<your-ip>:${port}`);
      console.log('Make sure your phone and computer are on the same WiFi network!');
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });


