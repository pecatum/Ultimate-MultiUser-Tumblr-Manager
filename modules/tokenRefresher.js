// modules/tokenRefresher.js
const https = require('https');
const querystring = require('querystring');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

// const { getTumblrAppConfig } = require('./serverUtils'); // BU SATIR KALDIRILDI

const USERS_PATH = path.join(__dirname, '../users.xml');
const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
const builder = new xml2js.Builder();

async function readUsersXmlInternal() {
    try {
        const data = await fs.readFile(USERS_PATH, 'utf-8');
        return await parser.parseStringPromise(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn("[TokenRefresher] users.xml bulunamadı, boş yapı döndürülüyor.");
            return { users: { user: [] } };
        }
        console.error("[TokenRefresher] users.xml okunurken hata:", error);
        throw error;
    }
}

async function getUsersInternal() {
    const usersObject = await readUsersXmlInternal();
    if (usersObject.users && usersObject.users.user) {
        return Array.isArray(usersObject.users.user) ? usersObject.users.user : [usersObject.users.user];
    }
    return [];
}

async function writeUsersXmlInternal(jsObject) {
    try {
        const xmlData = builder.buildObject(jsObject);
        await fs.writeFile(USERS_PATH, xmlData, 'utf-8');
        console.log("[TokenRefresher] users.xml başarıyla yazıldı.");
    } catch (error) {
        console.error("[TokenRefresher] users.xml yazılırken hata:", error);
        throw error;
    }
}

async function refreshTokenForUser(appUsername) {
    // getTumblrAppConfig'i burada, ihtiyaç duyulduğunda require et
    const { getTumblrAppConfig } = require('./serverUtils'); 
    const logPrefix = `[TokenRefresher-${appUsername}]`;
    console.log(`${logPrefix} Kullanıcı için token yenileme işlemi başlatılıyor.`);

    let users = await getUsersInternal();
    const userIndex = users.findIndex(u => u.appUsername === appUsername);

    if (userIndex === -1) {
        console.error(`${logPrefix} Kullanıcı bulunamadı: ${appUsername}`);
        throw { statusCode: 404, message: "Kullanıcı bulunamadı." };
    }

    const user = users[userIndex];
    if (!user.refreshToken) {
        console.warn(`${logPrefix} Kullanıcı için refresh token bulunmuyor: ${appUsername}. Yeniden tam yetkilendirme gerekebilir.`);
        throw { statusCode: 400, message: "Refresh token bulunmuyor. Lütfen yeniden giriş yapın.", needsReAuth: true };
    }

    console.log(`${logPrefix} Refresh token (ilk 5): ${user.refreshToken.substring(0,5)}...`);

    let tumblrAppConfig;
    try {
        tumblrAppConfig = await getTumblrAppConfig(); // Artık burada çağrıldığında sorun olmamalı
    } catch (configError) {
        console.error(`${logPrefix} Tumblr uygulama konfigürasyonu okunamadı:`, configError);
        // Hata objesinin yapısını serverUtils'deki gibi yapalım
        throw { statusCode: 500, message: "Sunucu yapılandırma hatası (token yenileme).", details: configError.message };
    }

    const tokenRequestBody = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken,
        client_id: tumblrAppConfig.oauthConsumerKey,
        client_secret: tumblrAppConfig.oauthConsumerSecret
    });

    console.log(`${logPrefix} Tumblr'a token yenileme isteği gönderiliyor. Body (secret hariç):`,
        tokenRequestBody.replace(tumblrAppConfig.oauthConsumerSecret, 'CLIENT_SECRET_REDACTED'));

    return new Promise((resolve, reject) => {
        const tokenRequestOptions = {
            hostname: 'api.tumblr.com',
            path: '/v2/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenRequestBody),
                'User-Agent': 'TumblrAppLocalhost/1.0 (TokenRefresher)'
            }
        };

        const req = https.request(tokenRequestOptions, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', async () => {
                console.log(`${logPrefix} Tumblr token yenileme yanıtı alındı. Status: ${res.statusCode}. Raw Body: "${responseData}"`);
                try {
                    const tokenResult = JSON.parse(responseData);

                    if (res.statusCode === 200 && tokenResult.access_token) {
                        console.log(`${logPrefix} Token başarıyla yenilendi. Yeni access token (ilk 5): ${tokenResult.access_token.substring(0,5)}...`);

                        users[userIndex].accessToken = tokenResult.access_token;
                        if (tokenResult.refresh_token) {
                            users[userIndex].refreshToken = tokenResult.refresh_token;
                            console.log(`${logPrefix} Yeni refresh token alındı (ilk 5): ${tokenResult.refresh_token.substring(0,5)}...`);
                        }
                        users[userIndex].tokenExpiresAt = tokenResult.expires_in ?
                            new Date(Date.now() + tokenResult.expires_in * 1000).toISOString() :
                            null;
                        users[userIndex].lastTokenRefresh = new Date().toISOString();

                        await writeUsersXmlInternal({ users: { user: users } });
                        console.log(`${logPrefix} users.xml güncellendi (yeni token bilgileriyle).`);

                        resolve({
                            success: true,
                            message: "Token başarıyla yenilendi.",
                            newAccessToken: tokenResult.access_token,
                            newExpiresAt: users[userIndex].tokenExpiresAt
                        });
                    } else {
                        console.error(`${logPrefix} Token yenileme başarısız. Status: ${res.statusCode}, Yanıt:`, tokenResult);
                        let errorMessage = "Token yenilenemedi.";
                        if (tokenResult.error_description) errorMessage += ` Detay: ${tokenResult.error_description}`;
                        else if (tokenResult.error) errorMessage += ` Hata: ${tokenResult.error}`;

                        if (res.statusCode === 401 || (tokenResult.error && (tokenResult.error === 'invalid_grant' || tokenResult.error === 'invalid_token'))) {
                           errorMessage += " Refresh token geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın.";
                           reject({ statusCode: res.statusCode, message: errorMessage, needsReAuth: true, details: tokenResult });
                        } else {
                           reject({ statusCode: res.statusCode, message: errorMessage, details: tokenResult });
                        }
                    }
                } catch (parseError) {
                    console.error(`${logPrefix} Token yenileme yanıtı parse edilirken hata:`, parseError);
                    reject({ statusCode: 500, message: "Token yenileme yanıtı işlenemedi.", details: responseData });
                }
            });
        });

        req.on('error', (error) => {
            console.error(`${logPrefix} Token yenileme isteğinde ağ hatası:`, error);
            reject({ statusCode: 500, message: "Token yenileme isteği gönderilemedi.", details: error.message });
        });

        req.write(tokenRequestBody);
        req.end();
    });
}

module.exports = {
    refreshTokenForUser,
    // XML fonksiyonlarını da export edelim, belki serverUtils veya başka bir yer kullanmak ister
    // Ancak idealde bunlar ayrı bir userXmlUtils.js modülünde olmalı.
    getUsersInternal,
    writeUsersXmlInternal,
    readUsersXmlInternal
};
