import FastMCP from "fastmcp";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = new Database("./combined_medical_database_optimized(1).db");

const server = new FastMCP({
  name: "MEDLAB MCP",
  version: "1.0.0",
});

server.tool(
  "searchDisease",
  "Search diseases from medical DB",
  {
    query: "string",
  },
  async ({ query }) => {

    const rows = db
      .prepare(`
        SELECT *
        FROM diseases
        WHERE name LIKE ?
        LIMIT 10
      `)
      .all(`%${query}%`);

    return rows;
  }
);

export default server;