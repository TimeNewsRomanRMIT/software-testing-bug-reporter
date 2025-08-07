const express = require('express');
const Bug     = require('../models/Bug');
const router  = express.Router();
const natural = require('natural');
const { JaroWinklerDistance } = natural;

// Helper: Title-case a string
function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// src/routes/bugs.js (inside router.post)
router.post('/', async (req, res) => {
  try {
    const raw = Array.isArray(req.body.bugs) ? req.body.bugs : [req.body];
    const inserted = [];

    for (let incoming of raw) {
      // Normalize
      const bug = {
        team:        toTitleCase(incoming.team || incoming.email || ''),
        email:       (incoming.email || incoming.team || '').trim().toLowerCase(),
        url:         (incoming.url || '').trim(),
        description: (incoming.description || '').trim(),
        testSteps:   (incoming.testSteps || '').trim(),
        createdAt:   new Date()
      };

      // 1) Find existing bugs with the same URL
      const existing = await Bug.find({ url: bug.url });

      // ── NEW: log each similarity score ──
      existing.forEach(e => {
        const score = JaroWinklerDistance(e.description, bug.description);
        console.log(
          `Similarity("${e.description}", "${bug.description}") = ${score.toFixed(3)}`
        );
      });

      // 2) Filter to only those whose description is "similar"
      const duplicates = existing.filter(e =>
        JaroWinklerDistance(e.description, bug.description) > 0.45
      );

      if (duplicates.length > 0) {
        // We’ve found at least one “same error”
        // 2a) If the same user already reported it → skip
        const already = duplicates.some(e => e.email === bug.email);
        if (already) {
          console.log(`Skipping duplicate for same user ${bug.email}`);
          continue; 
        }
        // 2b) Different user → treat as new report of the same error
        // fall through to insertion
      }

      // 3) No duplicates → new error, or different user → new report
      const doc = await Bug.create(bug);
      inserted.push(doc);
    }

    if (inserted.length === 0) {
      return res
        .status(409)
        .json({ error: 'No new bugs inserted (all duplicates for same user).' });
    }
    res.status(201).json(inserted);

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

// **below** your existing routes in src/routes/bugs.js

// GET /api/bugs/matches/:id  
// Returns how many distinct teams have reported a similar bug
router.get('/matches/:id', async (req, res) => {
  try {
    const original = await Bug.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    // find all bugs on the same URL
    const all = await Bug.find({ url: original.url });

    // filter those whose description is similar enough
    const matches = all.filter(e =>
      JaroWinklerDistance(e.description, original.description) > 0.5
    );

    // count distinct teams (exclude the original if you like)
    const teams = new Set(matches.map(e => e.team));
    res.json({ teamCount: teams.size, teams: Array.from(teams) });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bugs/groups
// Returns an array of “unique bug” groups:
// { url, description, teamCount, teams: [ ... ] }
router.get('/groups', async (req, res) => {
  try {
    // 1) fetch every bug, sorted oldest→newest
    const all = await Bug.find().sort('createdAt');

    const groups = [];
    all.forEach(bug => {
      // Look for a group with same URL + similar description
      let grp = groups.find(g =>
        g.url === bug.url &&
        JaroWinklerDistance(g.description, bug.description) > 0.5
      );

      if (!grp) {
        // start a new group
        grp = {
          url:         bug.url,
          description: bug.description,
          teams:      new Set()
        };
        groups.push(grp);
      }
      grp.teams.add(bug.team);
    });

    // Format for JSON
    const out = groups.map(g => ({
      url:         g.url,
      description: g.description,
      teamCount:   g.teams.size,
      teams:       Array.from(g.teams)
    }));

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
