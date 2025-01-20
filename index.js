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
    let htmlContent = null;
    let plainContent = null;

    function findContent(part) {
        if (!part) return;
        
        if (part.mimeType === 'text/html' && part.body?.data) {
            htmlContent = Buffer.from(part.body.data, 'base64').toString();
        }
        if (part.mimeType === 'text/plain' && part.body?.data) {
            plainContent = Buffer.from(part.body.data, 'base64').toString();
        }
        if (part.parts) {
            part.parts.forEach(findContent);
        }
    }

    findContent(payload);
    return {
        htmlContent,
        plainContent
    };
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
        const pageSize = parseInt(req.query.pageSize) || 5;
        const pageToken = req.query.pageToken || null;

        // Get auth token (using cached if available)
        console.log('Getting auth token...');
        const token = await getAuthToken();
        console.log('Token received');

        // Fetch email list
        console.log('Making Gmail API request...');
        const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/corey.egan4@mailportio.com/messages');
        listUrl.searchParams.append('maxResults', pageSize);
        if (pageToken) {
            listUrl.searchParams.append('pageToken', pageToken);
        }

        const listResponse = await fetch(listUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 5000
        });

        console.log('List response received, status:', listResponse.status);
        const { messages, nextPageToken } = await listResponse.json();

        if (!messages) {
            console.log('No messages found');
            return res.json({ emails: [], nextPageToken: null });
        }

        console.log(`Found ${messages.length} messages, fetching details...`);

        // Fetch details in parallel with timeout and caching
        const emailDetails = await Promise.all(
            messages.map(async ({ id }) => {
                const cacheKey = `email_${id}`;
                const cachedEmail = cache.get(cacheKey);
                if (cachedEmail) {
                    console.log(`Using cached data for email ${id}`);
                    return cachedEmail;
                }

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
                    const content = parseEmailContent(emailData.payload);
                    const processedEmail = {
                        id: emailData.id,
                        threadId: emailData.threadId,
                        subject: emailData.payload.headers.find(h => h.name === 'Subject')?.value || '',
                        from: emailData.payload.headers.find(h => h.name === 'From')?.value || '',
                        date: emailData.payload.headers.find(h => h.name === 'Date')?.value || '',
                        contentType: emailData.payload.mimeType,
                        htmlContent: content.htmlContent,
                        plainContent: content.plainContent
                    };

                    cache.set(cacheKey, processedEmail, 3600);
                    return processedEmail;
                } catch (error) {
                    console.error(`Error fetching email ${id}:`, error);
                    return null;
                }
            })
        );

        console.log('All email details fetched');
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