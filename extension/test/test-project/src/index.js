// Test file for CodeSync Diagram
const utils = require('./utils/helper');
const { processData } = require('./services/dataService');

function main() {
    console.log('Starting application...');
    const data = processData([1, 2, 3, 4, 5]);
    utils.log('Processed data:', data);
}

module.exports = { main };