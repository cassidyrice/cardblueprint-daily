// Sends a signed fake Stripe event to the local Worker. Usage: node test/stripe-event.mjs <type> <userId|customer> [secret]
import crypto from "node:crypto";
const [type, ref, secret = "whsec_test"] = process.argv.slice(2);
const object = type === "checkout.session.completed"
  ? { id: "cs_test_1", mode: "subscription", payment_status: "paid", client_reference_id: ref, customer: "cus_test_1", subscription: "sub_test_1", customer_details: { email: "x@example.com" } }
  : { id: "sub_test_1", customer: "cus_test_1", status: type.endsWith("deleted") ? "canceled" : ref, current_period_end: 1800000000 };
const body = JSON.stringify({ id: "evt_1", type, data: { object } }), t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const res = await fetch("http://127.0.0.1:8787/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body });
console.log(res.status, await res.text());
