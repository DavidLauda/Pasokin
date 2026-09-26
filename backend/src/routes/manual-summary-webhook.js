const flow = require('../services/manualConfirmation');

// Runs before the existing RFQ classifier. A summary reply is always reviewed
// by the buyer and is never sent through automatic triage.
module.exports = async (req, res, next) => {
  try {
    if (await flow.captureInbound(req.body)) return res.sendStatus(200);
    next();
  } catch (error) { next(error); }
};
