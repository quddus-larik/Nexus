const bcrypt = require('bcrypt');

async function hashPass() {
    const hashed = await bcrypt.hash('hello', 10);
    const find = await bcrypt.compare(hashed, hashed);

    console.log(find)
}

hashPass();
