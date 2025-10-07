const mongoose = require("mongoose");
const Centre = require("./models/Centre");
const Activity = require("./models/Activity");

require("dotenv").config();
const { Telegraf } = require("telegraf");
const axios = require("axios");
const PDFDocument = require("pdfkit"); // PDF generation
const fs = require("fs");
const path = require("path");

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Simple state to know we're waiting for a keyword
const searchState = new Map(); // chatId -> 'search_type'

// For the postal-code flow (Location > Enter Postal Code)
const waitingForPostalCode = new Map(); // chatId -> category (e.g. 'families', 'seniors_active')

// For Activities > Enter postal flow (centre selection + download)
const activitiesPostalFlow = new Map();
// chatId -> { step: 'awaiting_postal'|'list_centres', coords: {lat,lng}, centres: [{...}] }

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Start command with menu (single-column)
bot.command("start", (ctx) => {
  ctx.telegram.sendMessage(
    ctx.chat.id,
    `Welcome to Montfort Care’s Nearby Bot! 👋  

Use the menu below to get started:\n  
📍 Location – Find the nearest Montfort Care centres.\n  
📅 Activities – Browse or search upcoming activities and programmes by centre, type, or location.  
`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📍 Location", callback_data: "location_menu" }],
          [{ text: "📅 Activities", callback_data: "activities_menu" }],
        ],
      },
    }
  );
});

// Location menu (single-column)
bot.action("location_menu", async (ctx) => {
  await ctx.answerCbQuery();

  ctx.reply(
    "<b>📍 Find a centre by category</b>\n\nChoose a category below, or use the search options at the bottom.",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏠 Families", callback_data: "category_families" }],
          [{ text: "🧒 Children", callback_data: "category_children" }],
          [{ text: "👵 Seniors", callback_data: "category_seniors" }],
          [{ text: "🚫 Anti-Violence", callback_data: "category_anti_violence" }],
          [{ text: "🧠 Mental Health", callback_data: "category_mental_health" }],
          [{ text: "🤝 Caregiving", callback_data: "category_caregiving" }],
          [{ text: "🔍 Search by Centre Name", callback_data: "search_centre" }],
          [{ text: "📮 Enter Postal Code", callback_data: "enter_postal" }],
        ],
      },
    }
  );
});

bot.action("category_families", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const centres = await Centre.find({ category: "families" });

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📍 ${escapeHtml(
        centre.address || ""
      )}\n📞 ${escapeHtml(centre.phone || "N/A")}\n✉️ ${escapeHtml(
        centre.email || "N/A"
      )}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📅 View Activities",
                callback_data: `see_activity_${centre._id}`,
              },
            ],
          ],
        },
      });
    }

    await ctx.reply(
      "⬅️ Would you like to return to the main menu or return to previous categories?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: "menu" }],
            [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          ],
        },
        parse_mode: "HTML",
      }
    );
  } catch (err) {
    console.error("❌ Error fetching centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }
});

bot.action("category_children", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const centres = await Centre.find({ category: "children" });

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📍 ${escapeHtml(
        centre.address || ""
      )}\n📞 ${escapeHtml(centre.phone || "N/A")}\n✉️ ${escapeHtml(
        centre.email || "N/A"
      )}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
      });
    }
  } catch (err) {
    console.error("❌ Error fetching centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }

  await ctx.reply(
    "⬅️ Would you like to return to the main menu or return to previous categories?",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Menu", callback_data: "menu" }],
          [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
        ],
      },
    }
  );
});

bot.action("category_anti_violence", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const centres = await Centre.find({ category: "anti_violence" });

    if (!centres.length) {
      return ctx.reply("No anti-violence centres or services found.");
    }

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📞 ${escapeHtml(
        centre.phone || "N/A"
      )}\n✉️ ${escapeHtml(centre.email || "N/A")}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
      });
    }

    await ctx.reply(
      "⬅️ Would you like to return to the main menu or return to previous categories?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: "menu" }],
            [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          ],
        },
        parse_mode: "HTML",
      }
    );
  } catch (err) {
    console.error("❌ Error fetching anti-violence centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }
});

bot.action("category_mental_health", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const centres = await Centre.find({ category: "mental_health" });

    if (!centres.length) {
      return ctx.reply("No mental health centres or services found.");
    }

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📍 ${escapeHtml(
        centre.address || ""
      )}\n📞 ${escapeHtml(centre.phone || "N/A")}\n✉️ ${escapeHtml(
        centre.email || "N/A"
      )}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
      });
    }

    await ctx.reply(
      "⬅️ Would you like to return to the main menu or return to previous categories?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: "menu" }],
            [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          ],
        },
        parse_mode: "HTML",
      }
    );
  } catch (err) {
    console.error("❌ Error fetching mental health centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }
});

