// index.mjs
import Stripe from "stripe";

const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

let stripe;
function getStripe() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

export const handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: body.email,
      line_items: body.items.map(item => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      success_url: "https://main.dijcvcdvudbc2.amplifyapp.com?payment=success",
      cancel_url:  "https://main.dijcvcdvudbc2.amplifyapp.com?payment=cancelled",
    });

    return { statusCode: 200, headers: H, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ message: err.message }) };
  }
};