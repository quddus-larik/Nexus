const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        actor: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: '',
            trim: true
        },
        read: {
            type: Boolean,
            default: false,
            index: true
        },
        type: {
            type: String,
            enum: ['collabs', 'invests', 'message', 'system'],
            default: 'system',
            index: true
        },
        meta: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