bot.action("category_caregiving", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const centres = await Centre.find({ category: "caregiving" });

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📍 ${escapeHtml(
        centre.address || ""
      )}\n📞 ${escapeHtml(centre.phone || "N/A")}\n✉️ ${escapeHtml(
        centre.email || "N/A"
      )}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
      });
    }
  } catch (err) {
    console.error("❌ Error fetching centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }

  await ctx.reply(
    "⬅️ Would you like to return to the main menu or return to previous categories?",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Menu", callback_data: "menu" }],
          [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
        ],
      },
    }
  );
});

bot.action("category_seniors", async (ctx) => {
  await ctx.answerCbQuery();

  ctx.reply("Please choose a seniors service type:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🧘 Active Ageing Centre", callback_data: "seniors_active" }],
        [{ text: "🍱 Community Kitchen", callback_data: "seniors_kitchen" }],
        [{ text: "🏠 GoodLife at Home", callback_data: "seniors_home" }],
        [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
      ],
    },
  });
});

bot.action("search_centre", async (ctx) => {
  await ctx.answerCbQuery();
  searchState.set(ctx.chat.id, "search_centre");
  await ctx.reply(
    '🔍 Type the name of the centre you want to find (e.g. "GoodLife", "Marine Parade").'
  );
});

bot.action(/^seniors_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const subcategory = ctx.match[1]; // active, kitchen, or home
  const fullCategory = `seniors_${subcategory}`; // matches MongoDB category field

  try {
    const centres = await Centre.find({ category: fullCategory });

    if (!centres.length) {
      return ctx.reply("No centres found for this subcategory.");
    }

    for (const centre of centres) {
      const message = `<b>${escapeHtml(centre.name)}</b>\n\n📍 ${escapeHtml(
        centre.address || ""
      )}\n📞 ${escapeHtml(centre.phone || "N/A")}\n✉️ ${escapeHtml(
        centre.email || "N/A"
      )}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📅 View Activities",
                callback_data: `see_activity_${centre._id}`,
              },
            ],
          ],
        },
      });
    }
  } catch (err) {
    console.error("❌ Error fetching seniors centres:", err);
    ctx.reply("❌ Failed to fetch centres.");
  }
  await ctx.reply(
    "⬅️ Would you like to return to the main menu or return to previous categories?",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Menu", callback_data: "menu" }],
          [{ text: "🔄 Back to Categories", callback_data: "category_seniors" }],
        ],
      },
      parse_mode: "HTML",
    }
  );
});

bot.action(/see_activity_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const centreId = ctx.match[1];

  try {
    const centre = await Centre.findById(centreId).lean();
    if (!centre) return ctx.reply("❌ Centre not found");

    // 1) Show all activities first (with a header)
    const activities = await Activity.find({ centre: centre.name });
    if (!activities.length) {
      return ctx.reply("No activities found for this centre.");
    }

    await sendActivitiesChunked(ctx, activities, {
      header: `📍 Activities at ${escapeHtml(centre.name)}`,
    });

    // 2) Then show current-month highlights (for Bedok 609 / 613B only)
    if (isBedok609(centre.name) || isBedok613B(centre.name)) {
      const { start, end } = monthRange();
      const highlights = await Activity.find({
        centre: centre.name,
        isHighlight: true,
        activityDate: { $elemMatch: { $gte: start, $lte: end } },
      })
        .sort({ highlightOrder: 1, activityName: 1 })
        .lean();

      const highlightsText = formatHighlightsText(highlights);
      if (highlightsText) {
        await ctx.reply(highlightsText, { parse_mode: "HTML" });
      }
    }

    // Back to menu
    await ctx.reply("What would you like to do next?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }],
        ],
      },
    });
  } catch (err) {
    console.error("❌ Error showing activities:", err);
    await ctx.reply("❌ Failed to load activities.");
  }
});

// Helper: convert DB category to display name (matches Location menu)
function getCategoryDisplay(category) {
  const map = {
    families: "🏠 Families",
    children: "🧒 Children",
    anti_violence: "🚫 Anti-Violence",
    mental_health: "🧠 Mental Health",
    caregiving: "🤝 Caregiving",
    seniors_active: "👵 Seniors (Active Ageing Centre)",
    seniors_kitchen: "👵 Seniors (Community Kitchen)",
    seniors_home: "👵 Seniors (GoodLife at Home)",
  };
  return map[category] || category;
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return { start, end };
}

function formatHighlightsText(items) {
  if (!items.length) return "";
  let out = "<b>🌟 Highlights of the Month </b>\n\n";
  for (const a of items) {
    out += buildActivityBlockCompact(a);
  }
  return out.trim();
}

// -----------------------------
// Location > Enter Postal Code
// -----------------------------
bot.action("enter_postal", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Which type of centres are you looking for?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 Families", callback_data: "postal_families" }],
        [{ text: "🧒 Children", callback_data: "postal_children" }],
        [{ text: "👵 Seniors", callback_data: "postal_seniors" }],
        [{ text: "🚫 Anti-Violence", callback_data: "postal_anti_violence" }],
        [{ text: "🧠 Mental Health", callback_data: "postal_mental_health" }],
        [{ text: "🤝 Caregiving", callback_data: "postal_caregiving" }],
        [{ text: "🔙 Back to Categories", callback_data: "location_menu" }],
        [{ text: "🏠 Main Menu", callback_data: "menu" }],
      ],
    },
  });
});

// Seniors subcategory for postal flow (single-column)
bot.action("postal_seniors", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("👵 Which type of seniors centres are you looking for?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🧓 Active Ageing Centre", callback_data: "postal_seniors_active" }],
        [{ text: "🍳 Community Kitchen", callback_data: "postal_seniors_kitchen" }],
        [{ text: "🏠 GoodLife At Home", callback_data: "postal_seniors_home" }],
        [{ text: "🔙 Back", callback_data: "enter_postal" }],
      ],
    },
  });
});

// Helper: prompt for postal or location
function promptForPostalOrLocation(ctx, label) {
  return ctx.reply(
    `To find the nearest ${label}, either:\n\n• Enter your 6-digit postal code\n• Or tap “📍 Share Location”`,
    {
      reply_markup: {
        keyboard: [[{ text: "📍 Share Location", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

// Base categories (Location flow)
for (const cat of [
  "families",
  "children",
  "anti_violence",
  "mental_health",
  "caregiving",
]) {
  bot.action(`postal_${cat}`, async (ctx) => {
    await ctx.answerCbQuery();
    waitingForPostalCode.set(ctx.chat.id, cat);
    await promptForPostalOrLocation(ctx, cat.replace("_", " "));
  });
}

// Seniors (Location flow)
bot.action("postal_seniors_active", async (ctx) => {
  await ctx.answerCbQuery();
  waitingForPostalCode.set(ctx.chat.id, "seniors_active");
  await promptForPostalOrLocation(ctx, "Active Ageing Centre");
});

bot.action("postal_seniors_kitchen", async (ctx) => {
  await ctx.answerCbQuery();
  waitingForPostalCode.set(ctx.chat.id, "seniors_kitchen");
  await promptForPostalOrLocation(ctx, "Community Kitchen");
});

bot.action("postal_seniors_home", async (ctx) => {
  await ctx.answerCbQuery();
  waitingForPostalCode.set(ctx.chat.id, "seniors_home");
  await promptForPostalOrLocation(ctx, "GoodLife At Home");
});

// Convert postal code -> lat/lng using OneMap, then show nearest centres
async function handlePostalCodeLookup(ctx, postalCode, category) {
  try {
    if (!process.env.ONEMAP_API_TOKEN) {
      console.warn("⚠️ ONEMAP_API_TOKEN missing; OneMap call may fail.");
    }

    const response = await axios.get(
      "https://www.onemap.gov.sg/api/common/elastic/search",
      {
        params: {
          searchVal: postalCode,
          returnGeom: "Y",
          getAddrDetails: "Y",
        },
        headers: { Authorization: process.env.ONEMAP_API_TOKEN || "" },
      }
    );

    const result =
      response.data && response.data.results && response.data.results[0];
    if (!result) {
      return ctx.reply("❌ No results found. Please check your postal code.");
    }

    const lat = parseFloat(result.LATITUDE);
    const lng = parseFloat(result.LONGITUDE);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return ctx.reply("❌ Invalid coordinates returned for that postal code.");
    }
    await showNearestCentresFromCoords(ctx, lat, lng, category);
  } catch (err) {
    console.error("OneMap error:", err?.response?.data || err.message);
    ctx.reply("❌ Error fetching location. Try again later.");
  }
}

// Compute nearest centres from MongoDB by category and show the top 3
async function showNearestCentresFromCoords(ctx, userLat, userLng, category) {
  try {
    const centres = await Centre.find({ category }).lean();
    if (!centres.length) {
      await ctx.reply("❌ No centres found for this category.");
      await ctx.reply("What would you like to do next?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔎 New Postal Code", callback_data: "enter_postal" }],
            [{ text: "📅 Activities Menu", callback_data: "activities_menu" }],
            [{ text: "🏠 Main Menu", callback_data: "menu" }],
            [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          ],
        },
        parse_mode: "HTML",
      });
      return;
    }

    const top = centres
      .map((c) => ({
        ...c,
        distance: getDistance(
          Number(c.lat),
          Number(c.lng),
          Number(userLat),
          Number(userLng)
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    for (const c of top) {
      if (typeof c.lat === "number" && typeof c.lng === "number") {
        await ctx.replyWithLocation(c.lat, c.lng);
      }
      const msg =
        `<b>${escapeHtml(c.name || "")}</b>\n\n` +
        `📍 ${escapeHtml(c.address || "")}\n` +
        (c.phone ? `📞 ${escapeHtml(c.phone)}\n` : "") +
        (c.email ? `✉️ ${escapeHtml(c.email)}\n` : "") +
        `📏 ~${(c.distance || 0).toFixed(1)} km away`;
      await ctx.reply(msg, { parse_mode: "HTML" });
    }

    await ctx.reply("What would you like to do next?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔎 New Postal Code", callback_data: "enter_postal" }],
          [{ text: "📅 Activities Menu", callback_data: "activities_menu" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }],
          [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
        ],
      },
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("Nearest centres error:", err);
    ctx.reply("❌ Failed to fetch centres. Please try again.");
  }
}

// Distance helper (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -----------------------------
// ACTIVITIES MENU + FLOWS
// -----------------------------
bot.action("activities_menu", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply("Choose how you want to browse activities:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📍 Show activities near me", callback_data: "act_near_me" }],
        [{ text: "🔎 Search by activity type", callback_data: "act_search_type" }],
        [{ text: "🏢 Enter postal code (by centre)", callback_data: "act_by_postal" }],
        [{ text: "🔙 Back to Menu", callback_data: "menu" }],
      ],
    },
  });
});

// Show activities near me (share live location only)
bot.action("act_near_me", async (ctx) => {
  await ctx.answerCbQuery();

  ctx.reply("Please share your location to see nearby activities:", {
    reply_markup: {
      keyboard: [[{ text: "📍 Share My Location", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Activities > Ask postal code (start flow)
bot.action("act_by_postal", async (ctx) => {
  await ctx.answerCbQuery();
  searchState.delete(ctx.chat.id); // avoid lingering search state
  activitiesPostalFlow.set(ctx.chat.id, { step: "awaiting_postal" });
  await ctx.reply(
    `Looking for activities at a center?\n\n Enter your 6-digit postal code or tap “📍 Share Location”`,
    {
      reply_markup: {
        keyboard: [[{ text: "📍 Share Location", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// Choose centre (after we have coords)
bot.action(/^act_choose_centre_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const centreId = ctx.match[1];

  try {
    const centre = await Centre.findById(centreId).lean();
    if (!centre) return ctx.reply("❌ Centre not found.");

    const acts = await Activity.find({ centre: centre.name }).lean();
    if (!acts.length) {
      await ctx.reply(
        `No upcoming activities found for ${escapeHtml(centre.name)}.`
      );
      return;
    }

    await sendActivitiesChunked(ctx, acts, {
      header: `📍 Activities at ${escapeHtml(centre.name)}`,
    });

    // 2) Highlights second (Bedok 609 / 613B)
    if (isBedok609(centre.name) || isBedok613B(centre.name)) {
      const { start, end } = monthRange();
      const highlights = await Activity.find({
        centre: centre.name,
        isHighlight: true,
        activityDate: { $elemMatch: { $gte: start, $lte: end } },
      })
        .sort({ highlightOrder: 1, activityName: 1 })
        .lean();

      const highlightsText = formatHighlightsText(highlights);
      if (highlightsText) {
        await ctx.reply(highlightsText, { parse_mode: "HTML" });
      }
    }
    await ctx.reply(
      `Download full activity list as PDF or return to Activities Menu:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬇️ Download PDF", callback_data: `act_download_pdf_${centre._id}` }],
            [{ text: "🔎 New Postal Code (by centre)", callback_data: "act_by_postal" }],
            [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
          ],
        },
        parse_mode: "HTML",
      }
    );
  } catch (e) {
    console.error("choose centre error:", e);
    await ctx.reply("❌ Failed to load centre activities. Please try again.");
  }
});

