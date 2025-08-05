// modules/userInfoHandler_fordashboard.js
// Bu dosya, SADECE çoklu hesap paneli tarafından kullanılmak üzere tasarlanmıştır.

const { makeTumblrApiRequest } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

// Bu fonksiyon, server.js'deki /api/execute-action rotasından gelen
// (params, accessToken, appUsername) parametre sırasına göre çalışır.
async function getUserDataForDashboard(params, accessToken, appUsername) {
    const logPrefix = `[DashboardUserInfoHandler-${appUsername}]`;
    
    const users = await getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);

    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: `Handler içinde ${appUsername} için kullanıcı veya blog ID bulunamadı.` };
    }
    const tumblrBlogId = targetUser.tumblrBlogId;

    if (!accessToken || typeof accessToken !== 'string') {
        throw { statusCode: 401, message: "Geçersiz veya eksik erişim token'ı.", needsReAuth: true };
    }
    
    console.log(`${logPrefix} Fetching data for blogId: ${tumblrBlogId}`);

    // API çağrıları paralel olarak yapılır.
    const [blogInfoResult, followersInfoResult, userInfoResult] = await Promise.allSettled([
        makeTumblrApiRequest('GET', `/blog/${tumblrBlogId}/info`, accessToken, null, false, null, appUsername),
        makeTumblrApiRequest('GET', `/blog/${tumblrBlogId}/followers`, accessToken, null, false, null, appUsername),
        makeTumblrApiRequest('GET', '/user/info', accessToken, null, false, null, appUsername)
    ]);

    // Sonuçları işle
    const blogInfoData = blogInfoResult.status === 'fulfilled' ? blogInfoResult.value : {};
    const followersInfoData = followersInfoResult.status === 'fulfilled' ? followersInfoResult.value : {};
    const userInfoData = userInfoResult.status === 'fulfilled' ? userInfoResult.value : {};

    if (!blogInfoData?.blog?.name && !userInfoData?.user?.name) {
        throw { statusCode: 404, message: "Kullanıcı veya blog için temel kimlik bilgileri alınamadı."};
    }

    // YENİ: /user/info yanıtından doğru blogu bularak UUID'sini alıyoruz.
    const targetBlogFromUserInfo = userInfoData.user?.blogs?.find(b => b.name === tumblrBlogId);
    const blogUuid = targetBlogFromUserInfo?.uuid || null;

    return {
        blog: {
            name: blogInfoData.blog?.name || null,
            title: blogInfoData.blog?.title || null,
            url: blogInfoData.blog?.url || null,
            avatar: blogInfoData.blog?.avatar || [],
            followers: followersInfoData?.total_users ?? 0,
            posts: blogInfoData.blog?.posts ?? 0,
            // GÜNCELLEME: Frontend'e gönderilecek veriye 'uuid' alanı eklendi.
            uuid: blogUuid
        },
        user: { 
            following: userInfoData.user?.following ?? 0,
            likes: userInfoData.user?.likes ?? 0,
            name: userInfoData.user?.name || null
        }
    };
}

module.exports = {
    getUserDataForDashboard
};