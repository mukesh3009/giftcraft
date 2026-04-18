const express = require("express");
const path = require("path");

const app = express();   // ✅ MUST come BEFORE app.use

// Middlewares
app.use(express.json());

// 👉 ADD THIS HERE (AFTER app is created)
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/giftcraft')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('DB error:', err));

const UserSchema = new mongoose.Schema({
  firstName: String, lastName: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: String, createdAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
  name: String, category: String, price: Number,
  description: String, emoji: String, color: String,
  tag: String, stock: { type: Number, default: 100 },
  images: [String], customizable: { type: Boolean, default: true },
  variants: [String]
});

const OrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String, price: Number, qty: Number,
    customText: String, variant: String, photoUrl: String }],
  shippingAddress: { firstName: String, lastName: String,
    address1: String, address2: String, city: String,
    state: String, pincode: String, phone: String, email: String },
  paymentMethod: String, subtotal: Number, shipping: Number,
  discount: Number, total: Number,
  status: { type: String, default: 'Placed', enum: ['Placed','Confirmed','Processing','Shipped','Delivered','Cancelled'] },
  orderId: String, createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'giftcraft_secret'); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};

const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } });

// AUTH
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;
    if (!email || !password || !firstName) return res.status(400).json({ message: 'Required fields missing' });
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ firstName, lastName, email, password: hashed, phone });
    const token = jwt.sign({ id: user._id, email }, process.env.JWT_SECRET || 'giftcraft_secret', { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, firstName, email } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email }, process.env.JWT_SECRET || 'giftcraft_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, firstName: user.firstName, email } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// PRODUCTS — seed MUST be before /:id
app.get('/api/products/seed', async (req, res) => {
  try {
    await Product.deleteMany({});
    await Product.insertMany([
      { name: 'Classic Photo Mug', category: 'Mugs', price: 349, emoji: '☕', color: '#fff3ec', description: 'High-quality ceramic mug with custom photo/message.', tag: 'Bestseller', variants: ['White', 'Black', 'Navy Blue'] },
      { name: 'Love Photo Frame', category: 'Frames', price: 549, emoji: '🖼️', color: '#edf3ff', description: 'Elegant wooden frame with engraved message.', tag: 'New', variants: ['Oak', 'Walnut', 'White'] },
      { name: 'Custom Cushion', category: 'Cushions', price: 699, emoji: '🛋️', color: '#eef6f0', description: 'Soft velvet cushion printed with your photo.', tag: '', variants: ['30x30cm', '40x40cm', '50x50cm'] },
      { name: 'Name Keychain', category: 'Keychains', price: 199, emoji: '🔑', color: '#f5f0ff', description: 'Laser-engraved stainless steel keychain.', tag: '', variants: ['Silver', 'Gold', 'Rose Gold'] },
      { name: 'Birthday Hamper Box', category: 'Hampers', price: 1299, emoji: '🎁', color: '#ffeef4', description: 'Curated hamper with mug, keychain, card & chocolates.', tag: '', variants: ['Small', 'Large'] }
    ]);
    res.json({ message: 'Seeded!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    let filter = {};
    if (category) filter.category = category;
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    let query = Product.find(filter);
    if (sort === 'price_asc') query = query.sort({ price: 1 });
    if (sort === 'price_desc') query = query.sort({ price: -1 });
    res.json(await query);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPLOAD
app.post('/api/upload', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ORDERS
app.post('/api/orders', auth, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, coupon } = req.body;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const shipping = 49;
    let discount = 0;
    if (coupon === 'GIFT10') discount = 50;
    if (coupon === 'FIRST20') discount = Math.floor(subtotal * 0.2);
    const orderId = 'GC-' + Math.floor(100000 + Math.random() * 900000);
    const order = await Order.create({ user: req.user.id, items, shippingAddress, paymentMethod, subtotal, shipping, discount, total: subtotal + shipping - discount, orderId });
    res.status(201).json({ order, orderId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/orders', auth, async (req, res) => {
  try { res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GiftCraft server running on port ${PORT}`));