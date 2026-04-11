require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connection.on('connected',() => console.log("Mongoose Connected"));
mongoose.connection.on('error',(err) => console.log("Mongoose throw Error: ", err));
mongoose.connection.on('disconnected',() => console.log("Mongoose DisConnected!"));

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (err) {
        console.log('Error COnnecting: ', err);
        console.log('Retrying Connection!');
        setTimeout(connectDB, 5000);
    }
}

module.exports = connectDB;