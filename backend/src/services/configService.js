const db = require('../db');

async function isDemoMode() {
  const setting = await db.findOne('app_settings', 'key', 'demoMode');
  return setting ? setting.value === true : process.env.DEMO_MODE === 'true';
}

async function setDemoMode(value) {
  await db.upsert('app_settings', [{ key: 'demoMode', value: !!value }], 'key');
  return !!value;
}

module.exports = { isDemoMode, setDemoMode };
