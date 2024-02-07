const express = require('express');
const mongoose = require('mongoose');
const socketIO = require('socket.io');
const bodyParser = require('body-parser');

const app = express();
const server = require('http').Server(app);
const io = socketIO(server);

// MongoDB connection
const atlasConnectionString = 'mongodb+srv://warstander45:comp3123@cluster0.djpgvtv.mongodb.net/w2024_comp3133?retryWrites=true&w=majority';

mongoose.connect(atlasConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });
// Express setup
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Mongoose models
const User = mongoose.model('User', {
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  firstname: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  lastname: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  password: {
    type: String,
    required: true,
    minlength: 6, // Adjust the minimum password length as needed
  },
  createon: {
    type: Date,
    default: Date.now,
  },
});
  
  const GroupMessage = mongoose.model('GroupMessage', {
    from_user: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    room: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000, // Adjust the maximum message length as needed
    },
    date_sent: {
      type: Date,
      default: Date.now,
    },
  });
  
  const PrivateMessage = mongoose.model('PrivateMessage', {
    from_user: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    to_user: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000, // Adjust the maximum message length as needed
    },
    date_sent: {
      type: Date,
      default: Date.now,
    },
  });

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Add this route before the 'io.on' part in your app.js
app.get('/users', (req, res) => {
  User.find({}, 'username', (err, users) => {
    if (err) throw err;
    res.json(users);
  });
});

// Add a new route for the login page
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/chat/:room', (req, res) => {
  res.sendFile(__dirname + '/public/chat.html');
});


// Handle user login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check if the user exists in the database
  User.findOne({ username, password }).then((user) => {
    if (user) {
      // Store the username in localStorage for session
      res.sendFile(__dirname + '/public/chat.html');
      io.emit('chat message', { username: 'Admin', text: `${username} has joined the chat!`, timestamp: new Date() });
    } else {
      // Redirect to login page with an error message
      res.redirect('/login?error=1');
    }
  }).catch((err) => {
    // Handle database error
    console.error('Error during login:', err);
    res.redirect('/login?error=1');
  });
});


// route for the signup page
app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

// Handle user signup
app.post('/signup', (req, res) => {
  const { username, firstname, lastname, password } = req.body;

  // Create a new user based on the provided schema
  const user = new User({
    username,
    firstname,
    lastname,
    password,
  });

  // Save the user to the database
  user.save()
    .then(() => {
      res.redirect('/chat');
    })
    .catch((err) => {
      // Handle validation errors
      if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map((error) => error.message);
        res.redirect(`/signup?error=${encodeURIComponent(errors.join(', '))}`);
      } else {
        console.error('Error during signup:', err);
        res.redirect('/signup?error=Unknown error occurred');
      }
    });
});




// route for the chat page
app.get('/chat', (req, res) => {
  res.sendFile(__dirname + '/public/chat.html');
});

// Add this route before the 'io.on' part in your app.js
app.get('/messages/:room', (req, res) => {
  const room = req.params.room;

  // Fetch messages for the specified room from MongoDB
  GroupMessage.find({ room })
    .sort({ date_sent: 'asc' }) // Optional: Sort messages by date
    .exec((err, messages) => {
      if (err) throw err;
      res.json(messages);
    });
});



io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join room', (room, callback) => {
    if (socket.room) {
      socket.leave(socket.room);
    }

    socket.join(room);
    socket.room = room;

    io.to(room).emit('user list', getUsersInRoom(room));

    callback();
  });

// Handle chat messages
socket.on('chat message', (msg) => {
  const groupMessage = new GroupMessage({
    from_user: socket.username,
    room: socket.room,
    message: msg,
    date_sent: new Date(),
  });
  
  // Save the message to MongoDB
  groupMessage.save().then(() => {
    // Emit the message to all clients in the room
    io.to(socket.room).emit('chat message', groupMessage);
  });
});
  
    // Handle private messages
    socket.on('private message', (msg, toUser) => {
      const privateMessage = new PrivateMessage({ from_user: socket.username, to_user: toUser, message: msg, date_sent: new Date() });
      privateMessage.save().then(() => {
        io.to(socket.id).emit('private message', privateMessage);
        io.to(users[toUser]).emit('private message', privateMessage);
      });
    });
  
    // Handle "user is typing" feature
    socket.on('typing', (room) => {
      socket.to(room).emit('typing', socket.username);
    });
  
  // Handle user disconnect
socket.on('disconnect', () => {
  if (socket.room) {
    // If the user was in a room, leave that room
    socket.leave(socket.room);

    // Emit the updated user list to all clients in the room
    io.to(socket.room).emit('user list', getUsersInRoom(socket.room));
  }
});
  
    // Function to get users in a room
    function getUsersInRoom(room) {
      const usersInRoom = [];
      const roomClients = io.sockets.adapter.rooms.get(room);
      if (roomClients) {
        roomClients.forEach((clientId) => {
          usersInRoom.push(io.sockets.sockets.get(clientId).username);
        });
      }
      return usersInRoom;
    }
  });


// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
