const express = require("express");
const { MongoClient, ObjectId } = require("mongodb"); // For interacting with MongoDB database
const { Base64 } = require('js-base64'); // For encoding/decoding passwords
require("dotenv").config();
const cors = require('cors');

const app = express();
const port = 3000;

// MongoDB connection string loaded from your .env file
const uri = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());

let client, db;

// Function to connect to MongoDB
// This is an 'async' function because connecting to a database takes time (it's asynchronous)
async function connectToMongo() {
    console.log("Attempting to connect to MongoDB...");

    try {
        client = new MongoClient(uri); // Create a new MongoDB client using the connection string
        await client.connect(); // 'await' pauses here until the connection is successful
        db = client.db("NunesAuto");
        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        // If connection fails, log the error and stop the server process
        console.error("MongoDB connection error:", error);
        throw error;
    }
}

//Middleware for basic authentication
async function basicAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    console.log("--- basicAuth Middleware Start ---");
    console.log("Auth Header Received:", authHeader); 

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        console.log("Auth: Missing or invalid header format.");
        return res
            .status(401)
            .json({ message: "Authorization header missing or invalid" });
    }

    const base64Credentials = authHeader.split(" ")[1];
    console.log("Base64 Credentials:", base64Credentials); // Log the base64 part

    if (!base64Credentials) {
        console.log("Auth: Empty base64 credentials after split.");
        return res.status(400).json({ message: "Invalid Basic Authorization format" });
    }

    const credentials = Base64.decode(base64Credentials).split(":");
    const email = credentials[0];
    const password = credentials[1].trim();

    console.log("Decoded Email:", email); // Log the decoded email
    console.log("Decoded Password (plaintext):", password); // Log the decoded password

    const collection = db.collection("Users");
    const user = await collection.findOne({ Email: email }); // Ensure 'Email' is capitalized here

    if (!user) {
        console.log(`Auth: User '${email}' not found in DB.`);
        return res.status(401).json({ message: "User not found" });
    }

    console.log("User found in DB. DB User Email:", user.Email);
    console.log("DB User Encoded Password:", user.Password);

    const decodedPassword = Base64.decode(user.Password); // Ensure 'Password' is capitalized here
    console.log("DB User Decoded Password:", decodedPassword);

    if (decodedPassword !== password) {
        console.log("Auth: Invalid password. Decoded DB pass:", decodedPassword, "Provided pass:", password);
        return res.status(401).json({ message: "Invalid password" });
    }

    console.log("Auth: User successfully authenticated!");
    req.user = user;
    next();
    console.log("--- basicAuth Middleware End ---");
} 


// PUBLIC ENDPOINTS (No authentication required for these)

// Endpoint to handle sign up (for users to create their own accounts)
app.post("/signup", async (req, res) => {
    try {
        const newUser = req.body;

        // Convert password to base64
        const encodedPassword = Base64.encode(newUser.password);
        console.log("Encoded password for signup:", encodedPassword);

        const userToInsert = {
            ...newUser,
            Password: encodedPassword, // Use the Base64 encoded password
            createdAt: new Date(),
        };
        delete userToInsert.password;

        const collection = db.collection("Users"); 
        const result = await collection.insertOne(userToInsert);

        console.log("User has successfully been added to 'Users' collection");
        res.send({
            smg: "User has been successfully posted",
            userId: result.insertedId 
        });
    } catch (error) {
        console.error("Could not post user:", error);
        res.status(500).send("Could not post user");
    }
});


