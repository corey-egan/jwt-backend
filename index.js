const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());
app.use(express.json());

// Cache setup
const cache = new NodeCache({ 
    stdTTL: 300, // 5 minutes default TTL
    checkperiod: 320 
});

// Helper function to clean private key
function cleanPrivateKey(key) {
    return key.replace(/\\n/g, '\n').replace(/"/g, '');
}

// Helper function to parse email content
function parseEmailContent(payload) {
    function findContent(part) {
        if (!part) return null;
        if (part.body?.data) {
            return {
                type: part.mimeType,
                content: Buffer.from(part.body.data, 'base64').toString()
            };
        }
        if (part.parts) {
            return part.parts.map(findContent).filter(Boolean)[0];
        }
        return null;
    }
    
    return findContent(payload) || { type: 'unknown', content: '' };
}

// Get auth token with caching
async function getAuthToken() {
    const cachedToken = cache.get('auth_token');
    if (cachedToken) return cachedToken;

    const client = new JWT({
        email: process.env.CLIENT_EMAIL,
        key: cleanPrivateKey(process.env.PRIVATE_KEY),
        subject: 'corey.egan4@mailportio.com',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    });

    const token = await client.getAccessToken();
    cache.set('auth_token', token.token, 3300); // Cache for 55 minutes
    return token.token;
}

app.get('/emails', async (req, res) => {
    try {
        console.log('Starting email fetch...');
        
        const client = new JWT({
            email: process.env.CLIENT_EMAIL,
            key: cleanPrivateKey(process.env.PRIVATE_KEY),
            subject: 'corey.egan4@mailportio.com',
            scopes: ['https://www.googleapis.com/auth/gmail.readonly']
        });

        console.log('Getting auth token...');
        const token = await client.getAccessToken();
        console.log('Token received:', !!token);

        console.log('Making Gmail API request...');
        const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages');
        listUrl.searchParams.append('maxResults', 5); // Start with just 5 messages

        const listResponse = await fetch(listUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token.token}`,
                'Accept': 'application/json'
            },
            timeout: 10000 // Increased timeout
        });

        console.log('Response received, status:', listResponse.status);
        
        if (!listResponse.ok) {
            const errorData = await listResponse.json();
            console.error('Gmail API Error:', errorData);
            throw new Error(`Gmail API error: ${JSON.stringify(errorData)}`);
        }

        const data = await listResponse.json();
        console.log('Data received, message count:', data.messages?.length);

        // For now, just return the IDs without fetching details
        res.json({
            emails: data.messages || [],
            nextPageToken: data.nextPageToken
        });

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Failed to fetch emails',
            details: error.message,
            stack: error.stack
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.post('/create-alias', async (req, res) => {
    try {
        const { competitorName } = req.body;
        
        // Sanitize competitor name for email
        const sanitizedName = competitorName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);
            
        const aliasEmail = `corey.egan4+${sanitizedName}@mailportio.com`;
        
        res.json({ 
            success: true, 
            alias: aliasEmail
        });
    } catch (error) {
        console.error('Alias creation error:', error);
        res.status(500).json({ 
            error: 'Failed to create alias',
            details: error.message 
        });
    }
});