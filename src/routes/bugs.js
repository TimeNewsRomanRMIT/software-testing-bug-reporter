const express = require('express');
const Bug     = require('../models/Bug');
const router  = express.Router();

// Helper: Title-case a string
function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

//  POST /api/bugs  → submit one or many bugs
router.post('/', async (req, res) => {
  try {
    // Accept either a single bug or an array of bugs
    const raw = Array.isArray(req.body.bugs)
      ? req.body.bugs
      : [req.body];

    // Normalize each bug
    const normalized = raw.map(bug => ({
      team:        toTitleCase(bug.team || bug.email || ''),
      email:       (bug.email || '').trim().toLowerCase(),
      url:         (bug.url || '').trim(),
      description: (bug.description || '').trim(),
      createdAt:   new Date()
    }));

    const docs = await Bug.insertMany(normalized);
    res.status(201).json(docs);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

//  GET /api/bugs?team=XYZ  → list bugs for one team
router.get('/', async (req, res) => {
  const filter = req.query.team ? { team: req.query.team } : {};
  const bugs = await Bug.find(filter).sort('-createdAt');
  res.json(bugs);
});

//  GET /api/leaderboard  → teams ranked by URL-count
router.get('/leaderboard', async (req, res) => {
  const agg = await Bug.aggregate([
    // Group by team, collect unique URLs & count all bugs
    {
      $group: {
        _id: '$team',
        uniqueUrls: { $addToSet: '$url' },
        bugCount:   { $sum: 1 }
      }
    },
    // Project the fields we want
    {
      $project: {
        _id:       0,
        team:      '$_id',
        urlCount:  { $size: '$uniqueUrls' },
        bugCount:  1
      }
    },
    // Sort by number of unique URLs descending
    { $sort: { urlCount: -1, bugCount: -1 } }
  ]);
  res.json(agg);
});

module.exports = router;
