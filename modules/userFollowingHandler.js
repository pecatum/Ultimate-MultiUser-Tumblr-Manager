// modules/userFollowingHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function getFollowingList(params, accessToken, appUsername) { // appUsername eklendi
    const logPrefix = `[UserFollowingHandler-${appUsername}]`;
    if (!accessToken) {
        console.error(`${logPrefix} Access token is missing.`);
        throw { statusCode: 401, message: "Bu işlem için kullanıcı girişi gereklidir (accessToken eksik).", needsReAuth: true };
    }

    const limit = params.limit || 20;
    const offset = params.offset || 0;

    console.log(`${logPrefix} Fetching following list for user. Limit: ${limit}, Offset: ${offset}. Token (ilk 5): ${accessToken ? accessToken.substring(0,5) : 'YOK'}...`);

    try {
        // makeTumblrApiRequest'e appUsername parametresini ekle
        const followingData = await makeTumblrApiRequest('GET', '/user/following', accessToken, { limit, offset }, false, null, appUsername);
        
        if (followingData && typeof followingData.total_blogs !== 'undefined' && Array.isArray(followingData.blogs)) {
            console.log(`${logPrefix} Successfully fetched ${followingData.blogs.length} blogs. Total followed: ${followingData.total_blogs}`);
            return followingData;
        } else {
            console.error(`${logPrefix} Invalid response structure from Tumblr API for /user/following:`, followingData);
            throw new Error("Tumblr API'sinden /user/following için geçersiz yanıt yapısı.");
        }
    } catch (error) {
        console.error(`${logPrefix} Error fetching user following list:`, error);
        throw error; // Hata objesi zaten serverUtils'den needsReAuth içerebilir
    }
}

module.exports = {
    getFollowingList
};
