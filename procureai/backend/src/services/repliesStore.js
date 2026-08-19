const replies = [];

function addReply(entry) {
    replies.push(entry);
}

function updateReply(reply_id, updates) {
    const idx = replies.findIndex(r => r.reply_id === reply_id);
    if (idx !== -1) {
        replies[idx] = { ...replies[idx], ...updates };
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
