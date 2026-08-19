const logs = [];

function addLog(entry) {
    logs.push(entry);
}

function getAllLogs() {
    return logs;
}

module.exports = {
    addLog,
    getAllLogs
};
