// modules/notificationsHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function getBlogNotifications(params, accessToken, appUsername) {
    const { before, types } = params;
    const logPrefix = `[NotificationsHandler-${appUsername}]`;

    const users = await require('./tokenRefresher').getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);
    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Kullanıcı veya blog ID bulunamadı." };
    }
    const blogIdentifier = targetUser.tumblrBlogId;

    let apiPath = `/blog/${blogIdentifier}/notifications`;
    const queryParams = { rollups: 'true' }; // Benzer bildirimleri grupla
    if (before) queryParams.before = before;
    if (types) queryParams.types = types.split(','); // "like,follow" -> ["like", "follow"]

    console.log(`${logPrefix} Bildirimler çekiliyor. Path: ${apiPath}, Params:`, queryParams);
    try {
        const response = await makeTumblrApiRequest('GET', apiPath, accessToken, queryParams, false, null, appUsername);
        return response;
    } catch (error) {
        console.error(`${logPrefix} Bildirimleri çekerken hata:`, error);
        throw error;
    }
}

module.exports = { getBlogNotifications };