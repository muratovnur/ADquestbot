const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TaskSchema = new Schema({
    title: { type: String, required: true , maxLength: 200},
    comment: { type: String, required: true, maxLength: 1000},
    department: {type: String, required: true},
    author: {type: Schema.Types.ObjectId, ref: 'Users'},
    maker: {type: Schema.Types.ObjectId, ref: 'Users'},
    deadline: {type: Date, required: true,  min: Date.now(), max: '2050-01-01'},
    status: {type: String, default: "Не выполнено"}
})

module.exports = mongoose.model('Tasks', TaskSchema);
