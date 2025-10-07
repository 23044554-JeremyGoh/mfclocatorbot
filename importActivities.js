// importActivities.js
require('dotenv').config();
const mongoose = require('mongoose');
const Activity = require('./models/Activity');
const activities = require('./activities.json');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Activity.deleteMany(); // Optional: clear old ones
    await Activity.insertMany(activities);
    console.log("✅ Activities imported!");
    process.exit();
  } catch (err) {
    console.error("❌ Error importing:", err);
    process.exit(1);
  }
})();
