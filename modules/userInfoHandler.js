// modules/userInfoHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

// accessToken, tumblrBlogId (server.js'den gelir), appUsername (server.js'den gelir)
async function getAuthenticatedUserData(accessToken, tumblrBlogId, appUsername) {
    const logPrefix = `[UserInfoHandler-${appUsername}]`; // Log için appUsername kullan
    if (!accessToken || !tumblrBlogId) {
        console.error(`${logPrefix} Missing accessToken or tumblrBlogId.`);
        // appUsername olmasa bile token eksikse hata verilmeli
        throw { statusCode: 401, message: "Erişim token'ı veya blog ID'si eksik.", needsReAuth: !accessToken };
    }
    if (!appUsername && accessToken) { // accessToken var ama appUsername yoksa (token yenileme için gerekli)
        console.warn(`${logPrefix} appUsername is missing, token refresh might not work if needed.`);
        // Bu durumda hata fırlatmak yerine devam edebiliriz, serverUtils appUsername yoksa yenileme yapmaz.
    }
    console.log(`${logPrefix} Fetching data for blogId: ${tumblrBlogId} with token (first 10): ${accessToken.substring(0,10)}...`);

    let blogInfoData = { blog: {} };
    let followersInfoData = { total_users: 0 };
    let userInfoData = { user: {} };

    try {
        // makeTumblrApiRequest'e appUsername'i ilet
        blogInfoData = await makeTumblrApiRequest('GET', `/blog/${tumblrBlogId}/info`, accessToken, null, false, null, appUsername);
        if (!blogInfoData || !blogInfoData.blog) {
            console.warn(`${logPrefix} Incomplete blog info for ${tumblrBlogId}. Response:`, blogInfoData);
            blogInfoData = { blog: {} };
        }
    } catch (e) {
        console.error(`${logPrefix} Error fetching blog info for ${tumblrBlogId}:`, e);
        // Hata durumunda diğerlerini denemeye devam et, ama bu hatayı da yukarı taşıyabiliriz.
        // Eğer bu çağrı 401 ise ve token yenilenemezse, diğer çağrılar da başarısız olacaktır.
        // serverUtils'den gelen hata zaten needsReAuth içerebilir.
        if (e.statusCode === 401 && e.needsReAuth) throw e; // Token yenilenemezse işlemi durdur
    }

    try {
        // makeTumblrApiRequest'e appUsername'i ilet
        followersInfoData = await makeTumblrApiRequest('GET', `/blog/${tumblrBlogId}/followers`, accessToken, null, false, null, appUsername);
        if (typeof followersInfoData?.total_users !== 'number') {
            console.warn(`${logPrefix} Incomplete followers info for ${tumblrBlogId}. Response:`, followersInfoData);
            followersInfoData = { total_users: 0 };
        }
    } catch (e) {
        console.error(`${logPrefix} Error fetching followers info for ${tumblrBlogId}:`, e);
        if (e.statusCode === 401 && e.needsReAuth) throw e;
    }

    try {
        // makeTumblrApiRequest'e appUsername'i ilet
        userInfoData = await makeTumblrApiRequest('GET', '/user/info', accessToken, null, false, null, appUsername);
        if (!userInfoData || !userInfoData.user) {
            console.warn(`${logPrefix} Incomplete user general info. Response:`, userInfoData);
            userInfoData = { user: {} };
        }
    } catch (e) {
        console.error(`${logPrefix} Error fetching user general info:`, e);
        if (e.statusCode === 401 && e.needsReAuth) throw e;
    }
    
    if (!blogInfoData.blog.name && !userInfoData.user.name) {
        console.error(`${logPrefix} Critical identification data missing for blogId ${tumblrBlogId} after all attempts.`);
        // Önemli bir veri eksikse, anlamlı bir hata döndür
        throw { statusCode: 404, message: "Kullanıcı veya blog için temel kimlik bilgileri alınamadı."};
    }

    return {
        blog: {
            name: blogInfoData.blog.name || null,
            title: blogInfoData.blog.title || null,
            url: blogInfoData.blog.url || null,
            avatar: blogInfoData.blog.avatar || [],
            followers: followersInfoData?.total_users ?? 0,
            posts: blogInfoData.blog.posts ?? 0
        },
        user: { 
            following: userInfoData.user.following ?? 0,
            likes: userInfoData.user.likes ?? 0,
            // Diğer kullanıcı bilgileri buraya eklenebilir (eğer /user/info'dan geliyorsa)
            name: userInfoData.user.name || null // Örneğin
        }
    };
}

module.exports = {
    getAuthenticatedUserData
};