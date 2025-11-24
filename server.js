import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import { Base64 } from 'js-base64';
// Use dotenv/config for loading environment variables in ESM
import 'dotenv/config'; 
import cors from 'cors';
import { Buffer } from "buffer";

//port number
const port = 3000;
const app = express();
const router = express.Router();

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://98.91.62.10:3000",
  // "http://YOUR_IP:3000",
  "http://nunesauto1.co.za.s3-website-us-east-1.amazonaws.com"
];

app.use(bodyParser.json());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true
}));



const URI = process.env.URI;
const VITE_API_URL = process.env.VITE_API_URL;

// Middleware
app.use(express.json());

let client, db;

// Function to connect to MongoDB
async function connectToMongo() {
    console.log("Attempting to connect to MongoDB..." + URI);
    try {
        client = new MongoClient(URI);
        await client.connect();
        db = client.db("NunesAuto");
        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        console.log(URI)
        throw error;
    }
}

// Middleware for basic authentication
async function basicAuth(req, res, next) {
  // ... (rest of basicAuth remains the same)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        return res.status(401).json({ message: "Authorization header missing or invalid" });
    }
    const base64Credentials = authHeader.split(" ")[1];
    if (!base64Credentials) {
        return res.status(400).json({ message: "Invalid Basic Authorization format" });
    }
    const credentials = Base64.decode(base64Credentials).split(":");
    const email = credentials[0];
    const password = credentials[1].trim();
    const collection = db.collection("Users");
    const user = await collection.findOne({ Email: email });

    if (!user || Base64.decode(user.Password) !== password) {
        return res.status(401).json({ message: "Invalid email or password" });
    }
    req.user = user;
    next();
}


