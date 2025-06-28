// server.js
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const xml2js = require('xml2js');
const querystring = require('querystring');
const crypto = require('crypto');
// Mevcut require çağrınız burada, tekrar eklemeye gerek yok.
const botManager = require('./modules/backgroundBotManager.js');
const { getTumblrAppConfig, makeTumblrApiRequest } = require('./modules/serverUtils.js');
const userInfoHandler = require('./modules/userInfoHandler.js');
const userLimitsHandler = require('./modules/userLimitsHandler.js');
const tokenRefresher = require('./modules/tokenRefresher'); // Import tokenRefresher

const PORT = 3000;
const HOSTNAME = 'localhost';
const TOKEN_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

const USERS_PATH = path.join(__dirname, 'users.xml');
const LOGIN_PAGE_PATH = path.join(__dirname, 'login.html');
const INDEX_PAGE_PATH = path.join(__dirname, 'index.html');
const MODULES_XML_PATH = path.join(__dirname, 'modules/modules.xml');
const MODULES_STATIC_PATH_PREFIX = '/modules/';

const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
const builder = new xml2js.Builder();
const sessions = {};
const loadedActions = {};

async function readUsersXml() {
    console.log("[Server User] Reading users.xml...");
    try {
        const data = await fs.readFile(USERS_PATH, 'utf-8');
        const result = await parser.parseStringPromise(data);
        console.log("[Server User] users.xml parsed successfully.");
        return result;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn("[Server User] users.xml not found, returning empty structure.");
            return { users: { user: [] } };
        }
        console.error(`[Server User] Error reading XML file ${USERS_PATH}:`, error);
        throw error;
    }
}
async function getUsers() {
    const usersObject = await readUsersXml();
    if (usersObject.users && usersObject.users.user) {
        return Array.isArray(usersObject.users.user) ? usersObject.users.user : [usersObject.users.user];
    }
    return [];
}
async function writeUsersXmlFile(jsObject) {
    try {
        const xmlData = builder.buildObject(jsObject);
        await fs.writeFile(USERS_PATH, xmlData, 'utf-8');
        console.log("[Server User] users.xml successfully written (from server.js).");
    } catch (error) {
        console.error(`[Server User] Error writing XML file ${USERS_PATH} (from server.js):`, error);
        throw error;
    }
}
async function saveOrUpdateUser(userData) {
    console.log("[Server User] Attempting to save/update user (from server.js):", userData.tumblrUserId);
    let users = await getUsers();
    const existingUserIndex = users.findIndex(u => u.tumblrUserId === userData.tumblrUserId);
    let finalAppUsername = userData.appUsername;

    if (existingUserIndex > -1) {
        finalAppUsername = users[existingUserIndex].appUsername; // Preserve existing appUsername
        users[existingUserIndex] = { ...users[existingUserIndex], ...userData, appUsername: finalAppUsername };
        console.log(`[Server User] User ${userData.tumblrUserId} updated. Kept appUsername: ${finalAppUsername}.`);
    } else {
        users.push({...userData, appUsername: finalAppUsername}); // appUsername is already generated for new users
        console.log(`[Server User] New user ${userData.tumblrUserId} added. appUsername: ${finalAppUsername}.`);
    }
    await writeUsersXmlFile({ users: { user: users } });
    return {...userData, appUsername: finalAppUsername}; // Return the potentially updated appUsername
}

