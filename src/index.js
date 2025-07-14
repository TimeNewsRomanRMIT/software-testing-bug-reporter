const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path = require('path');
const bugsRouter = require('./routes/bugs');

const app = express();
app.use(cors(), express.json());

const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/bugsdb';
mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error(err));

// ←–– Add your routes here:
app.use('/api/bugs', bugsRouter);
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.send('Hello Bug Reporter!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on ${PORT}`));
