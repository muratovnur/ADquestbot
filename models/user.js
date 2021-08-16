const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    telegramId: { type: Number, required: true, unique: true},
    name: {type: String, required: true},
    surName: {type: String, required: true},
    role: {type: String, default: "User"},
    department: {type: String, required: true},
    tasks: {type: Schema.Types.ObjectId}
})

module.exports = mongoose.model('Users', UserSchema);
