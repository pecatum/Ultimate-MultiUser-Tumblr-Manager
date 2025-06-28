// modules/userLimitsHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function fetchUserLimits(params, accessToken, appUsername) { // appUsername eklendi
    const logPrefix = `[UserLimitsHandler-${appUsername}]`;
    console.log(`${logPrefix} fetchUserLimits çağrıldı. Token (ilk 5):`, accessToken ? accessToken.substring(0, 5) + '...' : 'YOK');
    if (!accessToken) {
        const errorMsg = `${logPrefix} Kullanıcı limitlerini almak için erişim token'ı gereklidir.`;
        console.error(errorMsg);
        throw { statusCode: 401, message: "Kullanıcı limitlerini almak için kullanıcı token'ı gereklidir.", needsReAuth: true };
    }
     if (!appUsername && accessToken) { // accessToken var ama appUsername yoksa (token yenileme için gerekli)
        console.warn(`${logPrefix} appUsername is missing, token refresh might not work if needed.`);
    }

    const apiPath = `/user/limits`;
    console.log(`${logPrefix} Kullanıcı limitleri çekiliyor. Path: ${apiPath}`);
    try {
        // makeTumblrApiRequest'e appUsername parametresini ekle
        const result = await makeTumblrApiRequest('GET', apiPath, accessToken, null, false, null, appUsername);
        
        console.log(`${logPrefix} Kullanıcı limitleri isteği işlendi. Tumblr API Sonucu:`, JSON.stringify(result, null, 2));

        // makeTumblrApiRequest zaten .response kısmını döndürdüğü için result doğrudan user objesini içermeli
        // /user/limits endpoint'i doğrudan "user" objesini DÖNDÜRMEZ, "response" altında "user" objesini içerir.
        // serverUtils'deki makeTumblrApiRequest, parsedBody.response döndürür.
        // Bu durumda, result'ın kendisi { user: { limits: ..., usage: ... } } şeklinde olmalı.
        if (result && result.user) { // API'den gelen yanıtın "user" objesini içerdiğini kontrol et
            console.log(`${logPrefix} Kullanıcı limitleri başarıyla çekildi.`);
            return result.user; // "user" objesini döndür (bu obje içinde limits ve usage bulunur)
        } else if (result && result.limits && result.usage) { // Bazen API doğrudan user objesi olmadan limits ve usage döndürebilir (eski API versiyonları?)
             console.warn(`${logPrefix} Kullanıcı limitleri isteği "user" objesi olmadan doğrudan limit/usage döndürdü. Yanıt:`, result);
             return result; // Doğrudan result objesini döndür
        }
         else {
            console.warn(`${logPrefix} Kullanıcı limitleri isteği beklenen "user" objesini veya limit/usage alanlarını döndürmedi. Yanıt:`, result);
            throw { statusCode: 500, message: "Kullanıcı limitleri alınamadı veya API yanıtı beklenmedik bir formatta." };
        }
    } catch (error) {
        console.error(`${logPrefix} Kullanıcı limitleri çekilirken hata:`, error);
        throw error; // Hata objesi zaten statusCode, message, details ve needsReAuth içerebilir
    }
}

module.exports = {
    fetchUserLimits
};