async function loadActionsFromXml() {
    console.log("[Server Actions] Loading actions from modules.xml...");
    try {
        const modulesXmlData = await fs.readFile(MODULES_XML_PATH, 'utf-8');
        const parsedXml = await parser.parseStringPromise(modulesXmlData);
        console.log("[Server Actions] modules.xml parsed.");

        if (parsedXml.modulesConfig && parsedXml.modulesConfig.modules && parsedXml.modulesConfig.modules.module) {
            const modules = Array.isArray(parsedXml.modulesConfig.modules.module)
                            ? parsedXml.modulesConfig.modules.module
                            : [parsedXml.modulesConfig.modules.module];

            for (const moduleConfig of modules) {
                if (moduleConfig.id && moduleConfig.displayName) {
                    loadedActions[moduleConfig.id] = { config: moduleConfig, handler: null };
                    console.log(`[Server Actions] Module definition '${moduleConfig.id}' (type: ${moduleConfig.type || 'unknown'}) registered.`);

                    if (moduleConfig.type === 'apiAction' && moduleConfig.script && moduleConfig.handlerFunction) {
                        console.log(`[Server Actions] Attempting to load handler for API action '${moduleConfig.id}': ${moduleConfig.script} -> ${moduleConfig.handlerFunction}`);
                        try {
                            const scriptPath = path.join(__dirname, 'modules', moduleConfig.script);
                            await fs.access(scriptPath); // Check if file exists
                            delete require.cache[require.resolve(scriptPath)]; // Clear cache for hot-reloading if needed
                            const handlerModule = require(scriptPath);
                            if (handlerModule && typeof handlerModule[moduleConfig.handlerFunction] === 'function') {
                                loadedActions[moduleConfig.id].handler = handlerModule[moduleConfig.handlerFunction];
                                console.log(`  -> SUCCESS: API Action handler '${moduleConfig.handlerFunction}' from '${moduleConfig.script}' linked for action '${moduleConfig.id}'.`);
                            } else {
                                console.error(`  -> ERROR: Handler function '${moduleConfig.handlerFunction}' NOT FOUND or NOT A FUNCTION in script '${moduleConfig.script}' (for API action '${moduleConfig.id}'). Check exports in the script.`);
                            }
                        } catch (e) {
                            console.error(`  -> ERROR: loading script '${moduleConfig.script}' for API action '${moduleConfig.id}':`, e.message, e.stack);
                        }
                    }
                } else {
                    console.warn("[Server Actions] Skipping module definition due to missing id or displayName:", moduleConfig);
                }
            }
        } else { console.warn("[Server Actions] No valid module definitions found in modules.xml."); }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`[Server Actions] CRITICAL: ${MODULES_XML_PATH} not found. No dynamic actions will be loaded.`);
        } else {
            console.error("[Server Actions] Error loading actions from modules.xml:", error);
        }
    }
}

