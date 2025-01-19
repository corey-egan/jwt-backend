const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// More detailed debug endpoint
app.get('/debug', async (req, res) => {
    try {
        const privateKey = process.env.PRIVATE_KEY;
        res.json({
            clientEmail: process.env.CLIENT_EMAIL,
            privateKeyExists: !!privateKey,
            privateKeyLength: privateKey?.length,
            privateKeyFormat: {
                hasBeginMarker: privateKey?.includes('-----BEGIN PRIVATE KEY-----'),
                hasEndMarker: privateKey?.includes('-----END PRIVATE KEY-----'),
                containsNewlines: privateKey?.includes('\\n'),
                firstChars: privateKey?.substring(0, 40),
                lastChars: privateKey?.substring(privateKey.length - 40)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rest of your code...

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