// Create a new user account (this endpoint is also for user registration)
app.post("/users", async (req, res) => {
    try {
        console.log("Req.Body backend", req.body)
        console.log("Req.Body.Data backend", req.body.data)

        const now = new Date();
        const CustomerID = now.getTime();
        console.log("CustomerID backend", CustomerID )

        const { NameAndSurname, Email, Password, Gender, UserNumber } = req.body.data;
        console.log("Email backend", Email)
        console.log("Password backend", Password)

        if ( Email == "" || Password == "") {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const collection = db.collection("Users"); // Access the 'Users' collection

        // Check if a user with this email already exists
        const existingUser = await collection.findOne({ Email });
        if (existingUser) {
            return res.status(409).json({ message: "User with this email already exists" });
        }
        
        // Encode the password before storing it for basic security
        const encodedPassword = Base64.encode(Password);
        
        // Create the new user object
        const newUser = {
            CustomerID, NameAndSurname, Email,
            Password: encodedPassword, // Store the encoded password
            Gender, UserNumber,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Insert the new user into the database
        const result = await collection.insertOne(newUser);

        // Send a success response with the new user's email and generated ID
        res.status(201).json({
            message: "User created successfully",
            user: { Email: newUser.Email, _id: result.insertedId }
        });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

//Get All Brands 
app.get("/brands", async (req, res) => {
    try{
        const collection = db.collection("Brands");
        const brands = await collection.find({}).toArray();
        res.status(200).json(brands);
        console.log("Brand secure")
    } catch (error){
        console.log("Error getting brands:", error);
        res.status(500).json({message: "Internal server error"})
    }
})

// Get All Parts (protected)
app.get("/parts", async (req, res) => {
    try {
        const collection = db.collection("Parts"); // Access the 'Parts' collection
        const parts = await collection.find({}).toArray(); // Get all documents
        console.log(parts)
        res.status(200).json(parts); // Send them back
    } catch (error) {
        console.error("Error retrieving parts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// AUTHENTICATED ENDPOINTS (Require basicAuth header)


app.use(basicAuth);

// User Login / Password Check 
app.get("/checkpassword", async (req, res) => {
    try {
        console.log("/checkpassword", req.user)
        const { Email, Password } = req.user;
        // Make sure email and password are provided
        if (!Email || !Password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Accessing the 'Users' collection
        const collection = db.collection("Users");

        // Find the user by their email
        const user = await collection.findOne({ Email: Email });

        // If no user found, return an error (though basicAuth would have caught this)
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Decode the stored password and compare it with the provided password
        const decodedPasswordFrontend = Base64.decode(Password);
        const decodedPasswordBackend = Base64.decode(user.Password);

        if (decodedPasswordBackend === decodedPasswordFrontend) {
            res.status(200).json({ message: "Password is correct" });
        } else {
            res.status(401).json({ message: "Password is incorrect" });
        }
    } catch (error) {
        console.error("Error checking password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Get User Profile (protected)
app.get("/users", async (req, res) => {
    try {
        const { email } = req.query; // Check if an email is provided
        const collection = db.collection("Users"); // Accessing the 'Users' collection

        let users;
        if (email) {
            // If email is provided, find a specific user
            users = await collection.findOne({ Email: email });
            if (!users) {
                return res.status(404).json({ message: "User not found" });
            }
            // Destructure to remove the password field before sending the response
            const { Password, ...userWithoutPassword } = users;
            res.status(200).json(userWithoutPassword);
        } else {
            // If no email provided, get all users
            // Project to exclude the Password field from all users
            users = await collection.find({}).project({ Password: 0 }).toArray();
            res.status(200).json(users);
        }
    } catch (error) {
        console.error("Error retrieving users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Update User Profile (protected)
app.put("/users/:email", async (req, res) => {
    try {
        const { email } = req.params; // Get the user's email from the URL
        const { newPassword } = req.body; // Get the new password from the request body

        if (!newPassword) {
            return res.status(400).json({ message: "New password is required" });
        }

        const collection = db.collection("Users"); // Access the 'Users' collection

        const encodedNewPassword = Base64.encode(newPassword); // Encode the new password

        // Update the user's document based on their email
        const result = await collection.updateOne(
            { Email: email }, // Find the user by their email
            { $set: { Password: encodedNewPassword, updatedAt: new Date() } } // Set the new password and update timestamp
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User password updated successfully" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Delete User Account (protected)
app.delete("/users/:email", async (req, res) => {
    try {
        const { email } = req.params; // Get the user's email from the URL
        const collection = db.collection("Users"); // Accessing the 'Users' collection

        // Delete the user's document based on their email
        const result = await collection.deleteOne({ Email: email });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// User Locations (protected)
app.post("/user-locations", async (req, res) => {
    try {
        const { customerId, Address, City, Province, Suburb, Latitude, Longitude } = req.body;
        if (!customerId || !Address || !City || !Province || !Suburb || Latitude === undefined || Longitude === undefined) {
            return res.status(400).json({ message: "Missing required user location fields" });
        }
        const collection = db.collection("UserLocation"); // Accessing 'UserLocation' collection
        const newUserLocation = {
            customerId, Address, City, Province, Suburb,
            Latitude: Number(Latitude), Longitude: Number(Longitude),
            createdAt: new Date(), updatedAt: new Date()
        };
        const result = await collection.insertOne(newUserLocation);
        res.status(201).json({ message: "User location created successfully", locationId: result.insertedId, customerId: newUserLocation.customerId });
    } catch (error) {
        console.error("Error creating user location:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/user-locations", async (req, res) => {
    try {
        const collection = db.collection("UserLocation");
        const userLocations = await collection.find({}).toArray();
        res.status(200).json(userLocations);
    } catch (error) {
        console.error("Error retrieving user locations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/user-locations/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user location ID format" });
        }
        const collection = db.collection("UserLocation");
        const userLocation = await collection.findOne({ _id: new ObjectId(id) });
        if (!userLocation) {
            return res.status(404).json({ message: "User location not found" });
        }
        res.status(200).json(userLocation);
    } catch (error) {
        console.error("Error retrieving user location by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.put("/user-locations/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user location ID format" });
        }
        const collection = db.collection("UserLocation");
        const updateFields = { ...updates };
        if (updateFields.Latitude !== undefined) updateFields.Latitude = Number(updateFields.Latitude);
        if (updateFields.Longitude !== undefined) updateFields.Longitude = Number(updateFields.Longitude);
        updateFields.updatedAt = new Date(); // Update timestamp

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User location not found" });
        }
        res.status(200).json({ message: "User location updated successfully" });
    } catch (error) {
        console.error("Error updating user location:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/user-locations/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user location ID format" });
        }
        const collection = db.collection("UserLocation");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User location not found" });
        }
        res.status(200).json({ message: "User location deleted successfully" });
    } catch (error) {
        console.error("Error deleting user location:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Get Single Part Details (protected)
// Endpoint: GET /parts/:id
app.get("/parts/:id", async (req, res) => {
    try {
        const { id } = req.params; // Get the part's unique ID from the URL

        if (!ObjectId.isValid(id)) { // Check if the ID is in a valid MongoDB format
            return res.status(400).json({ message: "Invalid part ID format" });
        }

        const collection = db.collection("Parts"); // Accessing  the 'Parts' collection
        const part = await collection.findOne({ _id: new ObjectId(id) }); // Find the part by its ID

        if (!part) { // If no part found with that ID
            return res.status(404).json({ message: "Part not found" });
        }

        res.status(200).json(part);
    } catch (error) {
        console.error("Error retrieving part by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Create a New Part (protected)
app.post("/parts", async (req, res) => {
    try {
        // Get part data from request body, using specific field names from your screenshots
        const { ProductID, Brand, Part, dateOfSelection, Viewed, userCount, price, quantityAvailable } = req.body;

        // Basic validation for essential part fields
        if (!ProductID || !Brand || !Part || !dateOfSelection || Viewed === undefined || userCount === undefined || price === undefined || quantityAvailable === undefined) {
            return res.status(400).json({ message: "Missing required part fields" });
        }

        const collection = db.collection("Parts"); // Accessing the 'Parts' collection

        // Create the new part object
        const newPart = {
            ProductID, Brand, Part, dateOfSelection, Viewed,
            userCount: Number(userCount),
            price: Number(price),
            quantityAvailable: Number(quantityAvailable),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await collection.insertOne(newPart); // Insert the new part
        res.status(201).json({ message: "Part created successfully", part: { _id: result.insertedId, ProductID: newPart.ProductID, Part: newPart.Part } });
    } catch (error) {
        console.error("Error creating part:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Updating a Part's Details (protected)
app.put("/parts/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid part ID format" });
        }

        const collection = db.collection("Parts"); // Accessing the 'Parts' collection

        const updateFields = { ...updates };
        if (updateFields.userCount !== undefined) updateFields.userCount = Number(updateFields.userCount);
        if (updateFields.price !== undefined) updateFields.price = Number(updateFields.price);
        if (updateFields.quantityAvailable !== undefined) updateFields.quantityAvailable = Number(updateFields.quantityAvailable);
        updateFields.updatedAt = new Date();

        const result = await collection.updateOne(
            { _id: new ObjectId(id) }, // Find the part by its ID
            { $set: updateFields }
        );

        if (result.matchedCount === 0) { // If no part was found with that ID
            return res.status(404).json({ message: "Part not found" });
        }

        res.status(200).json({ message: "Part updated successfully" });
    } catch (error) {
        console.error("Error updating part:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// DELETE a part (protected)
app.delete("/parts/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid part ID format" });
        }

        const collection = db.collection("Parts"); // Access the 'Parts' collection
        const result = await collection.deleteOne({ _id: new ObjectId(id) }); // Delete the part by ID

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Part not found" });
        }

        res.status(200).json({ message: "Part deleted successfully" });
    } catch (error) {
        console.error("Error deleting part:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Cart & Orders (protected)
app.post("/user-parts-details", async (req, res) => {
    try {
        // Get data for the user's part detail
        const { customerId, productId, Part, Cart, Price, Condition, Quantity, Carts, Reviews, Status, Checkout } = req.body;

        if (!customerId || !productId || !Part || !Cart || Price === undefined || !Condition || Quantity === undefined || Carts === undefined || Reviews === undefined || !Status || !Checkout) {
            return res.status(400).json({ message: "Missing required user part details fields" });
        }

        const collection = db.collection("UsersPartsDetails"); // Accessing 'UsersPartsDetails' collection

        const newUserPartDetail = {
            customerId, productId, Part, Cart, Condition, Status, Checkout,
            Price: Number(String(Price).replace('R ', '')), // Ensure 'R ' is removed and convert to Number
            Quantity: Number(Quantity),
            Carts: Number(Carts),
            Reviews: Number(Reviews),
            createdAt: new Date(), updatedAt: new Date()
        };

        const result = await collection.insertOne(newUserPartDetail);
        res.status(201).json({ message: "User part detail created successfully", detailId: result.insertedId, customerId: newUserPartDetail.customerId });
    } catch (error) {
        console.error("Error creating user part detail:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/user-parts-details", async (req, res) => {
    try {
        const collection = db.collection("UsersPartsDetails");
        const userPartDetails = await collection.find({}).toArray();
        res.status(200).json(userPartDetails);
    } catch (error) {
        console.error("Error retrieving user part details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/user-parts-details/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user part detail ID format" });
        }
        const collection = db.collection("UsersPartsDetails");
        const userPartDetail = await collection.findOne({ _id: new ObjectId(id) });
        if (!userPartDetail) {
            return res.status(404).json({ message: "User part detail not found" });
        }
        res.status(200).json(userPartDetail);
    } catch (error) {
        console.error("Error retrieving user part detail by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.put("/user-parts-details/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user part detail ID format" });
        }
        const collection = db.collection("UsersPartsDetails");
        const updateFields = { ...updates };
        if (updateFields.Price !== undefined) updateFields.Price = Number(String(updateFields.Price).replace('R ', ''));
        if (updateFields.Quantity !== undefined) updateFields.Quantity = Number(updateFields.Quantity);
        if (updateFields.Carts !== undefined) updateFields.Carts = Number(updateFields.Carts);
        if (updateFields.Reviews !== undefined) updateFields.Reviews = Number(updateFields.Reviews);
        updateFields.updatedAt = new Date();

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User part detail not found" });
        }
        res.status(200).json({ message: "User part detail updated successfully" });
    } catch (error) {
        console.error("Error updating user part detail:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/user-parts-details/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user part detail ID format" });
        }
        const collection = db.collection("UsersPartsDetails");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User part detail not found" });
        }
        res.status(200).json({ message: "User part detail deleted successfully" });
    } catch (error) {
        console.error("Error deleting user part detail:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Orders (protected)
app.post("/orders", async (req, res) => {
    try {
        // Get order data from request body
        const { CustomerId, Order, Items, Location, totalAmountExcludingVat, totalIncludingVat, VAT, paymentMethod, Delivery } = req.body;

        if (!CustomerId || !Order || !Items || !Location || totalAmountExcludingVat === undefined || totalIncludingVat === undefined || !VAT || !paymentMethod || !Delivery) {
            return res.status(400).json({ message: "Missing required order fields" });
        }

        const collection = db.collection("Orders"); // Accessing 'Orders' collection

        const newOrder = {
            CustomerId, Order, Items, Location, VAT, paymentMethod, Delivery,
            totalAmountExcludingVat: Number(totalAmountExcludingVat),
            totalIncludingVat: Number(totalIncludingVat),
            createdAt: new Date(), updatedAt: new Date()
        };

        const result = await collection.insertOne(newOrder);
        res.status(201).json({ message: "Order created successfully", orderId: result.insertedId, Order: newOrder.Order });
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/orders", async (req, res) => {
    try {
        const collection = db.collection("Orders");
        const orders = await collection.find({}).toArray();
        res.status(200).json(orders);
    } catch (error) {
        console.error("Error retrieving orders:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order ID format" });
        }
        const collection = db.collection("Orders");
        const order = await collection.findOne({ _id: new ObjectId(id) });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error("Error retrieving order by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.put("/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order ID format" });
        }
        const collection = db.collection("Orders");
        const updateFields = { ...updates };
        if (updateFields.totalAmountExcludingVat !== undefined) updateFields.totalAmountExcludingVat = Number(updateFields.totalAmountExcludingVat);
        if (updateFields.totalIncludingVat !== undefined) updateFields.totalIncludingVat = Number(updateFields.totalIncludingVat);
        updateFields.updatedAt = new Date();

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(200).json({ message: "Order updated successfully" });
    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order ID format" });
        }
        const collection = db.collection("Orders");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(200).json({ message: "Order deleted successfully" });
    } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


//Feedback & Ratings (protected)
app.post("/feedback-ratings", async (req, res) => {
    try {
        const { customerId, productId, Message, Rating } = req.body;
        if (!customerId || !productId || !Message || !Rating) {
            return res.status(400).json({ message: "Missing required feedback fields" });
        }
        const collection = db.collection("Feedback&Ratings"); // Accessing 'Feedback&Ratings' collection
        const newFeedbackRating = {
            customerId, productId, Message, Rating,
            createdAt: new Date(), updatedAt: new Date()
        };
        const result = await collection.insertOne(newFeedbackRating);
        res.status(201).json({ message: "Feedback & Rating created successfully", feedbackId: result.insertedId, customerId: newFeedbackRating.customerId });
    } catch (error) {
        console.error("Error creating feedback & rating:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/feedback-ratings", async (req, res) => {
    try {
        const collection = db.collection("Feedback&Ratings");
        const feedbackRatings = await collection.find({}).toArray();
        res.status(200).json(feedbackRatings);
    } catch (error) {
        console.error("Error retrieving feedback & ratings:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/feedback-ratings/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid feedback ID format" });
        }
        const collection = db.collection("Feedback&Ratings");
        const feedbackRating = await collection.findOne({ _id: new ObjectId(id) });
        if (!feedbackRating) {
            return res.status(404).json({ message: "Feedback & Rating not found" });
        }
        res.status(200).json(feedbackRating);
    } catch (error) {
        console.error("Error retrieving feedback & rating by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.put("/feedback-ratings/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid feedback ID format" });
        }
        const collection = db.collection("Feedback&Ratings");
        const updateFields = { ...updates };
        updateFields.updatedAt = new Date();

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Feedback & Rating not found" });
        }
        res.status(200).json({ message: "Feedback & Rating updated successfully" });
    } catch (error) {
        console.error("Error updating feedback & rating:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/feedback-ratings/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid feedback ID format" });
        }
        const collection = db.collection("Feedback&Ratings");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Feedback & Rating not found" });
        }
        res.status(200).json({ message: "Feedback & Rating deleted successfully" });
    } catch (error) {
        console.error("Error deleting feedback & rating:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Start the server and connect to MongoDB
async function startServer() {
    try {
        await connectToMongo(); // Connect to the database
        app.listen(port, () => {
            // Once connected, start the Express server and listen for requests
            console.log(`Server listening at http://localhost:${port}`);
        });
    } catch (err) {
        // used if anything goes wrong during connection
        console.error("Failed to connect to MongoDB or start server:", err);
        process.exit(1);
    }
}

// Call the function to start everything
startServer();
