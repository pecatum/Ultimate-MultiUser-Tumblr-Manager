// modules/serverUtils.js
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const https = require('https');
const querystring = require('querystring');

// YENİ: Token yenileyiciyi ve kullanıcı XML'i okuma/yazma fonksiyonlarını import et
// Bu, tokenRefresher.js'deki XML fonksiyonlarının merkezi bir yere taşınması gerektiğini varsayar.
// Şimdilik, tokenRefresher'ı doğrudan çağıracağız ve appUsername'i alacağız.
const tokenRefresher = require('./tokenRefresher'); // tokenRefresher.js'nin var olduğunu varsayıyoruz
const { getUsersInternal, writeUsersXmlInternal } = require('./tokenRefresher'); // tokenRefresher'daki XML fonksiyonlarını kullanmak için (idealde ayrı bir util'de olmalı)


const CONFIG_PATH = path.join(__dirname, '../config.xml');
const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

async function readXmlFile(filePath) {
    // ... (içerik aynı kalacak)
    console.log(`[ServerUtils] Reading XML file: ${filePath}`);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const result = await parser.parseStringPromise(data);
        console.log(`[ServerUtils] Successfully read and parsed XML file: ${filePath}`);
        return result;
    } catch (error) {
        console.error(`[ServerUtils] Error reading XML file ${filePath}:`, error);
        throw error;
    }
}

async function getTumblrAppConfig() {
    // ... (içerik aynı kalacak)
    console.log("[ServerUtils] Getting Tumblr App Config...");
    try {
        const configObject = await readXmlFile(CONFIG_PATH);
        if (!configObject || !configObject.configuration || !configObject.configuration.tumblrApp ||
            !configObject.configuration.tumblrApp.oauthConsumerKey ||
            !configObject.configuration.tumblrApp.oauthConsumerSecret ||
            !configObject.configuration.tumblrApp.redirectUri) {
            const errorMsg = '[ServerUtils] Invalid config.xml structure. Expected configuration -> tumblrApp -> oauthConsumerKey, oauthConsumerSecret, redirectUri.';
            console.error(errorMsg, 'Current config:', JSON.stringify(configObject));
            throw new Error(errorMsg);
        }
        const appConfig = configObject.configuration.tumblrApp;
        if (typeof appConfig.oauthConsumerKey !== 'string' ||
            typeof appConfig.oauthConsumerSecret !== 'string' ||
            typeof appConfig.redirectUri !== 'string' ||
            appConfig.oauthConsumerKey.trim() === '' ||
            appConfig.oauthConsumerSecret.trim() === '' ||
            appConfig.redirectUri.trim() === '') {
            const errorMsg = "[ServerUtils] One or more OAuth config values are missing, empty, or not strings in config.xml.";
            console.error(errorMsg, "Values:", appConfig);
            throw new Error(errorMsg);
        }
        console.log("[ServerUtils] Tumblr App Config loaded successfully:", {
            oauthConsumerKey: appConfig.oauthConsumerKey ? appConfig.oauthConsumerKey.substring(0,5) + '...' : 'MISSING',
            redirectUri: appConfig.redirectUri
        });
        return appConfig;
    } catch (configError) {
        console.error("[ServerUtils] Error in getTumblrAppConfig:", configError.message);
        throw configError;
    }
}

