const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationModel = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    title: String,
    message: String,
    read: { type: Boolean, default: false },
    type: { type: String, enum: ['collabs','invests','message'] }
}, { timestamps: true });
