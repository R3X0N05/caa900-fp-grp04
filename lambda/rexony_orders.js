import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "crypto";

const db    = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses   = new SESClient({ region: "us-east-1" });
const TABLE = "Orders";
const H     = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const FROM_EMAIL = process.env.FROM_EMAIL || "azure.allure99@gmail.com";

function decodeJWT(event) {
  try {
    const token = (event.headers?.Authorization || event.headers?.authorization || "").replace("Bearer ", "");
    if (!token) return null;
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  } catch { return null; }
}

export const handler = async (event) => {
  const method = event.httpMethod;
  const path   = event.resource;
  const id     = event.pathParameters?.id;
  const claims = event.requestContext?.authorizer?.claims || {};
  const userId = claims.sub;
  const body   = event.body ? JSON.parse(event.body) : {};

  try {
    // OPTIONS preflight
    if (method === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,PUT,DELETE,POST,OPTIONS"
        },
        body: ""
      };
    }

    // POST /order/new
    if (method === "POST" && path === "/order/new") {
      const jwt = decodeJWT(event);
      const guestEmail = body.guestEmail || "";
      const orderUserId = jwt?.sub || "guest";
      const orderEmail = jwt?.email || guestEmail;

      if (!orderEmail) return { statusCode: 400, headers: H, body: JSON.stringify({ message: "Email required" }) };

      const order = {
        orderId:       crypto.randomUUID(),
        userId:        orderUserId,
        userEmail:     orderEmail,
        shippingInfo:  body.shippingInfo,
        orderItems:    body.orderItems,
        itemsPrice:    body.itemsPrice,
        taxPrice:      body.taxPrice,
        shippingPrice: body.shippingPrice,
        totalPrice:    body.totalPrice,
        paymentInfo:   body.paymentInfo,
        status:        "Processing",
        createdAt:     new Date().toISOString(),
      };
      await db.send(new PutCommand({ TableName: TABLE, Item: order }));

      // Send order confirmation email
      try {
        await ses.send(new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [orderEmail] },
          Message: {
            Subject: { Data: `Your Rexony order has been placed!` },
            Body: { Text: { Data: `Hi,\n\nThank you for your order! Your order #${order.orderId.slice(-10)} has been placed successfully and is now being processed.\n\nTotal: $${body.totalPrice}\n\nThank you for shopping with Rexony!` } }
          }
        }));
      } catch (emailErr) {
        console.error("SES error:", emailErr.message);
      }

      return { statusCode: 201, headers: H, body: JSON.stringify({ order }) };
    }

    // GET /orders/me
    if (method === "GET" && path === "/orders/me") {
      if (!userId) return { statusCode: 401, headers: H, body: JSON.stringify({ message: "Unauthorized" }) };
      const { Items } = await db.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "userId-index",
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
      }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ orders: Items || [] }) };
    }

    // GET /admin/orders
    if (method === "GET" && path === "/admin/orders") {
      const { Items } = await db.send(new ScanCommand({ TableName: TABLE }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ orders: Items || [] }) };
    }

    // PUT /order/{id}/cancel — customer cancels their own order
if (method === "PUT" && path === "/order/{id}/cancel") {
  const jwt = decodeJWT(event);
  if (!jwt) return { statusCode: 401, headers: H, body: JSON.stringify({ message: "Unauthorized" }) };
  const { Item: order } = await db.send(new GetCommand({ TableName: TABLE, Key: { orderId: id } }));
  if (!order) return { statusCode: 404, headers: H, body: JSON.stringify({ message: "Order not found" }) };
  if (order.userId !== jwt.sub && order.userEmail !== jwt.email)
    return { statusCode: 403, headers: H, body: JSON.stringify({ message: "Forbidden" }) };
  if (order.status !== "Processing")
    return { statusCode: 400, headers: H, body: JSON.stringify({ message: "Only Processing orders can be cancelled" }) };
  await db.send(new UpdateCommand({
    TableName: TABLE,
    Key: { orderId: id },
    UpdateExpression: "SET #s = :s",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "Cancelled" }
  }));
  // Email customer
  if (order.userEmail) {
    try {
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [order.userEmail] },
        Message: {
          Subject: { Data: `Your Rexony order has been cancelled` },
          Body: { Text: { Data: `Hi,\n\nYour order #${id.slice(-10)} has been successfully cancelled.\n\nIf you didn't request this, please contact us.\n\nThank you,\nRexony` } }
        }
      }));
    } catch (emailErr) {
      console.error("SES error:", emailErr.message);
    }
  }
  return { statusCode: 200, headers: H, body: JSON.stringify({ message: "Order cancelled" }) };
}

    // PUT /admin/order/{id} — admin updates status + emails customer
    if (method === "PUT" && path === "/admin/order/{id}") {
      const { Item: order } = await db.send(new GetCommand({ TableName: TABLE, Key: { orderId: id } }));
      await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { orderId: id },
        UpdateExpression: "SET #s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": body.status },
      }));
      // Email customer
      if (order?.userEmail) {
        try {
          await ses.send(new SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [order.userEmail] },
            Message: {
              Subject: { Data: `Your Rexony order has been updated` },
              Body: { Text: { Data: `Hi,\n\nYour order #${id.slice(-10)} status has been updated to: ${body.status}.\n\nThank you for shopping with Rexony!` } }
            }
          }));
        } catch (emailErr) {
          console.error("SES error:", emailErr.message);
        }
      }
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    // DELETE /admin/order/{id}
    if (method === "DELETE" && path === "/admin/order/{id}") {
      await db.send(new DeleteCommand({ TableName: TABLE, Key: { orderId: id } }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers: H, body: JSON.stringify({ message: "Not found", method, path }) };
  } catch (err) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ message: err.message }) };
  }
};