const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbFile = process.env.DB_FILE || "./data/app.db";
const absDbFile = path.resolve(process.cwd(), dbFile);
fs.mkdirSync(path.dirname(absDbFile), { recursive: true });

const db = new Database(absDbFile);
db.pragma("foreign_keys = ON");

db.pragma("journal_mode = WAL");

module.exports = db;
