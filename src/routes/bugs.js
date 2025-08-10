const express = require('express');
const Bug     = require('../models/Bug');
const router  = express.Router();
const natural = require('natural');
const { JaroWinklerDistance } = natural;

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// storage on disk
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 } // 5MB each, up to 5 images
});

// Helper
function toTitleCase(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// POST /api/bugs — now accepts multipart/form-data with images
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    // fields from the form (multipart)
    const incoming = req.body;

    // normalize
    const bugBase = {
      team:        toTitleCase(incoming.team || incoming.email || ''),
      email:       (incoming.email || incoming.team || '').trim().toLowerCase(),
      url:         (incoming.url || '').trim(),
      description: (incoming.description || '').trim(),
      testSteps:   (incoming.testSteps || '').trim(),
      createdAt:   new Date()
    };

    // build images metadata from uploaded files
    const images = (req.files || []).map(f => ({
      path: `/uploads/${f.filename}`,
      originalName: f.originalname,
      size: f.size,
      type: f.mimetype
    }));

    // duplicate logic (your threshold)
    const existing = await Bug.find({ url: bugBase.url });
    existing.forEach(e => {
      const s = JaroWinklerDistance(e.description, bugBase.description);
      console.log(`Similarity("${e.description}","${bugBase.description}")=${s.toFixed(3)}`);
    });
    const isDuplicate = existing.some(
      e => JaroWinklerDistance(e.description, bugBase.description) > 0.45
    );

    const doc = await Bug.create({ ...bugBase, images, duplicate: isDuplicate });
    res.status(201).json(doc);

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

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
    const raw      = Array.isArray(req.body.bugs) ? req.body.bugs : [req.body];
    const inserted = [];

    for (const incoming of raw) {
      // normalize fields...
      const bugBase = {
        team:        toTitleCase(incoming.team || incoming.email || ''),
        email:       (incoming.email || incoming.team).trim().toLowerCase(),
        url:         (incoming.url || '').trim(),
        description: (incoming.description || '').trim(),
        testSteps:   (incoming.testSteps || '').trim(),
        createdAt:   new Date()
      };

      // detect duplicates on the same URL
      const existing   = await Bug.find({ url: bugBase.url });
      const isDuplicate = existing.some(e =>
        JaroWinklerDistance(e.description, bugBase.description) > 0.45
      );

      // create with the flag
      const doc = await Bug.create({ ...bugBase, duplicate: isDuplicate });
      inserted.push(doc);
    }

    return res.status(201).json(inserted);
  } catch (err) {
    return res.status(400).json({ error: err.message });
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
    { $match: { duplicate: false } },     // ← skip all dups
    { $group: {
        _id: '$team',
        uniqueUrls: { $addToSet: '$url' },
        bugCount:   { $sum: 1 }
    }},
    { $project: {
        _id:      0,
        team:     '$_id',
        urlCount: { $size: '$uniqueUrls' },
        bugCount: 1
    }},
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
    // const all = await Bug.find({ duplicate: false }).sort('createdAt');
    const all = await Bug.find().sort('createdAt');

    console.log('=== group run ===');
    all.forEach((bug,i) => {
      console.log(`${i+1}. [${bug.team}] "${bug.description}"`);
    });

    const groups = [];
    all.forEach(bug => {
      let grp = groups.find(g => {
        const score = JaroWinklerDistance(g.description, bug.description);
        console.log(
          `  compare "${bug.description}"  vs  "${g.description}" → ${score.toFixed(3)}`
        );
        return g.url === bug.url && score > 0.5;    // your current 0.5 cutoff
      });
      if (!grp) {
        grp = { url: bug.url, description: bug.description, teams: new Set() };
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
