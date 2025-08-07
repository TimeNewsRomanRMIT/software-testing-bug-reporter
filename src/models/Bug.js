// src/models/Bug.js
const mongoose = require('mongoose');

const bugSchema = new mongoose.Schema({
  team:        { type: String, required: true },
  email:       { type: String, required: true },
  url:         { type: String, required: true },
  description: { type: String, required: true },
  testSteps:   { type: String, default: '' },          // <— new field
  createdAt:   { type: Date,   default: Date.now }
});

module.exports = mongoose.model('Bug', bugSchema);
