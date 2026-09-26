const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/manual-confirmations', require('./routes/manual-confirmations'));
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
app.use('/api/source', sourceRouter);
app.use('/api/optimize', optimizeRouter);
app.use('/api/dispatch-wa', dispatchRouter);
app.use('/api/wa', waRouter);
app.use('/api/wa-replies', waRepliesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/procurements', procurementsRouter);

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