// --- HTTP Server Logic (Mostly unchanged, ensure correct error propagation) ---
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${HOSTNAME}:${PORT}`);
    const pathname = parsedUrl.pathname;
    const queryParams = parsedUrl.searchParams;
    const requestLogId = crypto.randomBytes(4).toString('hex');

    console.log(`[HTTP-${requestLogId}] Request START: ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
    
    try {
        let sessionId = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionId='))?.split('=')[1];
        if (!sessionId || !sessions[sessionId]) {
            sessionId = crypto.randomBytes(16).toString('hex');
            sessions[sessionId] = {}; // Initialize session object
            res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
            console.log(`[HTTP-${requestLogId}] New session created: ${sessionId}`);
        }
        const currentSession = sessions[sessionId];

        // Static File Serving
        if (pathname === '/' || pathname === '/index.html') {
            const content = await fs.readFile(INDEX_PAGE_PATH, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        } else if (pathname === '/login.html') {
             const content = await fs.readFile(LOGIN_PAGE_PATH, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        } else if (pathname.startsWith(MODULES_STATIC_PATH_PREFIX)) {
            const requestedFile = pathname.substring(MODULES_STATIC_PATH_PREFIX.length);
            const safeRequestedFile = path.normalize(requestedFile).replace(/^(\.\.[\/\\])+/, ''); // Prevent directory traversal
            const filePath = path.join(__dirname, 'modules', safeRequestedFile);

            // Security check: Ensure the resolved path is still within the 'modules' directory
            if (!filePath.startsWith(path.join(__dirname, 'modules'))) {
                console.warn(`[HTTP-${requestLogId}] Forbidden access attempt to: ${filePath}`);
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
            } else {
                try {
                    console.log(`[HTTP-${requestLogId}] Serving static module file: ${filePath}`);
                    const content = await fs.readFile(filePath, 'utf-8');
                    let contentType = 'text/plain; charset=utf-8';
                    if (filePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
                    else if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
                    else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content);
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        console.warn(`[HTTP-${requestLogId}] Static module file not found: ${filePath}`);
                        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`File not found in modules: ${safeRequestedFile}`);
                    } else {
                        console.error(`[HTTP-${requestLogId}] Error loading static module file ${filePath}:`, err);
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Error loading file from modules.');
                    }
                }
            }
        // OAuth Endpoints
        } else if (pathname === '/auth/tumblr/initiate' && req.method === 'GET') {
            console.log(`[Auth-${requestLogId}] Handling /auth/tumblr/initiate`);
            const config = await getTumblrAppConfig();
            const state = crypto.randomBytes(16).toString('hex');
            currentSession.oauthState = state; // Save state to session
            console.log(`[Auth-${requestLogId}] oauthState '${state}' saved to session '${sessionId}'.`);
            const authorizationUrl = `https://www.tumblr.com/oauth2/authorize?client_id=${config.oauthConsumerKey}&response_type=code&scope=basic%20write%20offline_access&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`;
            console.log(`[Auth-${requestLogId}] Redirecting to Tumblr for auth: ${authorizationUrl}`);
            res.writeHead(302, { 'Location': authorizationUrl });
            res.end();
        } else if (pathname === '/auth/tumblr/callback' && req.method === 'GET') {
            console.log(`[Auth Callback-${requestLogId}] Handling /auth/tumblr/callback. Query:`, queryParams.toString());
            const code = queryParams.get('code');
            const state = queryParams.get('state');

            console.log(`[Auth Callback-${requestLogId}] Received state: ${state}, Session state from session '${sessionId}': ${currentSession.oauthState}`);
            if (!currentSession.oauthState) { // Check if state exists in session
                console.warn(`[Auth Callback-${requestLogId}] No OAuth state found in session. Session ID:`, sessionId);
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end("Session expired or invalid. Please try logging in again.");
                return;
            }
            if (state !== currentSession.oauthState) {
                console.warn(`[Auth Callback-${requestLogId}] Invalid state parameter. Received:`, state, "Expected:", currentSession.oauthState);
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end("Invalid state parameter (CSRF protection).");
                delete currentSession.oauthState; // Clean up state
                return;
            }
            delete currentSession.oauthState; // State validated, remove from session
            console.log(`[Auth Callback-${requestLogId}] State validated and removed from session.`);

            if (!code) {
                console.warn(`[Auth Callback-${requestLogId}] Authorization code not found in callback query.`);
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end("Authorization code not found."); return;
            }

            const config = await getTumblrAppConfig();
            const tokenRequestBody = querystring.stringify({
                grant_type: 'authorization_code', code: code,
                client_id: config.oauthConsumerKey, client_secret: config.oauthConsumerSecret,
                redirect_uri: config.redirectUri
            });
            console.log(`[Auth Callback-${requestLogId}] Requesting access token with body (secret redacted):`, tokenRequestBody.replace(config.oauthConsumerSecret, 'CLIENT_SECRET_REDACTED'));

            const tokenRequestOptions = {
                hostname: 'api.tumblr.com', path: '/v2/oauth2/token', method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenRequestBody), 'User-Agent': 'TumblrAppLocalhost/1.0' }
            };

            const tokenReq = https.request(tokenRequestOptions, (tokenRes) => {
                let tokenData = '';
                tokenRes.on('data', (chunk) => tokenData += chunk);
                tokenRes.on('end', async () => {
                    console.log(`[Auth Callback-${requestLogId}] Token exchange response. Status: ${tokenRes.statusCode}. Raw Body: "${tokenData}"`);
                    if (tokenRes.statusCode !== 200) {
                        console.error(`[Auth Callback-${requestLogId}] Token exchange failed. Status:`, tokenRes.statusCode, 'Body:', tokenData);
                        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        if (!res.writableEnded) res.end(`Token exchange failed. Status: ${tokenRes.statusCode}. Response: ${tokenData}`);
                        return;
                    }
                    try {
                        const tokenResult = JSON.parse(tokenData);
                        const { access_token, refresh_token, expires_in } = tokenResult;
                        console.log(`[Auth Callback-${requestLogId}] Token exchange successful. Parsed result (tokens redacted):`, { 
                            ...tokenResult, 
                            access_token: access_token ? access_token.substring(0,5)+'...' : 'MISSING',
                            refresh_token: refresh_token ? refresh_token.substring(0,5)+'...' : 'MISSING/NOT_APPLICABLE'
                        });

                        if (!access_token) { throw new Error("Access token not received from Tumblr in parsed JSON."); }
                        
                        const userInfoResponse = await makeTumblrApiRequest('GET', '/user/info', access_token, null, false, null, null); // appUsername not needed here
                        console.log(`[Auth Callback-${requestLogId}] User info response from Tumblr:`, JSON.stringify(userInfoResponse, null, 2));

                        if (!userInfoResponse || !userInfoResponse.user || !userInfoResponse.user.name) {
                            throw new Error("Failed to retrieve user details from /user/info or response was malformed.");
                        }
                        const tumblrUser = userInfoResponse.user;
                        const primaryBlog = tumblrUser.blogs.find(blog => blog.primary === true) || tumblrUser.blogs[0]; // Fallback to first blog
                        if (!primaryBlog || !primaryBlog.name) {
                            throw new Error("Primary blog not found or name is missing for user: " + tumblrUser.name);
                        }
                        
                        // Generate a unique appUsername if it's a new user or being re-authenticated
                        const tempAppUsername = `${tumblrUser.name}_${crypto.randomBytes(4).toString('hex')}`;
                        const newUserRecordData = {
                            tumblrUserId: tumblrUser.name, 
                            tumblrBlogId: primaryBlog.name,
                            tumblrBlogName: primaryBlog.title, // Use primary blog's title
                            tumblrBlogUrl: primaryBlog.url,   // Use primary blog's URL
                            accessToken: access_token,
                            refreshToken: refresh_token,
                            tokenExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
                            registrationDate: new Date().toISOString(),
                            lastTokenRefresh: new Date().toISOString() 
                            // appUsername will be handled by saveOrUpdateUser
                        };
                        const savedUser = await saveOrUpdateUser({...newUserRecordData, appUsername: tempAppUsername });
                        
                        if (!res.headersSent) res.writeHead(302, { 'Location': `/index.html?login_success=true&new_user=${encodeURIComponent(savedUser.appUsername)}` });
                        if (!res.writableEnded) res.end();

                    } catch (apiError) {
                        console.error(`[Auth Callback-${requestLogId}] Error after token exchange:`, apiError.message, apiError.stack, apiError.details);
                        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        if (!res.writableEnded) res.end(`Error processing user information: ${apiError.message}`);
                    }
                });
            });
            tokenReq.on('error', (e) => {
                console.error(`[Auth Callback-${requestLogId}] Problem with token request itself:`, e);
                if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                if (!res.writableEnded) res.end("Failed to request token from Tumblr.");
            });
            tokenReq.write(tokenRequestBody);
            tokenReq.end();
        
        // API Endpoints
        } else if (pathname === '/api/users' && req.method === 'GET') {
            console.log(`[API-${requestLogId}] Handling /api/users request.`);
            try {
                const users = await getUsers();
                const userListForClient = users.map(u => ({ appUsername: u.appUsername, tumblrBlogName: u.tumblrBlogName || u.tumblrBlogId || u.tumblrUserId }));
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(userListForClient));
            } catch (error) {
                console.error(`[API-${requestLogId}] Error in /api/users:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "Could not fetch user list." }));
            }
        } else if (pathname === '/api/tumblr-data' && req.method === 'GET') {
            const appUserToFetch = queryParams.get('user');
            console.log(`[API-${requestLogId}] Handling /api/tumblr-data request for user: ${appUserToFetch}`);
            if (!appUserToFetch) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "User appUsername not specified." })); return;
            }
            try {
                const users = await getUsers();
                const targetUser = users.find(u => u.appUsername === appUserToFetch);
                if (!targetUser || !targetUser.accessToken || !targetUser.tumblrBlogId) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: "User not found, or token/blogId missing." })); return;
                }
                const userData = await userInfoHandler.getAuthenticatedUserData(targetUser.accessToken, targetUser.tumblrBlogId, appUserToFetch);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(userData));
            } catch (error) {
                console.error(`[API-${requestLogId}] Error in /api/tumblr-data for ${appUserToFetch}:`, error);
                res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ 
                    error: error.message || "Failed to fetch user data.", 
                    details: error.details || error.toString(),
                    needsReAuth: error.needsReAuth || false 
                }));
            }
        } else if (pathname === '/api/list-actions' && req.method === 'GET') {
            console.log(`[API-${requestLogId}] Handling /api/list-actions request.`);
            try {
                // Ensure actions are loaded if they haven't been already (e.g. on first call)
                if (Object.keys(loadedActions).length === 0) {
                    console.warn(`[API-${requestLogId}] /api/list-actions: No actions loaded. Attempting to reload.`);
                    await loadActionsFromXml(); 
                }
                const actionList = Object.values(loadedActions).map(actionDetails => ({
                    id: actionDetails.config.id,
                    displayName: actionDetails.config.displayName,
                    description: actionDetails.config.description,
                    type: actionDetails.config.type,
                    targetPage: actionDetails.config.targetPage,
                    params: actionDetails.config.params,
                    authenticationType: actionDetails.config.authenticationType
                }));
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(actionList));
            } catch (error) {
                console.error(`[API-${requestLogId}] Error in /api/list-actions:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "Eylemler listelenemedi." }));
            }
        } else if (pathname === '/api/get-external-blog-info' && req.method === 'GET') {
            const blogIdentifier = queryParams.get('blog_identifier');
            console.log(`[API-${requestLogId}] Handling /api/get-external-blog-info for: ${blogIdentifier}`);
            const actionId = 'fetchExternalBlogInfoApi'; // Ensure this matches modules.xml
            if (!blogIdentifier) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ error: "blog_identifier parametresi eksik." }));
            }
            if (!loadedActions[actionId] || !loadedActions[actionId].handler) {
                 console.error(`[API-${requestLogId}] /api/get-external-blog-info: Action '${actionId}' or its handler not loaded. Loaded actions:`, Object.keys(loadedActions));
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ error: `Eylem '${actionId}' bulunamadı veya çalıştırılabilir değil.` }));
            }
            try {
                const result = await loadedActions[actionId].handler({ blog_identifier: blogIdentifier }); // Pass params correctly
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(result));
            } catch (error) {
                console.error(`[API-${requestLogId}] Error in /api/get-external-blog-info (executing action '${actionId}') for ${blogIdentifier}:`, error);
                res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: error.message || "Blog bilgileri alınamadı.", details: error.details }));
            }
        } else if (pathname === '/api/execute-action' && req.method === 'POST') {
            console.log(`[API-${requestLogId}] Handling /api/execute-action POST request.`);
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                console.log(`[API-${requestLogId}] /api/execute-action: Received body:`, body);
                let actionIdFromBody = 'unknown_action_in_body'; 
                try {
                    if (!body) { throw new Error("İstek gövdesi boş."); }
                    const parsedBody = JSON.parse(body);
                    actionIdFromBody = parsedBody.actionId || actionIdFromBody;
                    const { actionId, params, appUsername } = parsedBody;

                    if (!actionId || !loadedActions[actionId]) { throw { statusCode: 404, message: "Belirtilen eylem bulunamadı." }; }
                    const actionDetails = loadedActions[actionId];
                    if (actionDetails.config.type !== 'apiAction' || !actionDetails.handler) {
                        throw { statusCode: 400, message: `Eylem '${actionId}' çalıştırılabilir bir API eylemi değil.` };
                    }

                    let executionArgs = [params]; 
                    let userAccessToken = null;

                    if (actionDetails.config.authenticationType === 'userToken') {
                        if (!appUsername) { throw { statusCode: 400, message: "Bu eylem için kullanıcı girişi (appUsername) gereklidir." }; }
                        const users = await getUsers();
                        const targetUser = users.find(u => u.appUsername === appUsername);
                        if (!targetUser || !targetUser.accessToken) {
                            throw { statusCode: 401, message: "Geçerli kullanıcı token'ı bulunamadı.", needsReAuth: true };
                        }
                        userAccessToken = targetUser.accessToken;
                        executionArgs.push(userAccessToken); 
                        executionArgs.push(appUsername);     

                        if (actionDetails.config.needsBlogId === 'true' && targetUser.tumblrBlogId) {
                            executionArgs.push(targetUser.tumblrBlogId);
                        }
                    }
                    
                    const result = await actionDetails.handler(...executionArgs);
                    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    if (!res.writableEnded) res.end(JSON.stringify({ success: true, data: result }));

                } catch (error) {
                    console.error(`[API-${requestLogId}] Error executing action '${actionIdFromBody}':`, error);
                    if (!res.headersSent) res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
                    if (!res.writableEnded) res.end(JSON.stringify({ 
                        error: error.message || "Eylem hatası.", 
                        details: error.details,
                        needsReAuth: error.needsReAuth || false 
                    }));
                }
            });
        } else if (pathname === '/api/user-limits' && req.method === 'GET') {
            const appUserToFetch = queryParams.get('user');
            console.log(`[API-${requestLogId}] Handling /api/user-limits GET request for user: ${appUserToFetch}`);
            if (!appUserToFetch) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "User appUsername not specified for limits." }));
                return;
            }
            try {
                const users = await getUsers();
                const targetUser = users.find(u => u.appUsername === appUserToFetch);
                if (!targetUser || !targetUser.accessToken) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: "User not found or token missing for limits." }));
                    return;
                }
                const limitsData = await userLimitsHandler.fetchUserLimits({}, targetUser.accessToken, appUserToFetch);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(limitsData));

            } catch (error) {
                console.error(`[API-${requestLogId}] Error in /api/user-limits for ${appUserToFetch}:`, error);
                const statusCode = error.statusCode || 500;
                res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ 
                    error: error.message || "Failed to fetch user limits.", 
                    details: error.details || error.toString(),
                    needsReAuth: error.needsReAuth || false
                }));
            }
        // YENİ EKLENEN KOD BLOKLARI BAŞLANGICI
        } else if (pathname === '/api/bots/dashboard-liker/start' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const { appUsername, userLikeLimit, refreshIntervalMs } = JSON.parse(body);
                    const users = await getUsers();
                    const targetUser = users.find(u => u.appUsername === appUsername);
                    if (!targetUser) throw new Error('Kullanıcı bulunamadı.');
    
                    // Bot yöneticisine başlangıç parametrelerini iletiyoruz
                    const result = botManager.startBot(appUsername, {
                        appUsername,
                        accessToken: targetUser.accessToken,
                        userLikeLimit,
                        refreshIntervalMs
                    });
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
    
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: error.message }));
                }
            });
    
        } else if (pathname === '/api/bots/dashboard-liker/stop' && req.method === 'POST') {
             let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                const { appUsername } = JSON.parse(body);
                const result = botManager.stopBot(appUsername);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            });
    
        } else if (pathname === '/api/bots/dashboard-liker/status' && req.method === 'GET') {
            const appUserToFetch = queryParams.get('user');
            const result = botManager.getBotStatus(appUserToFetch);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        // YENİ EKLENEN KOD BLOKLARI SONU
        } else {
            console.warn(`[HTTP-${requestLogId}] 404 Not Found for: ${req.method} ${req.url}`);
            if (!res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            if (!res.writableEnded) {
                res.end('Not Found');
            }
        }
    } catch (serverError) {
        console.error(`[HTTP-${requestLogId}] GLOBAL Unhandled server error for ${req.method} ${req.url}:`, serverError.stack);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        if (!res.writableEnded) {
            res.end('Internal Server Error');
        }
    } finally {
        console.log(`[HTTP-${requestLogId}] Request END (in finally): ${req.method} ${req.url} with status ${res.statusCode}`);
    }
});