// Download activities as PDF
bot.action(/^act_download_pdf_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const centreId = ctx.match[1];

  try {
    const centre = await Centre.findById(centreId).lean();
    if (!centre) return ctx.reply("❌ Centre not found.");

    // If this is Bedok 609 or Bedok 613B → send the uploaded newsletter PDF directly
    if (isBedok609(centre.name) || isBedok613B(centre.name)) {
      // Candidate file paths for each
      const fileMap = {
        bedok609: [
          path.join(__dirname, "files", "bedok_609_aug2025.pdf"),
          path.join(
            __dirname,
            "files",
            "Goodlife Studio (Bedok 609) AAC Newsletter (Aug 2025).pdf"
          ),
          path.join(
            __dirname,
            "Goodlife Studio (Bedok 609) AAC Newsletter (Aug 2025).pdf"
          ),
        ],
        bedok613b: [
          path.join(__dirname, "files", "bedok_613b_aug2025.pdf"),
          path.join(
            __dirname,
            "files",
            "Goodlife Studio (Bedok 613B) AAC Newsletter (Aug 2025).pdf"
          ),
          path.join(
            __dirname,
            "Goodlife Studio (Bedok 613B) AAC (Aug 2025).pdf"
          ),
        ],
      };

      const candidates = isBedok609(centre.name)
        ? fileMap.bedok609
        : fileMap.bedok613b;
      const existing = candidates.find((p) => fs.existsSync(p));

      if (!existing) {
        await ctx.reply(
          `⚠️ ${centre.name} PDF not found on server. Generating a simple PDF instead…`
        );
      } else {
        await ctx.replyWithDocument(
          { source: existing },
          { caption: `📰 Activities for ${escapeHtml(centre.name)} – August 2025` }
        );
        await ctx.reply("⬅️ Would you like to return to the main menu?", {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu" }]],
          },
          parse_mode: "HTML",
        });
        return;
      }
    }

    // Fallback for other centres (or if Bedok PDF missing): generate on the fly
    const acts = await Activity.find({ centre: centre.name }).lean();
    const pdfBuffer = await createActivitiesPdfBuffer(centre, acts);
    const safeName = (centre.name || "centre").replace(/[^a-z0-9]+/gi, "_");

    await ctx.replyWithDocument(
      { source: pdfBuffer, filename: `activities_${safeName}.pdf` },
      { caption: `📄 Activities for ${escapeHtml(centre.name || "")}` }
    );

    await ctx.reply("⬅️ Would you like to return to the main menu?", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu" }]] },
      parse_mode: "HTML",
    });
  } catch (e) {
    console.error("download pdf error:", e);
    await ctx.reply("❌ Failed to generate/send PDF. Please try again.");
  }
});

