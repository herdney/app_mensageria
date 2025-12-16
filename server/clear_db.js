// clear_db.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3001;

const fetchFn =
    global.fetch ||
    ((...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)));

async function clearDatabase() {
    try {
        console.log(`Requesting server to clear database on port ${PORT}...`);
        const response = await fetchFn(`http://localhost:${PORT}/database/clear`, { method: "POST" });

        if (response.ok) console.log("Database cleared successfully via API.");
        else console.error("Failed to clear database:", response.statusText);
    } catch (error) {
        console.error("Error connecting to server:", error.message);
        console.log(`Make sure the server is running on port ${PORT}.`);
    }
}

clearDatabase();
