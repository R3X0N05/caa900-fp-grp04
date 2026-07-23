// index.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);
const TABLE = "Products";
const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const handler = async (event) => {
  const method = event.httpMethod;
  const path   = event.path;
  const id     = event.pathParameters?.id;
  const body   = event.body ? JSON.parse(event.body) : {};

  try {

    // GET /products
    if (method === "GET" && path === "/products") {
      const { Items } = await db.send(new ScanCommand({ TableName: TABLE }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ products: Items }) };
    }

    // GET /admin/products
    if (method === "GET" && path === "/admin/products") {
      const { Items } = await db.send(new ScanCommand({ TableName: TABLE }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ products: Items }) };
    }

    // GET /product/{id}
    if (method === "GET" && path.startsWith("/product/") && id) {
      const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { productId: id } }));
      if (!Item) return { statusCode: 404, headers: H, body: JSON.stringify({ message: "Product not found" }) };
      return { statusCode: 200, headers: H, body: JSON.stringify({ product: Item }) };
    }

    // POST /admin/product/new
    if (method === "POST" && path === "/admin/product/new") {
      const item = { ...body, productId: body.productId || crypto.randomUUID(), createdAt: new Date().toISOString() };
      await db.send(new PutCommand({ TableName: TABLE, Item: item }));
      return { statusCode: 201, headers: H, body: JSON.stringify({ product: item }) };
    }

    // DELETE /admin/product/{id}
    if (method === "DELETE" && id) {
      await db.send(new DeleteCommand({ TableName: TABLE, Key: { productId: id } }));
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers: H, body: JSON.stringify({ message: "Not found", method, path }) };

  } catch (err) {
    console.error("ERROR:", err.message);
    return { statusCode: 500, headers: H, body: JSON.stringify({ message: err.message }) };
  }
};