const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { Base64 } = require('js-base64');
require("dotenv").config();
const cors = require('cors');

const app = express();
const port = 3000;

const uri = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());

let client, db;

// Function to connect to MongoDB
async function connectToMongo() {
    console.log("Attempting to connect to MongoDB...");
    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db("NunesAuto");
        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw error;
    }
}

// Middleware for basic authentication
async function basicAuth(req, res, next) {
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

// Endpoint to handle sign up
app.post("/signup", async (req, res) => {
    try {
        const newUser = req.body;
        const encodedPassword = Base64.encode(newUser.password);
        const userToInsert = { ...newUser, Password: encodedPassword, createdAt: new Date() };
        delete userToInsert.password;

        const collection = db.collection("Users"); 
        const result = await collection.insertOne(userToInsert);

        res.status(201).send({
            msg: "User has been successfully posted",
            userId: result.insertedId 
        });
    } catch (error) {
        console.error("Could not post user:", error);
        res.status(500).send("Could not post user");
    }
});

// Create a new user account
app.post("/users", async (req, res) => {
    try {
        const { NameAndSurname, Email, Password, Gender, UserNumber } = req.body.data;
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
            user: { Email: newUser.Email, _id: result.insertedId }
        });
    } catch (error) {
        console.error("Error creating user:", error);
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

// Access the Cart collection
// NOTE: This must be placed here so the db object is available.
let cartCollection;

// POST - Add item to cart
app.post("/cart", async (req, res) => {
    try {
        // Ensure the cartCollection is initialized
        if (!cartCollection) {
            cartCollection = db.collection("Cart");
        }

        // Get the item from the request body
        const item = req.body;
        console.log("Received item for cart:", req.body);
        // Check if the item and its _id are valid
        if (!item || !item._id) {
            return res.status(400).json({ error: "Invalid item" });
        }
        
        // Convert the _id from a string to a MongoDB ObjectId
        // This is important for database queries
        const objectId = new ObjectId(item._id);

        // Check if the item already exists in the cart using the ObjectId
        const existingItem = await cartCollection.findOne({ _id: objectId });
        if (existingItem) {
            return res.status(400).json({ error: "Item already in cart" });
        }

        // Insert the new item into the cart
        await cartCollection.insertOne({ ...item, _id: objectId });
        
        // Respond with success
        res.status(201).json(item);
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// The GET and DELETE routes are fine, but for consistency,
// it's a good practice to handle the collection initialization
// in a similar way.

// GET - Fetch all cart items
app.get("/cart", async (req, res) => {
    try {
        if (!cartCollection) cartCollection = db.collection("Cart");
        const cartItems = await cartCollection.find({}).toArray();
        res.status(200).json(cartItems);
    } catch (error) {
        console.error("Error retrieving cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// DELETE - Remove item from cart
app.delete("/cart/:id", async (req, res) => {
    try {
        if (!cartCollection) cartCollection = db.collection("Cart");
        const { id } = req.params;

        // You should convert the ID to a MongoDB ObjectId here too
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid ID format" });
        }

        const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Item not found in cart" });
        }
        const cartItems = await cartCollection.find({}).toArray();
        res.status(200).json({ message: "Item removed", cart: cartItems });
    } catch (error) {
        console.error("Error removing item from cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// --- AUTHENTICATED ENDPOINTS (Require basicAuth header) ---

// All routes after this line will require basic authentication
app.use(basicAuth);

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

// ... The rest of your authenticated routes (/users, /parts/:id, /parts, etc.) are already in the correct place.

// Start the server and connect to MongoDB
async function startServer() {
    try {
        await connectToMongo();
        app.listen(port, () => {
            console.log(`Server listening at http://localhost:${port}`);
        });
    } catch (err) {
        console.error("Failed to connect to MongoDB or start server:", err);
        process.exit(1);
    }
}

startServer();