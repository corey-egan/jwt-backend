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
        const pageSize = parseInt(req.query.pageSize) || 5;
        const pageToken = req.query.pageToken || null;
        
        // Get auth token
        const token = await getAuthToken();

        // Fetch email list
        const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages');
        listUrl.searchParams.append('maxResults', pageSize);
        if (pageToken) {
            listUrl.searchParams.append('pageToken', pageToken);
        }

        const listResponse = await fetch(listUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 5000
        });

        const { messages, nextPageToken } = await listResponse.json();

        if (!messages) {
            return res.json({ emails: [], nextPageToken: null });
        }

        // Fetch details in parallel with timeout and error handling
        const emailDetails = await Promise.all(
            messages.map(async ({ id }) => {
                const cacheKey = `email_${id}`;
                const cachedEmail = cache.get(cacheKey);
                if (cachedEmail) return cachedEmail;

                try {
                    const detailResponse = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages/${id}?format=full`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            timeout: 5000
                        }
                    );

                    const emailData = await detailResponse.json();
                    const processedEmail = {
                        id: emailData.id,
                        threadId: emailData.threadId,
                        subject: emailData.payload.headers.find(h => h.name === 'Subject')?.value || '',
                        from: emailData.payload.headers.find(h => h.name === 'From')?.value || '',
                        date: emailData.payload.headers.find(h => h.name === 'Date')?.value || '',
                        contentType: emailData.payload.mimeType,
                        ...parseEmailContent(emailData.payload)
                    };

                    // Cache individual email data
                    cache.set(cacheKey, processedEmail, 3600); // Cache for 1 hour
                    return processedEmail;
                } catch (error) {
                    console.error(`Error fetching email ${id}:`, error);
                    return null;
                }
            })
        );

        // Filter out failed fetches and return
        res.json({
            emails: emailDetails.filter(Boolean),
            nextPageToken
        });

    } catch (error) {
        console.error('Email fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch emails',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});