// --- Search by activity type --- //
bot.action("act_search_type", async (ctx) => {
  await ctx.answerCbQuery();
  waitingForPostalCode.delete(ctx.chat.id);
  activitiesPostalFlow.delete(ctx.chat.id);

  searchState.set(ctx.chat.id, "search_type");
  await ctx.reply(
    '🔎 Type a keyword to search activities (e.g. "workout", "tai chi", "parenting").'
  );
});

async function searchActivitiesByType(ctx, rawTerm) {
  try {
    const term = (rawTerm || "").trim();
    const now = new Date();

const matches = await Activity.find({
  $or: [
    { activityName: { $regex: term, $options: "i" } },
    { description: { $regex: term, $options: "i" } },
  ],
}).lean();

    if (!matches.length) {
      await ctx.reply(`No upcoming activities found for “${escapeHtml(term)}”.`);

      // Keep user in search mode so their next message is treated as a new query
      searchState.set(ctx.chat.id, "search_type");

      await ctx.reply("What would you like to do next?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔎 New Search", callback_data: "act_search_type" }],
            [{ text: "🏠 Main Menu", callback_data: "menu" }],
            [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
          ],
        },
        parse_mode: "HTML",
      });
      return;
    }

    // Show centre name next to each activity in search results
    const withCentre = matches.map((m) => ({
      ...m,
      activityName: `${m.activityName} — ${m.centre || "Unknown centre"}`,
    }));

    await sendActivitiesChunked(ctx, withCentre, {
      header: `🔎 Results for “${escapeHtml(term)}”`,
    });

    await ctx.reply("What would you like to do next?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔎 New Search", callback_data: "act_search_type" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }],
          [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
        ],
      },
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("searchActivitiesByType error:", err);
    await ctx.reply("❌ Error searching activities. Please try again later.");
  }
}

