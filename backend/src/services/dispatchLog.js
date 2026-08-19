const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/dispatchLogs.json');

let logs = [];

if (fs.existsSync(filePath)) {
    try {
        logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error("Error loading dispatch logs:", e);
    }
}

function saveLogs() {
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
}

function addLog(entry) {
    logs.push(entry);
    saveLogs();
}

function getAllLogs() {
    return logs;
}

module.exports = {
    addLog,
    getAllLogs
};
