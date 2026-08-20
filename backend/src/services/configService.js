const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/config.json');

// Inisialisasi dari environment variable saat pertama kali jalan
let config = {
    demoMode: process.env.DEMO_MODE === 'true'
};

if (fs.existsSync(configPath)) {
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        console.error("Error loading config:", e);
    }
}

function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function isDemoMode() {
    return config.demoMode;
}

function setDemoMode(value) {
    config.demoMode = !!value;
    saveConfig();
}

module.exports = {
    isDemoMode,
    setDemoMode
};
