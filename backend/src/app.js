const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = express();

app.use(cors());
app.use(express.json());
const { requireRole } = require('./middleware/auth');
app.use('/api/auth', require('./routes/auth'));
app.use('/api/manual-confirmations', requireRole('buyer'), require('./routes/manual-confirmations'));
app.post('/api/wa/webhook', require('./routes/manual-summary-webhook'));

// Mount routes
const suppliersRouter = require('./routes/suppliers');
const sourceRouter = require('./routes/source');
const optimizeRouter = require('./routes/optimize');
const dispatchRouter = require('./routes/dispatch');
const waRouter = require('./routes/wa');
const waRepliesRouter = require('./routes/wa-replies');
const settingsRouter = require('./routes/settings');
const procurementsRouter = require('./routes/procurements');

app.use('/api/suppliers', suppliersRouter);
app.use('/api/source', requireRole('buyer'), sourceRouter);
app.use('/api/optimize', requireRole('buyer'), optimizeRouter);
app.use('/api/dispatch-wa', requireRole('buyer'), dispatchRouter);
app.use('/api/wa', waRouter);
app.use('/api/wa-replies', requireRole('buyer'), waRepliesRouter);
app.use('/api/settings', requireRole('buyer'), settingsRouter);
app.use('/api/procurements', requireRole('buyer'), procurementsRouter);

const configService = require('./services/configService');

// Health check route
app.get('/api/health', async (req, res, next) => {
  try {
    res.json({ status: 'ok', demoMode: await configService.isDemoMode() });
  } catch (error) { next(error); }
});

// Basic error-handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 4000;
const whatsappService = require('./services/whatsappService');

if (require.main === module) {
  whatsappService.initWhatsApp().catch(error => console.error('WhatsApp init failed:', error));
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

module.exports = app;
// Restart trigger
