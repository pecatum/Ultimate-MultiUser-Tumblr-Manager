// modules/unfollowHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function unfollowBlog(params, accessToken, appUsername) { // appUsername eklendi
    const logPrefix = `[UnfollowHandler-${appUsername}]`;
    if (!accessToken) {
        console.error(`${logPrefix} Access token is missing.`);
        throw { statusCode: 401, message: "Bu işlem için kullanıcı girişi gereklidir (accessToken eksik).", needsReAuth: true };
    }

    const urlString = params.urlString;
    if (!urlString) {
        console.error(`${logPrefix} urlString parameter is missing.`);
        throw { statusCode: 400, message: "Takipten çıkarılacak blog URL'si (urlString) gereklidir." };
    }

    console.log(`${logPrefix} Attempting to unfollow blog: ${urlString}. Token (ilk 5): ${accessToken ? accessToken.substring(0,5) : 'YOK'}...`);

    try {
        // makeTumblrApiRequest'e appUsername parametresini ekle
        const response = await makeTumblrApiRequest('POST', '/user/unfollow', accessToken, { url: urlString }, false, null, appUsername);
        
        console.log(`${logPrefix} Successfully unfollowed blog: ${urlString}. Response:`, response);
        return { success: true, message: `${urlString} başarıyla takipten çıkarıldı.`, data: response };

    } catch (error) {
        console.error(`${logPrefix} Error unfollowing blog ${urlString}:`, error);
        throw error; // Hata objesi zaten serverUtils'den needsReAuth içerebilir
    }
}

module.exports = {
    unfollowBlog
};
