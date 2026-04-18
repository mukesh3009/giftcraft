// ===== IMPORTS =====
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// ===== APP INIT =====
const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use("/uploads", express.static("uploads"));

// ===== SERVE FRONTEND =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== DATABASE CONNECTION =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB ERROR:", err));

// ===== SCHEMAS =====
const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: String,
  createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new mongoose.Schema({
  name: String,
  category: String,
  price: Number,
  description: String,
  emoji: String,
  color: String,
  tag: String,
  stock: { type: Number, default: 100 },
  images: [String],
  customizable: { type: Boolean, default: true },
  variants: [String],
});

const OrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      name: String,
      price: Number,
      qty: Number,
      customText: String,
      variant: String,
      photoUrl: String,
    },
  ],
  shippingAddress: {
    firstName: String,
    lastName: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    pincode: String,
    phone: String,
    email: String,
  },
  paymentMethod: String,
  subtotal: Number,
  shipping: Number,
  discount: Number,
  total: Number,
  status: {
    type: String,
    default: "Placed",
    enum: ["Placed", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"],
  },
  orderId: String,
  createdAt: { type: Date, default: Date.now },
});

// ===== MODELS =====
const User = mongoose.model("User", UserSchema);
const Product = mongoose.model("Product", ProductSchema);
const Order = mongoose.model("Order", OrderSchema);

// ===== AUTH MIDDLEWARE =====
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "giftcraft_secret"
    );
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// ===== FILE UPLOAD =====
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ===== AUTH ROUTES =====
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    if (!email || !password || !firstName) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashed,
      phone,
    });

    const token = jwt.sign(
      { id: user._id, email },
      process.env.JWT_SECRET || "giftcraft_secret",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: { id: user._id, firstName, email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email },
      process.env.JWT_SECRET || "giftcraft_secret",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user._id, firstName: user.firstName, email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// ===== PRODUCTS =====
app.get("/api/products/seed", async (req, res) => {
  try {
    await Product.deleteMany({});

    await Product.insertMany([
      { name: "Classic Photo Mug", category: "Mugs", price: 349, emoji: "☕", color: "#fff3ec", description: "Custom mug", variants: ["White", "Black"] },
      { name: "Photo Frame", category: "Frames", price: 549, emoji: "🖼️", color: "#edf3ff", description: "Wood frame", variants: ["Oak", "White"] },
    ]);

    res.json({ message: "Seeded!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/products", async (req, res) => {
  res.json(await Product.find());
});

app.get("/api/products/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
});

// ===== ORDERS =====
app.post("/api/orders", auth, async (req, res) => {
  const order = await Order.create({ ...req.body, user: req.user.id });
  res.status(201).json(order);
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`GiftCraft server running on port ${PORT}`);
});