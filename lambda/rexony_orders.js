// index.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const db    = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = "Orders";
const H     = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const handler = async (event) => {
  const method = event.httpMethod;
  const path   = event.resource;
  const id     = event.pathParameters?.id;
  const claims = event.requestContext?.authorizer?.claims || {};
  const userId = claims.sub;
  const body   = event.body ? JSON.parse(event.body) : {};

  try {
    // POST /order/new
    if (method === "POST" && path === "/order/new") {
      if (!userId) return { statusCode: 401, headers: H, body: JSON.stringify({ message: "Unauthorized" }) };
      const order = {
        orderId:       crypto.randomUUID(),
        userId,
        userEmail:     claims.email || "",
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

    // PUT /admin/order/{id}
    if (method === "PUT" && path === "/admin/order/{id}") {
      await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { orderId: id },
        UpdateExpression: "SET #s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": body.status },
      }));
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