// Unified text handler: PRIORITIZE search, then activities postal flow, then location postal flow
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = (ctx.message.text || "").trim();

  // 1) SEARCH CENTRE mode
  if (searchState.get(chatId) === "search_centre") {
    if (!text) return ctx.reply("Please type a centre name.");
    searchState.delete(chatId);

    try {
      const centres = await Centre.find({
        name: { $regex: text, $options: "i" },
      }).lean();
      if (!centres.length) {
        await ctx.reply(`❌ No centres found matching “${escapeHtml(text)}”`);
        await ctx.reply("What would you like to do next?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔎 New Search", callback_data: "search_centre" }],
              [{ text: "📅 Activities Menu", callback_data: "activities_menu" }],
              [{ text: "🏠 Main Menu", callback_data: "menu" }],
              [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
            ],
          },
          parse_mode: "HTML",
        });
        return;
      }

      for (const c of centres) {
        const categoryLabel = c.category
          ? `📂 Category: ${getCategoryDisplay(c.category)}\n`
          : "";

        const msg =
          `<b>${escapeHtml(c.name || "")}</b>\n\n` +
          `📍 ${escapeHtml(c.address || "")}\n` +
          (c.phone ? `📞 ${escapeHtml(c.phone)}\n` : "") +
          (c.email ? `✉️ ${escapeHtml(c.email)}\n` : "") +
          categoryLabel;

        await ctx.telegram.sendMessage(ctx.chat.id, msg, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📅 View Activities", callback_data: `see_activity_${c._id}` }],
            ],
          },
        });
      }
      await ctx.reply("What would you like to do next?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔎 New Search", callback_data: "search_centre" }],
            [{ text: "📅 Activities Menu", callback_data: "activities_menu" }],
            [{ text: "🏠 Main Menu", callback_data: "menu" }],
            [{ text: "🔄 Back to Categories", callback_data: "location_menu" }],
          ],
        },
        parse_mode: "HTML",
      });
    } catch (err) {
      console.error("❌ Error searching centres:", err);
      await ctx.reply("❌ Failed to search centres.");
    }
    return;
  }

  // 1) SEARCH mode
  if (searchState.get(chatId) === "search_type") {
    if (!text) return ctx.reply('Please type a keyword, e.g. "workout".');
    searchState.delete(chatId);
    await searchActivitiesByType(ctx, text);
    return;
  }

  // 2) Activities postal flow
  const flow = activitiesPostalFlow.get(chatId);
  if (flow?.step === "awaiting_postal") {
    if (!/^\d{6}$/.test(text)) {
      return ctx.reply("❌ Invalid postal code. Please enter a valid 6-digit postal code.");
    }
    try {
      const { lat, lng } = await geocodePostal(text);
      const centres = await nearestCentres(lat, lng, 5);
      if (!centres.length) {
        await ctx.reply("❌ No centres found near that postal code.");
        await ctx.reply("What would you like to do next?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📍 New Location / Postal (by centre)", callback_data: "act_by_postal" }],
              [{ text: "🏠 Main Menu", callback_data: "menu" }],
              [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
            ],
          },
          parse_mode: "HTML",
        });
      } else {
        activitiesPostalFlow.set(chatId, { step: "list_centres", coords: { lat, lng }, centres });
        await ctx.reply(`Select a centre to view/download activities:`, {
          reply_markup: { inline_keyboard: centresToKeyboard(centres) },
        });
      }
    } catch (err) {
      console.error("Activities postal geocode error:", err);
      await ctx.reply("❌ Error fetching location. Try again later.");
    }
    return;
  }

  // 3) Location postal flow (centres)
  const category = waitingForPostalCode.get(chatId);
  if (category) {
    if (!/^\d{6}$/.test(text)) {
      return ctx.reply("❌ Invalid postal code. Please enter a valid 6-digit postal code.");
    }
    waitingForPostalCode.delete(chatId);
    await handlePostalCodeLookup(ctx, text, category);
    return;
  }

  // 4) Otherwise ignore
});