// --- PUBLIC ENDPOINTS (No authentication required) ---
// ... (All endpoints remain the same) ...
// Create a new user account
app.post("/users", async (req, res) => {
    try {
        const { NameAndSurname, Email, Password, Gender, UserNumber } = req.body;
        if (!Email || !Password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        const collection = db.collection("Users");
        const existingUser = await collection.findOne({ Email });
        if (existingUser) {
            return res.status(409).json({ message: "User with this email already exists" });
        }
        const encodedPassword = Base64.encode(Password);
        const newUser = {
            CustomerID: new Date().getTime(), NameAndSurname, Email,
            Password: encodedPassword, Gender, UserNumber,
            createdAt: new Date(), updatedAt: new Date()
        };
        const result = await collection.insertOne(newUser);
        res.status(201).json({
           message: "User created successfully",
           user: {
           _id: result.insertedId,
           CustomerID: newUser.CustomerID,
           NameAndSurname: newUser.NameAndSurname,
           Email: newUser.Email,
           Gender: newUser.Gender,
           UserNumber: newUser.UserNumber
          }
        });

      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

let userCollection; // declare 

// POST - Fetch user profile
app.post("/profile", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    if (!userCollection) userCollection = db.collection("Users");

    // Convert the provided password to Base64 (to match your stored value)
    const encodedPassword = Buffer.from(password).toString("base64");

    // Now find user based on Email and the encoded Password
    const user = await userCollection.findOne({
      Email: email,
      Password: encodedPassword
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Remove password before sending user data
    const { Password, ...userData } = user;
    res.status(200).json(userData);

  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Get All Brands
app.get("/brands", async (req, res) => {
    try {
        const collection = db.collection("Brands");
        const brands = await collection.find({}).toArray();
        res.status(200).json(brands);
    } catch (error) {
        console.error("Error getting brands:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Get All Parts
app.get("/parts", async (req, res) => {
    try {
        const collection = db.collection("Parts");
        const parts = await collection.find({}).toArray();
        res.status(200).json(parts);
    } catch (error) {
        console.error("Error retrieving parts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Access the Cart and Orders collection
let cartCollection;
let ordersCollection;
let usersCollection;

// POST - Add item to cart
app.post("/cart", async (req, res) => {
  try {
    if (!cartCollection) {
      cartCollection = db.collection("Cart");
    }
    
    const { item, CustomerID } = req.body;

    // ✅ Safety check
    if (!item || !item._id || !CustomerID) {
      return res.status(400).json({ error: "Invalid item or missing CustomerID" });
    }

    // ✅ Check only inside this user's cart
    const existingItem = await cartCollection.findOne({
      CustomerID: CustomerID,   // user-specific
      itemId: item._id,         // part ID
    });

    if (existingItem) {
      return res.status(400).json({ error: "Item already in this user's cart" });
    }

    // ✅ Insert with a new _id, but store itemId for tracking
    const newCartItem = {
      CustomerID: CustomerID,
      itemId: item._id,
      Name: item.Name,
      Price: item.Price,
      Image: item.Image,
      Brand: item.Brand,
      Quantity: 1,
      createdAt: new Date(),
    };

    await cartCollection.insertOne(newCartItem);
    res.status(201).json({ message: "Item added to cart", item: newCartItem });

  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// GET - Fetch cart items for a specific user
app.get("/cart/:CustomerID", async (req, res) => {
  try {
    if (!cartCollection) cartCollection = db.collection("Cart");

    const { CustomerID } = req.params;
    console.log("Request CustomerID:", CustomerID, typeof CustomerID);

    // Convert string param to number
    const customerIdNumber = Number(CustomerID);
    console.log("Querying Cart collection for CustomerID:", customerIdNumber);

    const cartItems = await cartCollection.find({ CustomerID: customerIdNumber }).toArray();
    console.log(`Found ${cartItems.length} items:`, cartItems);

    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Error retrieving user cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE - Remove item by user and id
app.delete("/cart/:CustomerID/:cartItemId", async (req, res) => {
  try {
    if (!cartCollection) cartCollection = db.collection("Cart");

    const { CustomerID, cartItemId } = req.params;

    if (!ObjectId.isValid(cartItemId)) {
      return res.status(400).json({ message: "Invalid item ID format" });
    }

    const result = await cartCollection.deleteOne({
      _id: new ObjectId(cartItemId),
      CustomerID: Number(CustomerID),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    const updatedCart = await cartCollection.find({
      CustomerID: Number(CustomerID),
    }).toArray();

    res.status(200).json({ message: "Item removed", cart: updatedCart });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// --- NEW ORDERS ENDPOINTS ---
// POST - Create a new order with all cart items
app.post("/orders", async (req, res) => {
  try {
    if (!ordersCollection) {
      ordersCollection = db.collection("Orders");
    }
    
    const orderData = req.body; // The entire JSON object from the frontend
    
    // You can add validation here to ensure the data is what you expect
    if (!orderData || !orderData.products || orderData.products.length === 0) {
      return res.status(400).json({ message: "Order data is incomplete or empty." });
    }

    const result = await ordersCollection.insertOne(orderData);
    
    res.status(201).json({ 
        message: "Order placed successfully!", 
        orderId: result.insertedId 
    });
    console.log("Creating order at:", new Date().toISOString());
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET - Fetch all orders
app.get("/orders/:CustomerID", async (req, res) => {
  try {
    if (!ordersCollection) {
      ordersCollection = db.collection("Orders");
    }

    const { CustomerID } = req.params;
    const customerIdNum = Number(CustomerID);

    // Validate ID
    if (!customerIdNum) {
      return res.status(400).json({ message: "Invalid CustomerID." });
    }

    const orders = await ordersCollection
      .find({ CustomerID: customerIdNum })
      .toArray();

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});
    
// Create transporter with full debug logging
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,  // your Gmail email
    pass: process.env.GMAIL_PASS   // 16-char app password
  },
  logger: true,   // logs SMTP activity
  debug: true     // detailed SMTP debug messages
});

// Helper function to send email
export async function sendEmail(to, subject, html) {
  console.log("Preparing to send email:", { to, subject });

  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      html
    });

    console.log("Email sent successfully!", info);
    return { success: true, info };
  } catch (error) {
    console.error("Failed to send email:", error);

    if (error.response) console.error("SMTP Response:", error.response);
    if (error.responseCode) console.error("SMTP Response Code:", error.responseCode);

    return { success: false, error };
  }
}

// POST endpoint to send email
app.post("/send-email", async (req, res) => {
  const { to, subject, html } = req.body;
  console.log("POST /send-email received:", { to, subject });

  const result = await sendEmail(to, subject, html);

  if (result.success) {
    console.log("POST /send-email SUCCESS:", to);
    res.json({ message: "Email sent!", info: result.info });
  } else {
    console.error("POST /send-email FAILED:", to, result.error);
    res.status(500).json({ error: "Failed to send email", details: result.error });
  }
});

// Get Parts by ID
app.get("/parts/:id", async (req, res) => {
    try {
        const collection = db.collection("Parts");
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid ID format" });
        }
        const part = await collection.findOne({ _id: new ObjectId(id) });
        if (!part) {
            return res.status(404).json({ message: "Part not found" });
        }
        res.status(200).json(part);
    } catch (error) {
        console.error("Error retrieving part:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.use(basicAuth);

// --- AUTHENTICATED ENDPOINTS (Require basicAuth header) ---
// ... (All authenticated endpoints remain the same) ...

// User Login / Password Check
app.get("/checkpassword", async (req, res) => {
    try {
        const user = req.user;
        const decodedPassword = Base64.decode(user.Password);
        const providedPassword = req.headers.authorization.split(" ")[1];
        const decodedProvidedPassword = Base64.decode(providedPassword).split(":")[1].trim();

        if (decodedPassword === decodedProvidedPassword) {
            res.status(200).json({ message: "Password is correct" });
        } else {
            res.status(401).json({ message: "Password is incorrect" });
        }
    } catch (error) {
        console.error("Error checking password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});




// Get User Profile
app.get("/users/profile", async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userProfile = {
            NameAndSurname: user.NameAndSurname,
            Email: user.Email,
            Gender: user.Gender,
            UserNumber: user.UserNumber,
            CustomerID: user.CustomerID,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
        res.status(200).json(userProfile);
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Update User Profile
app.put("/users/profile", async (req, res) => {
    try {
        const { NameAndSurname, Email, Gender, UserNumber } = req.body;
        const { _id } = req.user;
        const collection = db.collection("Users");
        const updateDoc = {
            $set: {
                NameAndSurname,
                Email,
                Gender,
                UserNumber,
                updatedAt: new Date(),
            },
        };
        const result = await collection.updateOne({ _id: new ObjectId(_id) }, updateDoc);
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        const updatedUser = await collection.findOne({ _id: new ObjectId(_id) });
        const userProfile = {
            NameAndSurname: updatedUser.NameAndSurname,
            Email: updatedUser.Email,
            Gender: updatedUser.Gender,
            UserNumber: updatedUser.UserNumber,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        };
        res.status(200).json({ message: "Profile updated successfully", userProfile });
    } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Delete User Account
app.delete("/users/profile", async (req, res) => {
    try {
        const { _id } = req.user;
        const collection = db.collection("Users");
        const result = await collection.deleteOne({ _id: new ObjectId(_id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Export the necessary components for testing
export { app, connectToMongo, client };

// Start the server and connect to MongoDB
async function startServer() {
    try {
        await connectToMongo();
        app.listen(port, "0.0.0.0", () => {
            console.log(`Server listening at http://0.0.0.0/0:${port}`);
        });
    } catch (err) {
        console.error("Failed to connect to MongoDB or start server:", err);
        process.exit(1);
    }
}

if (process.env.NODE_ENV !== 'test') {
    startServer();
}