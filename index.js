const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 8000;
require("dotenv").config();
const jwt = require("jsonwebtoken");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Use Middle ware
app.use(cors());
app.use(express.json());

// create jwt token
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, "process.env.TOKEN_SECRET_KEY", function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.whmvw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const partsCollection = client
      .db("electronics-manufacturer")
      .collection("parts");
    const orderCollection = client
      .db("electronics-manufacturer")
      .collection("orders");
    const userCollection = client
      .db("electronics-manufacturer")
      .collection("users");
    const paymentCollection = client
      .db("electronics-manufacturer")
      .collection("payments");
    const reviewCollection = client
      .db("electronics-manufacturer")
      .collection("reviews");

    // jwt sign

    /* --------------------------------------
                    users api's
      -------------------------------------- */

    // Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      console.log(decodedEmail);
      const user = await userCollection.findOne({ email: decodedEmail });
      if (user.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    /* ------------------------------------------
                  user api's
    --------------------------------------------- */
    // first timeupdate user or create. when need to send on database
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };

      const updateUser = await userCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, "process.env.TOKEN_SECRET_KEY");

      res.send({ updateUser, token });
    });

    // update user info
    app.put("/updateUser/:email", async (req, res) => {
      const email = req.params.email;
      const userInfo = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: userInfo,
      };

      const updateUser = await userCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, "process.env.TOKEN_SECRET_KEY");

      res.send({ updateUser, token });
    });

    // make admin means update user
    app.put(
      "/user/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const makeAdmin = await userCollection.updateOne(query, updateDoc);
        res.send(makeAdmin);
      }
    );

    // get admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";

      res.send({ admin: isAdmin, user: user });
    });

    // get all users
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    // get  user by login email
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.find(query).toArray();
      res.send(user);
    });

    /* ------------------------------------------
                  parts api's
    --------------------------------------------- */

    // get all parts
    app.get("/parts", async (req, res) => {
      const query = {};
      const getParts = await partsCollection.find(query).toArray();
      res.send(getParts);
    });

    // get part by id
    app.get("/parts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const getPartById = await partsCollection.findOne(query);
      res.send(getPartById);
    });

    // create part
    app.post("/part", verifyToken, verifyAdmin, async (req, res) => {
      const part = req.body;
      const createPart = await partsCollection.insertOne(part);
      res.send({ message: "part successfully create" });
    });

    /* ---------------------------------------------------
                      order api's  
    -----------------------------------------------------*/
    // create an order
    app.post("/orders", async (req, res) => {
      const body = req.body;

      const createOrder = await orderCollection.insertOne(body);
      res.status(201).json(createOrder);
    });

    // get order by email
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const getOrder = await orderCollection.find(query).toArray();
      res.send(getOrder);
    });

    // get order byt id
    app.get("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const getOrder = await orderCollection.findOne(query);
      res.send(getOrder);
    });

    // update order price
    app.patch("/order/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
      const paymentOrder = await paymentCollection.insertOne(payment);

      res.send(updatedDoc);
    });

    // delete the order by id
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const deleteOrder = await orderCollection.deleteOne(query);
      res.send(deleteOrder);
    });

    /* ---------------------------------------------------
                  Payment intent api's 
    ---------------------------------------------------- */

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const order = req.body;
      const price = order.price;
      if (price) {
        const convertPrice = parseInt(price);
        const amount = convertPrice * 100;
        console.log(price, convertPrice, amount);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });

    /* ---------------------------------------------------
                  Add review api's 
    ---------------------------------------------------- */

    // create add review
    app.post("/review", verifyToken, async (req, res) => {
      const review = req.body;
      const addReview = await reviewCollection.insertOne(review);
      res.send({ message: "Review added successfully" });
    });

    // get review
    app.get("/review", async (req, res) => {
      const query = {};
      const reviews = await reviewCollection.find(query).toArray();
      res.send(reviews);
    });
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("backed server connected");
});

app.listen(port, () => {
  console.log("Backend server is running!");
});
