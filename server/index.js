require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { Resend } = require('resend');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

let db;
async function initDB() {
  db = await open({ filename: process.env.DATABASE_URL || './data/payments.db', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, stripe_user_id TEXT UNIQUE, email TEXT);
    CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, status TEXT DEFAULT 'active');
  `);
}

app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

app.post('/api/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    success_url: 'https://yoursite.com/success',
    cancel_url: 'https://yoursite.com/canceled',
  });
  res.json({ url: session.url });
});

app.listen(3001, () => console.log('Running on port 3001'));
initDB();
