// Dashboard view component
const { processData } = require('../services/dataService');

class Dashboard {
    constructor() {
        this.data = [];
    }

    render() {
        console.log('Rendering dashboard...');
        const processed = processData(this.data);
        return `<div>Dashboard: ${processed.join(', ')}</div>`;
    }

    updateData(newData) {
        this.data = newData;
    }
}

module.exports = Dashboard;