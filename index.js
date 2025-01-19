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
            subject: 'corey.egan4@mailportio.com',
            scopes: ['https://www.googleapis.com/auth/gmail.readonly']
        });

        const token = await client.getAccessToken();
        
        // First get list of messages
        const listResponse = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages?maxResults=10',
            {
                headers: {
                    'Authorization': `Bearer ${token.token}`
                }
            }
        );

        const { messages } = await listResponse.json();

        // Helper function to decode email body
        function decodeBody(payload) {
            if (payload.body.data) {
                return Buffer.from(payload.body.data, 'base64').toString();
            }
            
            // If the message is multipart, recursively get all parts
            if (payload.parts) {
                return payload.parts.map(part => {
                    if (part.body.data) {
                        return Buffer.from(part.body.data, 'base64').toString();
                    }
                    if (part.parts) {
                        return decodeBody(part);
                    }
                    return '';
                }).join('\n');
            }
            
            return '';
        }

        function parseEmailContent(payload) {
            function findContent(part) {
                if (part.mimeType === 'text/html') {
                    return {
                        type: 'html',
                        content: Buffer.from(part.body.data, 'base64').toString()
                    };
                }
                if (part.mimeType === 'text/plain') {
                    return {
                        type: 'plain',
                        content: Buffer.from(part.body.data, 'base64').toString()
                    };
                }
                if (part.parts) {
                    return part.parts.map(findContent).filter(Boolean)[0];
                }
                return null;
            }
            
            return findContent(payload) || {
                type: 'unknown',
                content: ''
            };
        }

        // Get full details for each message
        const emailDetails = await Promise.all(
            messages.map(async ({ id }) => {
                const detailResponse = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages/${id}?format=full`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token.token}`
                        }
                    }
                );
                return detailResponse.json();
            })
        );

        res.json({
            emails: emailDetails.map(email => ({
                id: email.id,
                threadId: email.threadId,
                subject: email.payload.headers.find(h => h.name === 'Subject')?.value || '',
                from: email.payload.headers.find(h => h.name === 'From')?.value || '',
                date: email.payload.headers.find(h => h.name === 'Date')?.value || '',
                contentType: email.payload.mimeType,
                ...parseEmailContent(email.payload)
            }))
        });
    } catch (error) {
        console.error('Email fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch emails',
            details: error.message 
        });
    }
});