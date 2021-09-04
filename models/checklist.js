const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const checklistSchema = new Schema({
    telegramId: { type: Number, required: true},
    checkIn: {type: Date},
    checkOut: {type: Date},
    came: {type: Boolean, default: false},
    left: {type: Boolean, default: false},
    year: {type: Number},
    month: {type: Number},
    day: {type: Number}
})

module.exports = mongoose.model('Checklist', checklistSchema);
