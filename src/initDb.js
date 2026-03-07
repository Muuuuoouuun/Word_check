const fs = require("fs");
const path = require("path");
const db = require("./db");

function initDb() {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  db.exec(sql);
}

module.exports = initDb;
