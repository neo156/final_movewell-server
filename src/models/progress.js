const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: () => new Date().setHours(0, 0, 0, 0) },
    steps: { type: Number, default: 0 },
    caloriesBurned: { type: Number, default: 0 },
    minutesExercised: { type: Number, default: 0 },
    workoutsCompleted: [
      {
        workoutId: String,
        title: String,
        duration: Number,
        caloriesBurned: Number,
        timestamp: { type: Date, default: Date.now },
      }
    ],
    habitsCompleted: [
      {
        habitId: { type: String, required: true },
        title: { type: String, required: true },
        actual: { type: Number }, // Actual value for numeric habits (e.g., 5 km for Walking)
        timestamp: { type: Date, default: Date.now },
      }
    ],
    stretchesCompleted: [
      {
        stretchId: String,
        title: String,
        duration: Number,
        timestamp: { type: Date, default: Date.now },
      }
    ],
    warmupsCompleted: [
      {
        warmupId: String,
        title: String,
        duration: Number,
        timestamp: { type: Date, default: Date.now },
      }
    ],
  },
  { 
    timestamps: true,
    strict: false // Allow fields not in schema to be saved
  }
);

// Index for efficient querying
progressSchema.index({ userId: 1, date: -1 });

const Progress = mongoose.model('Progress', progressSchema);

module.exports = { Progress };
