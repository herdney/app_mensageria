async function clearDatabase() {
    try {
        console.log("Requesting server to clear database...");
        const response = await fetch('http://localhost:3001/database/clear', {
            method: 'POST'
        });

        if (response.ok) {
            console.log("Database cleared successfully via API.");
        } else {
            console.error("Failed to clear database:", response.statusText);
        }
    } catch (error) {
        console.error("Error connecting to server:", error.message);
        console.log("Make sure the server is running on port 3001.");
    }
}

clearDatabase();
