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

function isFinalSubmitted(dispatchId) {
    return logs.some(log => log.dispatch_id === dispatchId && log.po_sent === true);
}

function markFinalSubmitted(dispatchId) {
    let updated = false;
    logs = logs.map(log => {
        if (log.dispatch_id !== dispatchId || log.po_sent === true) return log;
        updated = true;
        return { ...log, po_sent: true };
    });
    if (updated) saveLogs();
}

module.exports = {
    addLog,
    getAllLogs,
    isFinalSubmitted,
    markFinalSubmitted
};