async function periodicallyRefreshAllUserTokens() {
    console.log('[Server Token Auto-Refresh] Starting periodic token refresh for all users...');
    try {
        const users = await getUsers(); // Use the getUsers from server.js
        if (users.length === 0) {
            console.log('[Server Token Auto-Refresh] No users found to refresh.');
            return;
        }
        for (const user of users) {
            if (user.appUsername && user.refreshToken) {
                console.log(`[Server Token Auto-Refresh] Attempting to refresh token for user: ${user.appUsername}`);
                try {
                    await tokenRefresher.refreshTokenForUser(user.appUsername);
                    console.log(`[Server Token Auto-Refresh] Successfully refreshed token for user: ${user.appUsername}`);
                } catch (refreshError) {
                    console.error(`[Server Token Auto-Refresh] Failed to refresh token for user ${user.appUsername}:`, refreshError.message || refreshError);
                    if (refreshError.needsReAuth) {
                        console.warn(`[Server Token Auto-Refresh] User ${user.appUsername} requires re-authentication.`);
                    }
                }
            } else {
                console.log(`[Server Token Auto-Refresh] Skipping user ${user.tumblrUserId || 'UnknownID'} due to missing appUsername or refreshToken.`);
            }
        }
    } catch (error) {
        console.error('[Server Token Auto-Refresh] Error fetching users for periodic token refresh:', error);
    }
    console.log('[Server Token Auto-Refresh] Periodic token refresh cycle finished.');
}


loadActionsFromXml().then(() => {
    server.listen(PORT, HOSTNAME, () => {
        console.log(`[Server] Server running at http://${HOSTNAME}:${PORT}/`);
        console.log('[Server] Module definitions and API action handlers loaded. Check console for details.');
        console.log('[Server] Ensure config.xml, users.xml, and modules/modules.xml exist.');
        
        // Start periodic token refresh
        console.log(`[Server] Setting up periodic token refresh every ${TOKEN_REFRESH_INTERVAL / 60000} minutes.`);
        setInterval(periodicallyRefreshAllUserTokens, TOKEN_REFRESH_INTERVAL);
        // Optionally, run it once on startup after a short delay
        setTimeout(periodicallyRefreshAllUserTokens, 5000); // Run once 5 seconds after start
    });
}).catch(error => {
    console.error("[Server] CRITICAL: Failed to initialize server due to error loading module definitions:", error);
    process.exit(1); 
});
