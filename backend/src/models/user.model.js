const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true},
    password: { type: String, required: true },
    username: String,
    type: { type: String, required: true },
    position: String,
    about: String,
    address: String,
    portfolioCompanies: [{ type: String }],
    tags: [{ name: String, value: Number }],
    industries: [{ type: String, lowercase: true }],
    investmantStages: [{ type: String }],
    documents: [{ name: String, fileUrl: String, access: { type: String, lowercase: true, enum: ['public','private'] } }],
    collaborations: [{ type: Schema.Types.ObjectId, ref: 'users' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
