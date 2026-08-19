// src/services/configService.js

// Inisialisasi dari environment variable saat pertama kali jalan
let config = {
    demoMode: process.env.DEMO_MODE === 'true'
};

function isDemoMode() {
    return config.demoMode;
}

function setDemoMode(value) {
    config.demoMode = !!value;
}

module.exports = {
    isDemoMode,
    setDemoMode
};
