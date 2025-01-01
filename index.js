const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.fmfkc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// JWT Verification Middleware
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("deltaCar").collection("services");
    const orderCollection = client.db("deltaCar").collection("orders");

    // JWT Token Generation
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Fetch all services with optional search and sort
    app.get("/services", async (req, res) => {
      const search = req.query.search || "";
      let query = {};
      if (search.length > 0) {
        query = { $text: { $search: search } };
      }
      const order = req.query.order === "asc" ? 1 : -1;
      const cursor = serviceCollection.find(query).sort({ price: order });
      const services = await cursor.toArray();
      res.send(services);
    });

    // Fetch service by ID
    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const service = await serviceCollection.findOne(query);
      res.send(service);
    });

    // Fetch orders for a specific user
    app.get("/orders", verifyJWT, async (req, res) => {
      const decoded = req.decoded;
      if (decoded.email !== req.query.email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      const query = { email: req.query.email || "" };
      const cursor = orderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    // Create a new order
    app.post("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      const decoded = req.decoded;
      if (decoded.email !== order.email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // Update order status
    app.patch("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: { status },
      };
      const result = await orderCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // Delete an order
    app.delete("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const decoded = req.decoded;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      if (order.email !== decoded.email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Ensure the client is closed when the server shuts down
    process.on("SIGINT", async () => {
      await client.close();
      console.log("MongoDB connection closed.");
      process.exit(0);
    });
  }
}

run().catch((error) => console.error(error));

// Base endpoint
app.get("/", (req, res) => {
  res.send("Delta car server running");
});

// Start the server
app.listen(port, () => {
  console.log(`Delta car server running on port ${port}`);
});
