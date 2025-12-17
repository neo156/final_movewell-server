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
    const { workoutId, title, duration, caloriesBurned } = req.body;
    if (!workoutId || !title || !duration) {
      return res.status(400).json({ error: 'Workout details are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          workoutsCompleted: {
            workoutId,
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
    console.error('Record workout error:', err);
    res.status(500).json({ error: 'Failed to record workout' });
  }
});

// Record completed habit
app.post('/api/progress/habit', verifyToken, async (req, res) => {
  try {
    const { habitId, title, actual } = req.body;
    console.log('Received habit data:', { habitId, title, actual, body: req.body });
    
    if (!habitId || !title) {
      return res.status(400).json({ error: 'Habit details are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const habitData = {
      habitId: String(habitId),
      title: String(title),
      timestamp: new Date(),
    };
    
    // Always add actual if provided (required for Walking/Running)
    if (actualValue !== undefined && actualValue !== null && !isNaN(actualValue) && isFinite(actualValue)) {
      habitData.actual = Number(actualValue);
      console.log('Adding actual value:', habitData.actual, 'type:', typeof habitData.actual);
    } else if (title.includes('Walking') || title.includes('Running')) {
      console.error('Walking/Running habit has invalid actual value:', { actual, actualValue });
      return res.status(400).json({ error: 'Invalid distance value for Walking/Running habit' });
    }
    
    console.log('Saving habit data:', habitData);

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          habitsCompleted: habitData,
        },
      },
      { new: true, upsert: true }
    );

    console.log('Saved progress habitsCompleted:', progress.habitsCompleted);

    // Update streak
    await updateStreak(req.userId);

    res.json({ success: true, habit: habitData, progress });
  } catch (err) {
    console.error('Record habit error:', err);
    res.status(500).json({ error: 'Failed to record habit' });
  }
});

// Record completed stretch
app.post('/api/progress/stretch', verifyToken, async (req, res) => {
  try {
    const { stretchId, title, duration } = req.body;
    if (!stretchId || !title || !duration) {
      return res.status(400).json({ error: 'Stretch details are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          stretchesCompleted: {
            stretchId,
            title,
            duration,
          },
        },
        $inc: {
          minutesExercised: duration,
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
    const { warmupId, title, duration } = req.body;
    if (!warmupId || !title || !duration) {
      return res.status(400).json({ error: 'Warmup details are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId, date: today },
      {
        $push: {
          warmupsCompleted: {
            warmupId,
            title,
            duration,
          },
        },
        $inc: {
          minutesExercised: duration,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    // Get weekly data (last 7 days)
    const weekStart = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(today.getDate() - daysToMonday);
    
    const weeklyProgress = await Progress.find({
      userId: req.userId,
      date: { $gte: weekStart, $lte: today },
    });

    const weeklyData = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    days.forEach((day, index) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + index);
      dayDate.setHours(0, 0, 0, 0);
      
      const dayProgress = weeklyProgress.find(p => 
        p.date.getTime() === dayDate.getTime()
      );
      
      let dayDistance = 0;
      if (dayProgress?.habitsCompleted) {
        const walking = dayProgress.habitsCompleted.find(h => h.title?.includes('Walking'));
        const running = dayProgress.habitsCompleted.find(h => h.title?.includes('Running'));
        if (walking?.actual) dayDistance += walking.actual;
        if (running?.actual) dayDistance += running.actual;
      }
      
      weeklyData[day] = {
        workouts: dayProgress?.workoutsCompleted?.length || 0,
        habits: dayProgress?.habitsCompleted?.length || 0,
        minutes: dayProgress?.minutesExercised || 0,
        calories: dayProgress?.caloriesBurned || 0,
        km: dayDistance,
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivityDate = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    lastActivityDate?.setHours(0, 0, 0, 0);

    const todayTime = today.getTime();
    const lastActivityTime = lastActivityDate?.getTime();
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


