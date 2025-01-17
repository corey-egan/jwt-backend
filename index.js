const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Add debug endpoint
app.get('/debug', async (req, res) => {
    try {
        res.json({
            clientEmail: process.env.CLIENT_EMAIL,
            privateKeyExists: !!process.env.PRIVATE_KEY,
            privateKeyStart: process.env.PRIVATE_KEY?.substring(0, 27),
            privateKeyEnd: process.env.PRIVATE_KEY?.substring(process.env.PRIVATE_KEY.length - 25)
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/token', async (req, res) => {
    try {
        const client = new JWT({
            email: process.env.CLIENT_EMAIL,
            key: process.env.PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        });

        const token = await client.getAccessToken();
        res.json({ access_token: token.token });
    } catch (error) {
        console.error('Token error:', error);
        res.status(500).json({ 
            error: 'Failed to get access token',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});