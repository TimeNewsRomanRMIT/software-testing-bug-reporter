const mongoose = require('mongoose');

const bugSchema = new mongoose.Schema({
  team:        { type: String, required: true },
  email:       { type: String, required: true },
  url:         { type: String, required: true },
  description: { type: String, required: true },
  testSteps:   { type: String, default: '' },
  duplicate:   { type: Boolean, default: false },

  // ← images as objects
  images: [{
    path:        { type: String, required: true },  // e.g. "/uploads/xxx.png"
    originalName:{ type: String },
    size:        { type: Number },
    type:        { type: String }
  }],

  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bug', bugSchema);
