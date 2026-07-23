// ─── rexony-cart Lambda — index.mjs ──────────────────────────────
// Routes:
//   GET    /cart              → get user's cart
//   POST   /cart              → add item to cart
//   PUT    /cart              → update item quantity
//   DELETE /cart/clear        → clear entire cart
//   DELETE /cart/{productId}  → remove one item

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, PutCommand,
         UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const db    = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = "Cart";
const H     = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const handler = async (event) => {
  const method = event.httpMethod;
  const path   = event.resource;           // e.g. "/cart" or "/cart/{productId}" or "/cart/clear"
  const pid    = event.pathParameters?.productId;
  const claims = event.requestContext?.authorizer?.claims || {};
  const userId = claims.sub;
  const body   = event.body ? JSON.parse(event.body) : {};

  if (!userId) return { statusCode: 401, headers: H, body: JSON.stringify({ message: "Unauthorized" }) };

  try {
    // GET /cart — return all items for this user
    if (method === "GET") {
      const { Items } = await db.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
      }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ items: Items || [] }) };
    }

    // POST /cart — add or increment item
    if (method === "POST") {
      const item = {
        userId,
        productId: body.productId,
        name:      body.name,
        price:     body.price,
        image:     body.image || "",
        quantity:  body.quantity || 1,
        Stock:     body.Stock || 0,
      };
      await db.send(new PutCommand({ TableName: TABLE, Item: item }));
      return { statusCode: 201, headers: H, body: JSON.stringify({ item }) };
    }

    // PUT /cart — update quantity of existing item
    if (method === "PUT") {
      await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { userId, productId: body.productId },
        UpdateExpression: "SET quantity = :q",
        ExpressionAttributeValues: { ":q": body.quantity },
      }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    // DELETE /cart/clear — wipe entire cart for user
    if (method === "DELETE" && path === "/cart/clear") {
      const { Items } = await db.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
      }));
      await Promise.all((Items || []).map(item =>
        db.send(new DeleteCommand({ TableName: TABLE, Key: { userId, productId: item.productId } }))
      ));
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    // DELETE /cart/{productId} — remove one item
    if (method === "DELETE" && pid) {
      await db.send(new DeleteCommand({ TableName: TABLE, Key: { userId, productId: pid } }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers: H, body: JSON.stringify({ message: "Not found" }) };
  } catch (err) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ message: err.message }) };
  }
};
