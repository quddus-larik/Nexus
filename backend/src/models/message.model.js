const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    senderId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    receiverId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    content: { 
      type: String, 
      required: true,
      trim: true
    },
    roomId: {
      type: String,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
