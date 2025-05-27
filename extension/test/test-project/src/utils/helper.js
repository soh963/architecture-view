// Helper utilities
function log(...args) {
    console.log('[Helper]', ...args);
}

function formatDate(date) {
    return new Date(date).toISOString();
}

module.exports = {
    log,
    formatDate
};