const initDb = require("../initDb");

initDb();
console.log("DB initialized:", require("path").resolve(process.cwd(), process.env.DB_FILE || "./data/app.db"));
