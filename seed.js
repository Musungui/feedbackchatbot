const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('feedbacks.db');

const services = [
    'Coast General Hospital',
    'Public Service Board',
    'County Police',
    'Land Taxes'
];

db.serialize(() => {
    // Check if the table exists; if not, create it.
    db.run("CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT NOT NULL)", (err) => {
        if (err) {
            console.error("Error creating 'services' table:", err);
            process.exit(1);
        }

        // Insert services into the table.
        const stmt = db.prepare("INSERT INTO services (name) VALUES (?)");
        for (let service of services) {
            stmt.run(service, (err) => {
                if (err) {
                    console.error(`Error inserting ${service}:`, err);
                }
            });
        }
        stmt.finalize(() => {
            console.log("Seeding completed!");
            db.close();
        });
    });
});
