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

// helpers (put near top of file, once)
function nUrl(s = '') {
  return s.trim().replace(/\/+$/,''); // trim + drop trailing slash
}
function nDesc(s = '') {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const incoming = req.body;

    const teamName  = toTitleCase(incoming.team || incoming.email || '');
    const urlRaw    = (incoming.url || '').trim();
    const descRaw   = (incoming.description || '').trim();

    const bugBase = {
      team:        teamName,
      email:       (incoming.email || incoming.team || '').trim().toLowerCase(),
      url:         nUrl(urlRaw),
      description: descRaw,
      testSteps:   (incoming.testSteps || '').trim(),
      createdAt:   new Date()
    };

    // images metadata
    const images = (req.files || []).map(f => ({
      path: `/uploads/${f.filename}`,
      originalName: f.originalname,
      size: f.size,
      type: f.mimetype
    }));

    // 🔑 Per-team dedup: same TEAM + same URL
    const candidates = await Bug.find({
      team: bugBase.team,
      url:  bugBase.url
    });

    const newDescN = nDesc(bugBase.description);

    // debug log (optional)
    candidates.forEach(e => {
      const score = JaroWinklerDistance(nDesc(e.description), newDescN);
      console.log(`JW(team=${e.team}) url=${e.url} :: "${e.description}" vs "${bugBase.description}" => ${score.toFixed(3)}`);
    });

    const isDuplicate = candidates.some(e =>
      JaroWinklerDistance(nDesc(e.description), newDescN) > 0.5
    );

    const doc = await Bug.create({ ...bugBase, images, duplicate: isDuplicate });
    res.status(201).json(doc);

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// GET /api/bugs?team=<partial>&page=1&limit=10     team is optional; if provided we filter with a case-insensitive regex. cap limit at 100 to prevent silly values.
router.get('/', async (req, res) => {
  try {
    const { team = '', page = 1, limit = 10 } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const filter = {};
    if (team && team.trim()) {
      // case-insensitive partial match on team name
      filter.team = { $regex: team.trim(), $options: 'i' };
    }

    const total = await Bug.countDocuments(filter);
    const items = await Bug.find(filter)
      .sort('-createdAt')
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    res.json({
      items,
      total,
      page: pageNum,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    // Keep your existing filter and chronological order
    const all = await Bug.find({ duplicate: false }).sort('createdAt');

    const groups = [];
    all.forEach(bug => {
      const urlN  = nUrl(bug.url);
      const descN = nDesc(bug.description);

      // Same grouping rule: same normalized URL + JW(desc) > 0.5
      let grp = groups.find(g =>
        g.url === urlN &&
        JaroWinklerDistance(g.descN, descN) > 0.5
      );

      if (!grp) {
        grp = {
          url:         urlN,
          description: bug.description,  // keep representative original text
          descN:       descN,            // normalized text for grouping
          teams:       new Set(),
          perTeamAt:   new Map()         // NEW: team -> first seen Date
        };
        groups.push(grp);
      }

      // Track which teams reported this cluster
      grp.teams.add(bug.team);

      // Because 'all' is sorted by createdAt asc,
      // the first time we see a team for this group is the first-seen time.
      if (!grp.perTeamAt.has(bug.team)) {
        grp.perTeamAt.set(bug.team, bug.createdAt);
      }
    });

    // Shape for JSON: convert Set/Map to plain objects/arrays
    const out = groups.map(g => {
      const perTeamAt = {};
      for (const [team, at] of g.perTeamAt) {
        perTeamAt[team] = at instanceof Date ? at.toISOString() : at;
      }
      return {
        url:         g.url,
        description: g.description,
        teamCount:   g.teams.size,
        teams:       Array.from(g.teams),
        perTeamAt    // NEW
      };
    });

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
