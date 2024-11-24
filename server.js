// Import required modules
const express = require('express');
const { MongoClient,ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path'); // Required for serving static files

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
    session({
        secret: 'dataverse_secret_key', // Replace with a secure key
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
    })
);
app.use(express.json()); // To parse JSON bodies
// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Atlas connection URI
const uri = 'mongodb+srv://mim9:Mahmud2001@nosqlassignment.rpdca.mongodb.net/DataVerse?retryWrites=true&w=majority';
const dbName = 'DataVerse';
let db;

// Connect to MongoDB Atlas
MongoClient.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        console.log('Connected to MongoDB Atlas');
        db = client.db(dbName);
    })
    .catch(err => console.error('Failed to connect to MongoDB Atlas:', err));

// Routes

// Check session endpoint
app.get('/session', (req, res) => {
    if (req.session.user) {
        return res.json({
            loggedIn: true,
            user: {
                name: req.session.user.name,
                email: req.session.user.email,
                userId: req.session.user._id,
            },
        });
    }
    res.json({ loggedIn: false });
});;


// Serve register.html by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});


// User Registration
// User Registration
app.post('/register', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Input validation
    if (!name || !email || !password || password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Invalid input or passwords do not match.' });
    }

    try {
        // Check if user already exists
        const userExists = await db.collection('Users').findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user document
        const user = {
            name,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Insert user into the Users collection
        await db.collection('Users').insertOne(user);

        res.status(201).json({ success: true, message: 'User registered successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error registering user. Please try again later.' });
    }
});


// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        // Find user by email
        const user = await db.collection('Users').findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid email or password.' });
        }

        // Compare the password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid email or password.' });
        }

        // Set session and cookies
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
        };

        res.cookie('user', req.session.user, { httpOnly: true });
        return res.status(200).json({ success: true, message: 'Login successful!' }); // Respond with success message
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Invalied Credintial.' });
    }
});


// Logout endpoint
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ success: false, message: 'Error logging out.' });
        }
        res.clearCookie('user'); // Clear the user cookie
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    });
});




// POST endpoint to submit a question
app.post('/api/questions', async (req, res) => {
    try {
        const { title, description, tags, email, creationDate } = req.body;

        // Validation: Ensure all required fields are provided
        if (!title || !description || !email || !creationDate) {
            return res.status(400).json({
                success: false,
                message: 'Title, description, email, and creationDate are required',
            });
        }

        const questionsCollection = db.collection('Questions');

        // Prepare the question document
        const newQuestion = {
            Title: title,
            Body: description,
            Tags: tags || [], // Default to empty array if no tags are provided
            Email: email, // Use email instead of userId
            CreationDate: new Date(creationDate),
        };

        // Insert the new question into the collection
        await questionsCollection.insertOne(newQuestion);

        res.json({ success: true, message: 'Question posted successfully!' });
    } catch (err) {
        console.error('Error posting question:', err);
        res.status(500).json({ success: false, message: 'Failed to post question' });
    }
});

// Route to get all questions posted by the logged-in user (based on email)
app.get('/questions', async (req, res) => {
    if (!req.session.user || !req.session.user.email) {
        return res.status(401).json({ message: 'User not logged in' });
    }

    const userEmail = req.session.user.email;

    try {
        const questionsCollection = db.collection('Questions');

        // Query all questions matching the user's email
        const questions = await questionsCollection
            .find({ Email: userEmail })
            .toArray();

        res.json(questions);
    } catch (err) {
        console.error('Error retrieving questions:', err);
        res.status(500).json({ message: 'Error retrieving questions' });
    }
});





app.get('/questions/:id', async (req, res) => {
    try {
        const questionId = req.params.id;
        const question = await db.collection('Questions').findOne({ _id: new ObjectId(questionId) });
        if (!question) return res.status(404).json({ message: 'Question not found' });
        res.json(question);
    } catch (err) {
        console.error('Error fetching question:', err);
        res.status(500).json({ message: 'Error fetching question' });
    }
});



// DELETE endpoint to remove a question by ID
app.delete('/questions/:id', async (req, res) => {
    try {
        const questionId = req.params.id;
        const result = await db.collection('Questions').deleteOne({ _id: new ObjectId(questionId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }

        res.json({ message: 'Question deleted successfully' });
    } catch (err) {
        console.error('Error deleting question:', err);
        res.status(500).json({ message: 'Error deleting question' });
    }
});

// PUT endpoint to update a question
app.put('/questions/:id', async (req, res) => {
    try {
        const questionId = req.params.id;
        const { title, description, tags, creationDate } = req.body;

        // Validation: Ensure that at least title or description is provided
        if (!title && !description) {
            return res.status(400).json({ message: 'Title or description is required to update' });
        }

        const updatedData = {};
        if (title) updatedData.Title = title;
        if (description) updatedData.Body = description;
        if (tags) updatedData.Tags = tags;
        if (creationDate) updatedData.CreationDate = new Date(creationDate);

        const result = await db.collection('Questions').updateOne(
            { _id: new ObjectId(questionId) },
            { $set: updatedData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }

        res.json({ message: 'Question updated successfully' });
    } catch (err) {
        console.error('Error updating question:', err);
        res.status(500).json({ message: 'Error updating question' });
    }
});




// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
