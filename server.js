const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

const db = new sqlite3.Database('feedbacks.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS feedbacks (id INTEGER PRIMARY KEY, service TEXT, rating INTEGER, feedback TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
});

function getServices(callback) {
    db.all("SELECT * FROM services", [], (err, rows) => {
        if (err) {
            console.error(err);
            callback(err);
        } else {
            callback(null, rows);
        }
    });
}

const bot = new Telegraf('6787485282:AAF_GrvmBOjpPN9-ul_7IRXbYNvxGSCRPLk');
let userState = {};

bot.start((ctx) => {
    getServices((err, services) => {
        if (err) {
            ctx.reply("Sorry, an error occurred. Please try again later.");
            return;
        }

        const keyboard = services.map(service => [{ text: service.name, callback_data: service.name }]);
        ctx.reply("Please select the service you want to provide feedback on:", {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
        userState[ctx.from.id] = { stage: 'SELECT_SERVICE' };
    });
});

bot.on('callback_query', (ctx) => {
    const userId = ctx.from.id;
    if (!userState[userId]) userState[userId] = { stage: 'SELECT_SERVICE' };

    switch (userState[userId].stage) {
        case 'SELECT_SERVICE':
            userState[userId].service = ctx.callbackQuery.data;
            userState[userId].stage = 'RATE_SERVICE';
            ctx.reply('Please rate the service on a scale of 1 (poor) to 10 (great).');
            break;
    }
});

bot.on('text', (ctx) => {
    const userId = ctx.from.id;

    if (!userState[userId]) return;

    switch (userState[userId].stage) {
        case 'RATE_SERVICE':
            const rating = parseInt(ctx.message.text);

            if (isNaN(rating) || rating < 1 || rating > 10) {
                ctx.reply('Please enter a valid rating between 1 (poor) and 10 (great).');
                return;
            }

            userState[userId].rating = rating;
            userState[userId].stage = 'WRITE_FEEDBACK';
            ctx.reply('Thank you for your rating! Please write your feedback.');
            break;

        case 'WRITE_FEEDBACK':
            userState[userId].feedback = ctx.message.text;

            db.run("INSERT INTO feedbacks (service, rating, feedback) VALUES (?, ?, ?)", [userState[userId].service, userState[userId].rating, userState[userId].feedback], (err) => {
                if (err) {
                    ctx.reply('An error occurred.');
                    console.error(err);
                } else {
                    ctx.reply('Thank you for your feedback!');
                }
            });

            delete userState[userId];
            break;
    }
});

bot.launch();

app.get('/admin/feedbacks', (req, res) => {
    db.all("SELECT * FROM feedbacks", [], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).send('An error occurred.');
        } else {
            res.json(rows);
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});



// Middleware to parse HTML forms (URL-encoded)
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/dashboard', (req, res) => {
    // Get feedbacks and services to display
    db.all("SELECT * FROM feedbacks", [], (err, feedbacks) => {
        if (err) {
            console.error(err);
            res.status(500).send('An error occurred.');
            return;
        }
        
        db.all("SELECT * FROM services", [], (err, services) => {
            if (err) {
                console.error(err);
                res.status(500).send('An error occurred.');
                return;
            }
            res.send(`
                <h1>Dashboard</h1>
                <a href="/dashboard/rating-analysis">View Rating Analysis</a>

                
                <h2>Feedbacks</h2>
                <table border="1">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Rating</th>
                            <th>Feedback</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${feedbacks.map(f => `<tr><td>${f.service}</td><td>${f.rating}</td><td>${f.feedback}</td></tr>`).join('')}
                    </tbody>
                </table>

                <h2>Add a Service</h2>
                <form action="/add-service" method="post">
                    <input type="text" name="serviceName" placeholder="Service Name" required>
                    <button type="submit">Add Service</button>
                </form>

                <h2>Services</h2>
                <ul>
                    ${services.map(s => `<li>${s.name}</li>`).join('')}
                </ul>
            `);
        });
    });
});

app.post('/add-service', (req, res) => {
    const serviceName = req.body.serviceName;
    db.run("INSERT INTO services (name) VALUES (?)", [serviceName], (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('An error occurred.');
        } else {
            res.redirect('/dashboard');
        }
    });
});

app.get('/dashboard/rating-analysis', (req, res) => {
  const query = `
      SELECT 
          service,
          AVG(rating) as average_rating,
          COUNT(id) as total_feedbacks
      FROM feedbacks
      GROUP BY service
  `;

  db.all(query, [], (err, analysis) => {
      if (err) {
          console.error(err);
          res.status(500).send('An error occurred.');
          return;
      }

      res.send(`
          <h1>Rating Analysis</h1>

          <table border="1">
              <thead>
                  <tr>
                      <th>Service</th>
                      <th>Average Rating</th>
                      <th>Total Feedbacks</th>
                  </tr>
              </thead>
              <tbody>
                  ${analysis.map(a => `<tr><td>${a.service}</td><td>${a.average_rating.toFixed(2)}</td><td>${a.total_feedbacks}</td></tr>`).join('')}
              </tbody>
          </table>

          <a href="/dashboard">Back to Dashboard</a>
      `);
  });
});
