// models/Activity.js
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  activityName: { type: String, required: true },
  centre: { type: String, required: true },
  description: { type: String, required: true },
  activityDate: { type: [Date] },
  activityTime: { type: String },
  signUpInstruction: String,
  recommendedAudience: String,

  // NEW: highlight fields
  isHighlight: { type: Boolean, default: false },
  highlightNote: { type: String },   // e.g. "Registration Required", "Fees Apply", "New"
  highlightOrder: { type: Number }   // optional ordering (1,2,3…)
});

module.exports = mongoose.model('Activity', activitySchema);
