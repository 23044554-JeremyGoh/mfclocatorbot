// models/Centre.js
const mongoose = require('mongoose');

const centreSchema = new mongoose.Schema({
  name: String,
  address: String,
  phone: String,
  email: String,
  lat: Number,
  lng: Number,
  category: String,
});

module.exports = mongoose.model('Centre', centreSchema);
