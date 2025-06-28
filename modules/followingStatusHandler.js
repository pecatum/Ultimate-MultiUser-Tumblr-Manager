// modules/followingStatusHandler.js
const { makeTumblrApiRequest } = require('./serverUtils'); // serverUtils.js'nin doğru yolda olduğundan emin olun

async function getBlogFollowingStatus(params, accessToken, appUsername) { // appUsername eklendi
    const logPrefix = `[FollowingStatusHandler-${appUsername || 'UserToken'}]`; // Log için appUsername veya genel bir ifade
    const { blog_identifier } = params;

    if (!blog_identifier) {
        console.error(`${logPrefix} Blog tanımlayıcısı (blog_identifier) eksik.`);
        throw { statusCode: 400, message: "Blog tanımlayıcısı (blog_identifier) gereklidir." };
    }
    if (!accessToken) {
        console.error(`${logPrefix} Erişim token'ı eksik.`);
        throw { statusCode: 401, message: "Takip durumu için kullanıcı erişim token'ı gereklidir.", needsReAuth: true };
    }
     if (!appUsername && accessToken) {
        console.warn(`${logPrefix} appUsername eksik, token yenileme gerekirse çalışmayabilir.`);
    }


    // Opsiyonel alanlar: %3Ffollowed, %3Fis_following_you, %3Fduration_following_blog, %3Fduration_blog_following_you
    // Temel alanlar: name,url,updated,posts,description,avatar
    const fieldsToRequest = 'name,url,updated,posts,description,avatar,%3Ffollowed,%3Fis_following_you,%3Fduration_following_blog,%3Fduration_blog_following_you';
    const apiPath = `/blog/${blog_identifier}/info?fields[blogs]=${fieldsToRequest}`;

    console.log(`${logPrefix} "${blog_identifier}" için takip durumu ve blog bilgisi çekiliyor. Path: ${apiPath}`);
    try {
        // makeTumblrApiRequest, API yanıtının 'response' kısmını döndürür.
        // /blog/{...}/info endpoint'i 'response.blog' objesini döndürür.
        // appUsername parametresini makeTumblrApiRequest'e iletiyoruz.
        const result = await makeTumblrApiRequest('GET', apiPath, accessToken, null, false, null, appUsername);

        if (result && result.blog) {
            console.log(`${logPrefix} "${blog_identifier}" için bilgi başarıyla çekildi.`);
            let selectedAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.blog.name || 'T')}&background=random&size=128&font-size=0.33&format=svg`;
            if (result.blog.avatar && Array.isArray(result.blog.avatar) && result.blog.avatar.length > 0) {
                const suitableAvatar = result.blog.avatar.find(a => a.width >= 128) || result.blog.avatar.find(a => a.width >= 64) || result.blog.avatar[0];
                if (suitableAvatar) selectedAvatarUrl = suitableAvatar.url;
            }
            
            return { // İstemcinin bekleyeceği standart bir format
                name: result.blog.name,
                title: result.blog.title || result.blog.name,
                url: result.blog.url,
                updated: result.blog.updated,
                posts: result.blog.posts,
                description: result.blog.description || "",
                avatar: selectedAvatarUrl,
                is_following_me: result.blog.is_following_you === true,
                am_i_following_them: result.blog.followed === true,
                duration_blog_following_you: result.blog.duration_blog_following_you,
                duration_following_blog: result.blog.duration_following_blog
            };
        } else {
            // API'den beklenen 'blog' objesi gelmediyse veya result boşsa
            const errorMeta = result && result.meta ? result.meta : { status: 404, msg: "Bilinmeyen API yanıtı" };
            const errorDetail = result && result.errors && result.errors[0] ? result.errors[0].detail : "Blog bilgisi alınamadı.";
            console.warn(`${logPrefix} "${blog_identifier}" için bilgi çekilemedi. Yanıt:`, JSON.stringify(result));
            throw { statusCode: errorMeta.status, message: `${errorMeta.msg}: ${errorDetail}`, needsReAuth: (errorMeta.status === 401) };
        }
    } catch (error) {
        // makeTumblrApiRequest'ten gelen hata veya yukarıdaki throw
        console.error(`${logPrefix} "${blog_identifier}" için bilgi çekilirken kritik hata:`, error);
        // Hata objesi zaten serverUtils'den needsReAuth içerebilir
        throw error;
    }
}

module.exports = {
    getBlogFollowingStatus
};
