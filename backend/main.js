const express = require('express');
const cors = require('cors');

const signUpRouter = require('./src/auth/signup');
const logInRouter = require('./src/auth/login');
const userRoleRouter = require('./src/routes/user/user.role');
const userProfileRouter = require('./src/routes/user/user.profile');
const authenticateToken = require('./src/middlewares/auth.proxy');
const connectDB = require('./database/mongodb.connection');


const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }))

const PORT = 8080;

connectDB();

app.use('/auth', signUpRouter); // /auth/signup
app.use('/auth', logInRouter); // /auth/login
app.use('/user', userRoleRouter); // /user/role
app.use('/users', authenticateToken, userProfileRouter); // /users/:id

app.get('/',(req,res)=> res.send('Server catch you!'));

app.listen(PORT,()=> console.log(`server is listening on https://localhost:${PORT}`));