// Handle location for flows
bot.on("location", async (ctx) => {
  const chatId = ctx.chat.id;
  const { latitude, longitude } = ctx.message.location;

  // A) Activities postal flow (needs centre list from coords)
  const flow = activitiesPostalFlow.get(chatId);
  if (flow?.step === "awaiting_postal") {
    try {
      const centres = await nearestCentres(latitude, longitude, 5);
      if (!centres.length) {
        await ctx.reply("❌ No centres found near your location.");
        await ctx.reply("What would you like to do next?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📍 New Location / Postal (by centre)", callback_data: "act_by_postal" }],
              [{ text: "🏠 Main Menu", callback_data: "menu" }],
              [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
            ],
          },
          parse_mode: "HTML",
        });
      } else {
        activitiesPostalFlow.set(chatId, {
          step: "list_centres",
          coords: { lat: latitude, lng: longitude },
          centres,
        });
        await ctx.reply(`Select a centre to view/download activities:`, {
          reply_markup: { inline_keyboard: centresToKeyboard(centres) },
        });
        await ctx.reply("What would you like to do next?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📍 New Location / Postal (by centre)", callback_data: "act_by_postal" }],
              [{ text: "🏠 Main Menu", callback_data: "menu" }],
              [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
            ],
          },
          parse_mode: "HTML",
        });
      }
    } catch (e) {
      console.error("Activities location error:", e);
      await ctx.reply("❌ Error loading centres. Please try again later.");
    }
    return;
  }

  // B) Location > Enter Postal Code flow (centres by category)
  const category = waitingForPostalCode.get(chatId);
  if (category) {
    waitingForPostalCode.delete(chatId);
    return showNearestCentresFromCoords(ctx, latitude, longitude, category);
  }

  // C) Default: show activities near me (no selection/filters)
  try {
    await showNearestActivitiesFromCoords(ctx, latitude, longitude, null);
  } catch (err) {
    console.error("Error fetching nearest activities:", err);
    ctx.reply("❌ Error loading activities. Please try again later.");
  }
});

