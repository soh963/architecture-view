// Data processing service
const helper = require('../utils/helper');

function processData(data) {
    helper.log('Processing data...');
    return data.map(item => item * 2);
}

function validateData(data) {
    return Array.isArray(data) && data.length > 0;
}

module.exports = {
    processData,
    validateData
};