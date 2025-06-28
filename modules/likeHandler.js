// modules/likeHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function likePost(params, accessToken, appUsername) { // appUsername eklendi
    const logPrefix = `[LikeHandler-${appUsername} ${params.post_id || 'N/A'}]`; // Log için appUsername
    console.log(`${logPrefix} likePost called. Params:`, params, 'Token (first 5):', accessToken ? accessToken.substring(0,5) + '...' : 'NONE');
    if (!accessToken) {
        const errorMsg = `${logPrefix} Access token is required to like a post.`;
        console.error(errorMsg);
        throw { statusCode: 401, message: "Gönderi beğenmek için kullanıcı token'ı gereklidir.", needsReAuth: true };
    }
    if (!appUsername && accessToken) {
        console.warn(`${logPrefix} appUsername is missing, token refresh might not work if needed.`);
    }

    const { post_id, reblog_key } = params;
    if (!post_id || !reblog_key) {
        const errorMsg = `${logPrefix} post_id and reblog_key are required.`;
        console.error(errorMsg, "Received params:", params);
        throw { statusCode: 400, message: "Gönderi beğenmek için post_id ve reblog_key parametreleri gereklidir." };
    }

    const apiPath = `/user/like`;
    const postData = {
        id: post_id.toString(), 
        reblog_key: reblog_key
    };
    
    console.log(`${logPrefix} Attempting to like post. Path: ${apiPath}, Data:`, JSON.stringify(postData));
    try {
        // makeTumblrApiRequest'e appUsername parametresini ekle
        const result = await makeTumblrApiRequest('POST', apiPath, accessToken, postData, false, null, appUsername);
        console.log(`${logPrefix} Like request processed. Tumblr API Result:`, JSON.stringify(result, null, 2));
        
        if (result !== undefined) { 
             console.log(`${logPrefix} Post successfully liked or already liked.`);
             return { success: true, message: `Gönderi ID ${post_id} başarıyla beğenildi veya zaten beğenilmişti.`, apiResponse: result };
        } else {
            console.warn(`${logPrefix} Like request for post ${post_id} returned undefined/null result, assuming success as no error was thrown.`);
            return { success: true, message: `Gönderi ID ${post_id} için beğenme isteği gönderildi (API yanıtı boş olabilir).`, apiResponse: result };
        }
    } catch (error) {
        console.error(`${logPrefix} Error liking post:`, error); // Orijinal hata objesini logla
        const statusCode = error.statusCode || 500;
        let userFriendlyMessage = error.message || "Bilinmeyen beğenme hatası.";
        
        // serverUtils'den gelen hata mesajını koru, üzerine yazma
        if (error.message && error.statusCode) { // Eğer serverUtils'den anlamlı bir hata mesajı geldiyse onu kullan
            userFriendlyMessage = error.message;
        } else if (statusCode === 400 || statusCode === 403 || statusCode === 404) { 
            console.warn(`${logPrefix} Post like attempt resulted in ${statusCode}. Possibly already liked or post issue. Details:`, error.details);
            userFriendlyMessage = `Gönderi beğenilemedi (durum ${statusCode}). Muhtemelen zaten beğenilmiş veya gönderiyle ilgili bir sorun var.`;
        } else if (!error.statusCode) { // statusCode yoksa genel bir sunucu hatası olabilir
             userFriendlyMessage = "Gönderi beğenilirken bilinmeyen bir sunucu hatası oluştu.";
        }

        throw { 
            statusCode: statusCode, 
            success: false, // Başarısız olduğunu belirt
            message: userFriendlyMessage, 
            details: error.details || error, // Detayları koru
            needsReAuth: error.needsReAuth || (statusCode === 401) // needsReAuth bilgisini koru
        };
    }
}

module.exports = {
    likePost
};
