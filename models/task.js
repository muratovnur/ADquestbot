const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TaskSchema = new Schema({
    title: { type: String, required: true , maxLength: 200},
    comment: { type: String, required: true, maxLength: 1000},
    department: {type: String, required: true},
    author: {type: Schema.Types.ObjectId},
    maker: {type: Schema.Types.ObjectId},
    deadline: {type: Date, required: true},
    status: {type: String, default: "Not done"}
})

module.exports = mongoose.model('Tasks', TaskSchema);
