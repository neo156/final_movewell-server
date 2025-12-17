const mongoose = require('mongoose');

const streakSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActivityDate: { type: Date, default: null },
    totalWorkoutsCompleted: { type: Number, default: 0 },
    totalHabitsCompleted: { type: Number, default: 0 },
  },
  { timestamps: true }
);

streakSchema.index({ userId: 1 });

const Streak = mongoose.model('Streak', streakSchema);

module.exports = { Streak };
