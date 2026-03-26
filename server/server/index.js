require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { Resend } = require('resend');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy');

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let db;
async function initDB() {
  db = await open({ filename: process.env.DATABASE_URL || './data/payments.db', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, stripe_user_id TEXT UNIQUE, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS failed_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, payment_intent_id TEXT, customer_id TEXT, amount INTEGER, currency TEXT, status TEXT, failure_message TEXT, recovered BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, stripe_subscription_id TEXT, status TEXT DEFAULT 'active', trial_ends_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
}

app.get('/api/test', (req, res) => res.json({ status: 'ok', message: 'Payment Recovery API is running' }));

app.post('/api/create-checkout-session', async (req, res) => {
  const { userId, email } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/canceled',
      customer_email: email,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/subscription-status/:userId', async (req, res) => {
  const { userId } = req.params;
  const sub = await db.get('SELECT * FROM subscriptions WHERE user_id = ?', [userId]);
  res.json({ hasActiveSubscription: sub?.status === 'active', subscription: sub });
});

app.post('/api/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    event = JSON.parse(req.body.toString());