// appUsername parametresi eklendi, sadece accessToken ile yapılan çağrılarda token yenileme için kullanılır.
// retryAttempt parametresi sonsuz döngüyü engellemek için eklendi.
async function makeTumblrApiRequest(method, apiPath, accessToken, postData = null, isApiKeyCall = false, apiKey = null, appUsername = null, retryAttempt = 0) {
    const logPrefix = `[ServerUtils${appUsername ? `-${appUsername}` : ''}${retryAttempt > 0 ? `-R${retryAttempt}` : ''}]`;
    console.log(`${logPrefix} Preparing Tumblr API Request:`, JSON.stringify({ method, apiPath, hasAccessToken: !!accessToken, isApiKeyCall, hasApiKey: !!apiKey }));

    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'TumblrAppLocalhost/1.0'
    };

    let finalApiPath = apiPath;
    let currentAccessToken = accessToken; // Yenilenmiş token'ı tutmak için

    if (isApiKeyCall && apiKey) {
        if (typeof apiKey !== 'string' || apiKey.trim() === '') {
            const errorMsg = `${logPrefix} API key is invalid for API key call.`;
            console.error(errorMsg);
            return Promise.reject({ statusCode: 400, message: "Invalid API key provided."});
        }
        const separator = finalApiPath.includes('?') ? '&' : '?';
        finalApiPath = `${finalApiPath}${separator}api_key=${apiKey}`;
        console.log(`${logPrefix} API Key call. Final path for request: ${finalApiPath}`);
    } else if (currentAccessToken) {
        if (typeof currentAccessToken !== 'string' || currentAccessToken.trim() === '') {
            const errorMsg = `${logPrefix} Access token is invalid.`;
            console.error(errorMsg);
            return Promise.reject({ statusCode: 401, message: "Invalid access token provided."});
        }
        headers['Authorization'] = `Bearer ${currentAccessToken}`;
        console.log(`${logPrefix} Authenticated call with token (first 10 chars): ${currentAccessToken.substring(0,10)}...`);
    } else if (isApiKeyCall && !apiKey) { // isApiKeyCall true ama apiKey yoksa
        const errorMsg = `${logPrefix} isApiKeyCall is true, but no apiKey provided.`;
        console.error(errorMsg);
        return Promise.reject({ statusCode: 400, message: "API key call attempted without providing an API key."});
    }
    // Eğer accessToken yok ve isApiKeyCall da false ise, bu public bir endpoint olabilir, header'a bir şey eklenmez.

    const options = {
        hostname: 'api.tumblr.com',
        path: `/v2${finalApiPath}`,
        method: method,
        headers: headers
    };

    let dataString = null;
    if (postData) {
        if (method === 'POST' || method === 'PUT') {
            dataString = JSON.stringify(postData);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(dataString);
        } else if (method === 'GET' && Object.keys(postData).length > 0) {
            const queryStringParams = querystring.stringify(postData);
            options.path += (options.path.includes('?') ? '&' : '?') + queryStringParams;
            console.log(`${logPrefix} GET request with query params. Updated path: ${options.path}`);
        }
    }

    console.log(`${logPrefix} Sending ${method} request to: https://api.tumblr.com${options.path}`);
    if (dataString) {
        console.log(`${logPrefix} Request Body: ${dataString}`);
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', async () => { // async yaptık çünkü token yenileme await gerektirebilir
                console.log(`${logPrefix} Received response for ${method} ${options.path}. Status: ${res.statusCode}.`);
                // console.log(`${logPrefix} Raw Response Body for ${options.path}: "${responseBody}"`); // Çok uzun olabilir, debug için açılabilir
                try {
                    if (!responseBody && res.statusCode !== 204) {
                        console.error(`${logPrefix} Empty response from Tumblr API for ${options.path} (Status: ${res.statusCode})`);
                        return reject({ statusCode: res.statusCode || 500, message: 'Empty response from Tumblr API', details: 'No data received.' });
                    }
                    if (res.statusCode === 204) { // No Content
                        console.log(`${logPrefix} Received 204 No Content for ${options.path}. Resolving with null.`);
                        return resolve(null);
                    }

                    const parsedBody = JSON.parse(responseBody);

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`${logPrefix} Successful API response for ${options.path}.`);
                        resolve(parsedBody.response); // Genellikle .response altında asıl veri bulunur
                    } else {
                        console.error(`${logPrefix} Tumblr API Error (${options.path}) - Status: ${res.statusCode}, Parsed Body:`, JSON.stringify(parsedBody, null, 2));

                        // YETKİLENDİRME HATASI (401) VE YENİDEN DENEME MANTIĞI
                        if (res.statusCode === 401 && appUsername && currentAccessToken && retryAttempt < 1) { // Sadece bir kez yeniden dene
                            console.warn(`${logPrefix} Received 401 Unauthorized. Attempting token refresh for user: ${appUsername}`);
                            try {
                                const refreshResult = await tokenRefresher.refreshTokenForUser(appUsername);
                                console.log(`${logPrefix} Token refresh successful for ${appUsername}. Retrying original request.`);

                                // users.xml'den güncellenmiş kullanıcıyı tekrar oku (ya da refreshResult'tan yeni token'ı al)
                                // Şimdilik, refreshTokenForUser'ın users.xml'i güncellediğini varsayıyoruz
                                // ve yeni token'ı almak için kullanıcıyı tekrar okuyoruz.
                                // Daha iyisi, refreshTokenForUser doğrudan yeni token'ı döndürebilir.
                                // tokenRefresher.js'deki resolve objesi zaten newAccessToken içeriyor.
                                // Ancak, bu accessToken'i bir sonraki makeTumblrApiRequest çağrısına iletmemiz lazım.

                                // Güncellenmiş kullanıcıyı alıp yeni token ile tekrar dene
                                const users = await getUsersInternal(); // tokenRefresher'daki XML okuma fonksiyonu
                                const updatedUser = users.find(u => u.appUsername === appUsername);

                                if (updatedUser && updatedUser.accessToken) {
                                    // Orijinal isteği YENİ TOKEN ile tekrar yap
                                    return makeTumblrApiRequest(method, apiPath, updatedUser.accessToken, postData, false, null, appUsername, retryAttempt + 1)
                                        .then(resolve) // Başarılı olursa ana promise'i çöz
                                        .catch(reject); // Başarısız olursa ana promise'i reddet
                                } else {
                                    console.error(`${logPrefix} Token yenilendi ama güncel kullanıcı bilgisi/token alınamadı.`);
                                    reject({ statusCode: 500, message: 'Token yenilendi ancak sonraki istek için hazırlanamadı.', needsReAuth: true });
                                }

                            } catch (refreshError) {
                                console.error(`${logPrefix} Token refresh failed for user ${appUsername}:`, refreshError);
                                // Eğer refresh token da geçersizse (needsReAuth: true), bu bilgiyi yukarı taşı
                                reject({
                                    statusCode: res.statusCode, // Orijinal 401 hatasını koru
                                    message: refreshError.message || 'Token yenileme başarısız oldu.',
                                    details: refreshError.details || parsedBody,
                                    needsReAuth: refreshError.needsReAuth || false
                                });
                            }
                        } else {
                            // 401 değilse veya yeniden deneme hakkı bittiyse veya appUsername/accessToken yoksa direkt reddet
                            reject({
                                statusCode: res.statusCode,
                                message: parsedBody.meta?.msg || 'Tumblr API Error',
                                details: parsedBody.errors || parsedBody.error_description || parsedBody,
                                needsReAuth: (res.statusCode === 401 && appUsername && currentAccessToken) // Eğer 401 ise ve token'lı çağrıysa re-auth gerekebilir
                            });
                        }
                    }
                } catch (e) {
                    console.error(`${logPrefix} Error parsing Tumblr API response from ${options.path} (Status: ${res.statusCode}): Original Body: "${responseBody}" Error Stack:`, e.stack);
                    reject({ statusCode: res.statusCode || 500, message: 'Error parsing API response', details: responseBody });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`${logPrefix} Problem with request to ${options.path}:`, e);
            reject({ statusCode: 500, message: 'Request to Tumblr API failed', details: e.message });
        });

        if (dataString && (method === 'POST' || method === 'PUT')) {
            req.write(dataString);
        }
        req.end();
    });
}

module.exports = {
    getTumblrAppConfig,
    makeTumblrApiRequest
};
