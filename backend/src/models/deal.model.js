const mongoose = require('mongoose');
const { Schema } = mongoose;

const dealSchema = new Schema(
    {
        investor: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        startup: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        roomId: {
            type: String,
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: 'USD',
            trim: true
        },
        equity: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        round: {
            type: String,
            default: 'Seed',
            trim: true
        },
        note: {
            type: String,
            default: '',
            trim: true
        },
        status: {
            type: String,
            enum: ['Proposed', 'Due Diligence', 'Term Sheet', 'Negotiation', 'Closed', 'Passed'],
            default: 'Proposed',
            index: true
        },
        isMock: {
            type: Boolean,
            default: true
        },
        source: {
            type: String,
            enum: ['message', 'manual'],
            default: 'message'
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {}
        },
        lastActivityAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    { timestamps: true }
);

dealSchema.index({ investor: 1, startup: 1, createdAt: -1 });
dealSchema.index({ investor: 1, status: 1, updatedAt: -1 });
dealSchema.index({ startup: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.models.Deal || mongoose.model('Deal', dealSchema);
