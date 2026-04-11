const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageModel = new Schema({
    sender: { type: Schema.Types.ObjectId, required: true },
    reciever: { type: Schema.Types.ObjectId, required: true },
    content: { type: String, required: true },
    roomId: String,
    timestemps: { type: Date, default: Date.now }
}, { timestemps: true });
