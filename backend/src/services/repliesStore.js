const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/replies.json');

let replies = [];

if (fs.existsSync(filePath)) {
    try {
        replies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error("Error loading replies:", e);
    }
}

function saveReplies() {
    fs.writeFileSync(filePath, JSON.stringify(replies, null, 2));
}

function addReply(entry) {
    replies.push(entry);
    saveReplies();
}

function updateReply(reply_id, updates) {
    const idx = replies.findIndex(r => r.reply_id === reply_id);
    if (idx !== -1) {
        replies[idx] = { ...replies[idx], ...updates };
        saveReplies();
        return replies[idx];
    }
    return null;
}

function getReply(reply_id) {
    return replies.find(r => r.reply_id === reply_id);
}

function getAllReplies() {
    return replies;
}

module.exports = {
    addReply,
    updateReply,
    getReply,
    getAllReplies
};
