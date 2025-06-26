const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://10.10.14.42:4200', methods: ['GET', 'POST'] }
});

app.use(cors({ origin: 'http://10.10.14.42:4200', methods: ['GET', 'POST', 'DELETE', 'PUT'], allowedHeaders: ['Authorization', 'Content-Type'] }));
app.use(express.json());

const uri = 'mongodb://127.0.0.1:27017/chatsapp';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

async function connectToMongo() {
  try {
    await client.connect();
    db = client.db('chatsapp');
    console.log('✅ Connected to MongoDB');

    // Create indexes for unique constraints
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });

    // Seed admin user
    await seedAdminUser();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

connectToMongo();

const JWT_SECRET = 'your-secret-key';
const onlineUsers = {};

async function seedAdminUser() {
  try {
    const adminExists = await db.collection('users').findOne({ email: 'Admin@gmail.com' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin@123', 10);
      await db.collection('users').insertOne({
        username: 'Admin',
        email: 'Admin@gmail.com',
        password: hashedPassword,
        contacts: [],
        isAdmin: true
      });
      console.log('✅ Admin user created: Admin@gmail.com');
    }
  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
  }
}

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied: No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

app.get('/validate-token', verifyToken, (req, res) => {
  res.json({ valid: true, username: req.user.username });
});

app.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await db.collection('users').find({}, { projection: { username: 1, email: 1, _id: 1, isAdmin: 1 } }).toArray();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/admin/users/:userId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isAdmin) {
      return res.status(403).json({ message: 'Cannot delete admin user' });
    }
    await db.collection('users').deleteOne({ _id: new ObjectId(userId) });
    await db.collection('messages').deleteMany({ $or: [{ from: user.username }, { to: user.username }] });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/admin/messages/:userId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const messages = await db.collection('messages').find({
      $or: [{ from: user.username }, { to: user.username }]
    }).sort({ timestamp: 1 }).toArray();
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await db.collection('users').findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection('users').insertOne({
      username,
      email,
      password: hashedPassword,
      contacts: [],
      isAdmin: false
    });

    res.status(201).json({
      message: 'User registered successfully',
      username
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      username: user.username,
      userId: user._id.toString(),
      isAdmin: user.isAdmin
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/add-contact', verifyToken, async (req, res) => {
  try {
    const { contactUsername } = req.body;
    const currentUser = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    if (!contactUsername?.trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (currentUser.username === contactUsername) {
      return res.status(400).json({ message: 'Cannot add yourself' });
    }

    const contact = await db.collection('users').findOne({ username: { $regex: `^${contactUsername}$`, $options: 'i' } });
    if (!contact) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (currentUser.contacts.some(c => c.toLowerCase() === contactUsername.toLowerCase())) {
      return res.status(400).json({ message: 'Contact already exists' });
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $push: { contacts: contact.username } }
    );

    res.json({
      message: 'Contact added successfully',
      contact: contact.username
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

app.delete('/contacts/:contactUsername', verifyToken, async (req, res) => {
  try {
    const { contactUsername } = req.params;
    const currentUser = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    if (!currentUser.contacts.includes(contactUsername)) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $pull: { contacts: contactUsername } }
    );

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/contacts', verifyToken, async (req, res) => {
  try {
    console.log('Fetching contacts for userId:', req.user.userId);
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      console.log('User not found for userId:', req.user.userId);
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('Contacts found:', user.contacts);
    res.json({ contacts: user.contacts || [] });
  } catch (error) {
    console.error('Get contacts error:', error.message, error.stack);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

app.get('/messages/:contact', verifyToken, async (req, res) => {
  try {
    const messages = await db.collection('messages').find({
      $or: [
        { from: req.user.username, to: req.params.contact },
        { from: req.params.contact, to: req.user.username }
      ]
    }).sort({ timestamp: 1 }).toArray();
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/test-message', verifyToken, async (req, res) => {
  try {
    const { from, to, text } = req.body;
    console.log('Test message data:', { from, to, text });

    const message = {
      from,
      to,
      text,
      timestamp: new Date()
    };

    console.log('Saving test message:', message);
    const result = await db.collection('messages').insertOne(message);
    console.log('Test message saved:', result);

    res.json({ message: 'Test message saved', data: message });
  } catch (error) {
    console.error('Test message error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to save test message: ' + error.message });
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error: No token provided'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.user.username);
  onlineUsers[socket.user.username] = socket.id;

  socket.on('register-user', (username) => {
    socket.join(username);
  });

  socket.on('send-message', async (data) => {
    try {
      console.log('Received send-message:', data);
      if (!data.to || !data.text) {
        throw new Error('Missing required fields: to and text');
      }

      const message = {
        from: socket.user.username,
        to: data.to,
        text: data.text,
        timestamp: new Date()
      };

      console.log('Saving message:', message);
      const result = await db.collection('messages').insertOne(message);
      message._id = result.insertedId; // Include the inserted ID in the message
      console.log('Message saved successfully:', message);

      const recipientSocket = onlineUsers[data.to];
      if (recipientSocket) {
        io.to(recipientSocket).emit('message-received', message);
      }
      io.to(socket.id).emit('message-received', message);
    } catch (error) {
      console.error('Send message error:', error.message, error.stack);
      socket.emit('error', { message: 'Failed to send message: ' + error.message });
    }
  });

  socket.on('edit-message', async (data) => {
    try {
      const message = await db.collection('messages').findOne({ _id: new ObjectId(data._id) });
      if (!message || message.from !== socket.user.username) {
        return socket.emit('error', { message: 'Unauthorized or message not found' });
      }

      await db.collection('messages').updateOne(
        { _id: new ObjectId(data._id) },
        { $set: { text: data.text, timestamp: new Date() } }
      );

      const updatedMessage = await db.collection('messages').findOne({ _id: new ObjectId(data._id) });
      const recipientSocket = onlineUsers[message.to];
      if (recipientSocket) {
        io.to(recipientSocket).emit('message-updated', updatedMessage);
      }
      io.to(socket.id).emit('message-updated', updatedMessage);
    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  socket.on('delete-message', async (data) => {
    try {
      const message = await db.collection('messages').findOne({ _id: new ObjectId(data._id) });
      if (!message || message.from !== socket.user.username) {
        return socket.emit('error', { message: 'Unauthorized or message not found' });
      }

      await db.collection('messages').deleteOne({ _id: new ObjectId(data._id) });

      const recipientSocket = onlineUsers[message.to];
      if (recipientSocket) {
        io.to(recipientSocket).emit('message-deleted', { _id: data._id });
      }
      io.to(socket.id).emit('message-deleted', { _id: data._id });
    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  socket.on('typing', (data) => {
    const recipientSocket = onlineUsers[data.to];
    if (recipientSocket) {
      io.to(recipientSocket).emit('typing', { from: socket.user.username });
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.user.username);
    delete onlineUsers[socket.user.username];
  });
});

server.listen(3000, '0.0.0.0', () => console.log('🚀 Server running on http://0.0.0.0:3000'));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing MongoDB connection...');
  await client.close();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