// Helpers
async function geocodePostal(postalCode) {
  const res = await axios.get(
    "https://www.onemap.gov.sg/api/common/elastic/search",
    {
      params: { searchVal: postalCode, returnGeom: "Y", getAddrDetails: "Y" },
      headers: { Authorization: process.env.ONEMAP_API_TOKEN || "" },
    }
  );
  const result = res.data && res.data.results && res.data.results[0];
  if (!result) throw new Error("Postal code not found");
  return { lat: parseFloat(result.LATITUDE), lng: parseFloat(result.LONGITUDE) };
}

async function nearestCentres(userLat, userLng, limit = 5) {
  const centresList = await Centre.find({}).lean();
  return centresList
    .map((c) => ({
      ...c,
      distance: getDistance(userLat, userLng, Number(c.lat), Number(c.lng)),
    }))
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function centresToKeyboard(centres) {
  return centres.map((c) => [
    { text: c.name, callback_data: `act_choose_centre_${c._id}` },
  ]);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === Shared helpers for consistent activity display ===
function buildActivityBlock(act) {
  const dates = (act.activityDate || [])
    .map((d) => new Date(d).toLocaleDateString("en-SG"))
    .join(", ");
  const time = act.activityTime || "Time not specified";
  const audience = act.recommendedAudience || "All";
  const signup = act.signUpInstruction || "N/A";
  const desc = (act.description || "").trim().slice(0, 700);

  return (
    `<b>${escapeHtml(act.activityName || "")}</b>
` +
    `— <b>Date:</b> ${escapeHtml(dates)}
` +
    `— <b>Time:</b> ${escapeHtml(time)}
` +
    `— <b>Recommended For:</b> ${escapeHtml(audience)}
` +
    `— <b>Sign-up:</b> ${escapeHtml(signup)}
` +
    (desc
      ? `
<i>${escapeHtml(desc)}</i>
`
      : "") +
    `
──────────
`
  );
}

function buildActivityBlockCompact(act) {
  const dates = (act.activityDate || [])
    .map((d) => new Date(d).toLocaleDateString("en-SG"))
    .join(", ");
  const time = act.activityTime || "Time not specified";
  const audience = act.recommendedAudience || "All";
  const signup = act.signUpInstruction || "N/A";

  return (
    `<b>${escapeHtml(act.activityName || "")}</b>
` +
    `— <b>Date:</b> ${escapeHtml(dates)}
` +
    `— <b>Time:</b> ${escapeHtml(time)}
` +
    `— <b>Recommended For:</b> ${escapeHtml(audience)}
` +
    `— <b>Sign-up:</b> ${escapeHtml(signup)}
` +
    `
──────────
`
  );
}

async function sendActivitiesChunked(ctx, activities, { header = "" } = {}) {
  const LIMIT = 4000;
  let buffer = header ? `<b>${escapeHtml(header)}</b>\n\n` : "";

  for (const act of activities) {
    const block = buildActivityBlock(act);
    if ((buffer + block).length > LIMIT) {
      await ctx.reply(buffer, { parse_mode: "HTML" });
      buffer = "";
    }
    buffer += block;
  }

  if (buffer.trim()) {
    await ctx.reply(buffer, { parse_mode: "HTML" });
  }
}

function isBedok609(name = "") {
  const n = String(name).toLowerCase();
  // matches "bedok 609", "609 bedok", "Goodlife Studio (Bedok 609)" etc.
  return /bedok.*609|609.*bedok/.test(n);
}

function isBedok613B(name = "") {
  const n = String(name).toLowerCase();
  return /bedok.*613b|613b.*bedok/.test(n);
}

// Build and show upcoming activities near a coordinate (optionally filtered by centre category)
async function showNearestActivitiesFromCoords(ctx, userLat, userLng) {
  try {
    const centres = await Centre.find();
    const activities = await Activity.find();

    // sort centres by distance
    const nearestCentres = centres
      .map((c) => ({
        ...c.toObject(),
        distance: getDistance(userLat, userLng, c.lat, c.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3); // top 3

    let printedAny = false;

    for (const centre of nearestCentres) {
      const centreActivities = activities.filter((a) => a.centre === centre.name);
      if (!centreActivities.length) continue;

      printedAny = true;

      const LIMIT = 4000;
      let buffer = `<b>📍 Activities at ${escapeHtml(centre.name)}</b>\n\n`;

      for (const act of centreActivities) {
        const dates = (act.activityDate || [])
          .map((d) => new Date(d).toLocaleDateString("en-SG"))
          .join(", ");
        const time = act.activityTime || "Time not specified";
        const audience = act.recommendedAudience || "All";
        const signup = act.signUpInstruction || "N/A";
        const desc = (act.description || "").trim().slice(0, 700);

        const block =
          `<b>${escapeHtml(act.activityName || "")}</b>\n` +
          `— <b>Date:</b> ${escapeHtml(dates)}\n` +
          `— <b>Time:</b> ${escapeHtml(time)}\n` +
          `— <b>Recommended For:</b> ${escapeHtml(audience)}\n` +
          `— <b>Sign-up:</b> ${escapeHtml(signup)}\n` +
          (desc ? `\n<i>${escapeHtml(desc)}</i>\n` : "") +
          `\n──────────\n`;

        if ((buffer + block).length > LIMIT) {
          await ctx.reply(buffer, { parse_mode: "HTML" });
          buffer = "";
        }
        buffer += block;
      }

      if (buffer.trim()) {
        await ctx.reply(buffer, { parse_mode: "HTML" });
      }
    }

    if (!printedAny) {
      await ctx.reply("❌ No upcoming activities found near your location.");
    }

    await ctx.reply("What would you like to do next?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📍 New Location", callback_data: "act_near_me" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }],
          [{ text: "🔙 Back To Activities Menu", callback_data: "activities_menu" }],
        ],
      },
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("❌ Error showing nearest activities:", err);
    await ctx.reply("❌ Failed to load nearby activities.");
  }
}

// Create a PDF Buffer for activities at a given centre
async function createActivitiesPdfBuffer(centre, acts) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on("data", (d) => chunks.push(d));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(18).text(`Activities at ${centre.name}`, { underline: true });
      doc.moveDown(0.5);
      if (centre.address) doc.fontSize(11).text(`Address: ${centre.address}`);
      if (centre.phone) doc.text(`Phone: ${centre.phone}`);
      if (centre.email) doc.text(`Email: ${centre.email}`);
      doc.moveDown();

      // Activities
      const now = new Date();
      let printed = 0;
      for (const a of acts) {
        const dates = (a.activityDate || [])
          .map((d) => new Date(d))
          .filter((d) => !isNaN(d.getTime()) && d >= now)
          .sort((x, y) => x - y);

        if (!dates.length) continue; // only upcoming

        doc.fontSize(14).text(a.activityName || "Untitled Activity");
        doc.moveDown(0.2);
        doc.fontSize(11);

        doc.text("Upcoming Sessions:");
        dates.forEach((d) => {
          const dateStr = d.toLocaleString("en-SG", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          doc.text(
            `• ${dateStr}${a.activityTime ? ` (${a.activityTime})` : ""}`
          );
        });

        if (a.recommendedAudience)
          doc.text(`Recommended For: ${a.recommendedAudience}`);
        if (a.signUpInstruction) doc.text(`Sign-up: ${a.signUpInstruction}`);
        if (a.description) {
          doc.moveDown(0.2);
          doc.text(a.description, { width: 500 });
        }

        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
        doc.moveDown();

        printed++;
      }

      if (!printed) {
        doc.fontSize(12).text("No upcoming activities found.");
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

bot.action("menu", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    `Welcome to Montfort Care’s Nearby Bot! 👋  

Use the menu below to get started:\n  
📍 Location – Find the nearest Montfort Care centres.\n  
📅 Activities – Browse or search upcoming activities and programmes by centre, type, or location.  
`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📍 Location", callback_data: "location_menu" }],
          [{ text: "📅 Activities", callback_data: "activities_menu" }],
        ],
      },
      parse_mode: "HTML",
    }
  );
});

// -----------------------------
// ✅ STARTUP SECTION (FINAL VERSION)
// -----------------------------
const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Build webhook URL (Render automatically provides the full https:// URL)
const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;

// ✅ Telegram will send updates here
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  // Always respond quickly so Telegram doesn't time out or 502
  res.status(200).send("OK");
  // Process update asynchronously
  bot.handleUpdate(req.body)
    .catch((err) => console.error("❌ Error handling update:", err));
});

// ✅ Register webhook with Telegram
bot.telegram.setWebhook(webhookUrl)
  .then(() => console.log(`✅ Webhook registered: ${webhookUrl}`))
  .catch((err) => console.error("❌ Failed to set webhook:", err));

// Health check route for browser
app.get("/", (req, res) => {
  res.send("✅ Montfort Care Telegram Bot is running on Render");
});

// Start the web server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
