const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');
const { fetch } = require('cross-fetch'); 

const app = express();
app.use(cors());
app.use(express.json());

// Function to clean private key
function cleanPrivateKey(key) {
    return key
        .replace(/\\n/g, '\n')  // Replace double escaped newlines with single
        .replace(/"/g, '');     // Remove any quotes
}

app.get('/debug', async (req, res) => {
    try {
        const rawKey = process.env.PRIVATE_KEY;
        const cleanedKey = cleanPrivateKey(rawKey);
        res.json({
            clientEmail: process.env.CLIENT_EMAIL,
            rawKeyLength: rawKey?.length,
            cleanedKeyLength: cleanedKey?.length,
            cleanedKeyFormat: {
                hasBeginMarker: cleanedKey?.includes('-----BEGIN PRIVATE KEY-----'),
                hasEndMarker: cleanedKey?.includes('-----END PRIVATE KEY-----'),
                firstChars: cleanedKey?.substring(0, 40),
                lastChars: cleanedKey?.substring(cleanedKey.length - 40)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/token', async (req, res) => {
    try {
        const client = new JWT({
            email: process.env.CLIENT_EMAIL,
            key: cleanPrivateKey(process.env.PRIVATE_KEY),
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

// Add this to your existing index.js
app.get('/emails', async (req, res) => {
    try {
        const client = new JWT({
            email: process.env.CLIENT_EMAIL,
            key: cleanPrivateKey(process.env.PRIVATE_KEY),
            scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
            subject: 'corey.egan4@mailportio.com' // Add this line - use your workspace email
        });

        // Get authentication token
        const token = await client.getAccessToken();
        
        // Make Gmail API request - specify user email in the URL
        const response = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages?maxResults=10',
            {
                headers: {
                    'Authorization': `Bearer ${token.token}`
                }
            }
        );

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Email fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch emails',
            details: error.message 
        });
    }
});