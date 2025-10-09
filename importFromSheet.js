require("dotenv").config();
const mongoose = require("mongoose");
const Activity = require("./models/Activity");
const { GoogleSpreadsheet } = require("google-spreadsheet");

// 🆕 Import the official Google Auth library
const { JWT } = require("google-auth-library");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    // 🔑 Create a JWT client for Google Sheets API
    const serviceAccountAuth = new JWT({
      email: process.env.GS_CLIENT_EMAIL,
      key: process.env.GS_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    // 🧾 Pass it directly to GoogleSpreadsheet
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID, serviceAccountAuth);

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    console.log("🧾 Headers detected:", sheet.headerValues);
console.log("🧠 Sample row:", rows[0]);


const activities = rows.map((r) => {
  // Access cells by index (based on header order)
  const [
    centre,
    activityName,
    description,
    activityDate,
    activityTime,
    signUpInstruction,
    recommendedAudience,
  ] = r._rawData.map((v) => (v || "").toString().trim());

  // Handle multiple comma-separated dates
  const dates = (activityDate || "")
    .split(",")
    .map((d) => new Date(d.trim()))
    .filter((d) => !isNaN(d));

  return {
    centre: centre || "Unknown Centre",
    activityName: activityName || "Untitled Activity",
    description: description || "No description available.",
    activityDate: dates.length ? dates : [new Date()],
    activityTime,
    signUpInstruction,
    recommendedAudience,
  };
});



    await Activity.deleteMany();
    await Activity.insertMany(activities);
    console.log(`✅ Imported ${activities.length} activities from Google Sheet`);
  } catch (err) {
    console.error("❌ Import failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
})();
