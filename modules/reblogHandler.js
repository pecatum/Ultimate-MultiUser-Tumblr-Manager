// modules/reblogHandler.js
// DOSYA YOLU DÜZELTMESİ: 'serverUtils' aynı klasörde olduğu için yol './' olmalı.
const { makeTumblrApiRequest } = require('./serverUtils');

/**
 * Belirli bir gönderinin detaylarını (reblog_key, uuid vb.)
 * kullanıcı yetkisiyle (user token) çeker.
 * @param {object} params - { blog_identifier, post_id } içermelidir.
 * @param {string} accessToken - İşlemi yapan kullanıcının erişim token'ı.
 * @param {string} appUsername - İşlemi yapan kullanıcının uygulama içi adı.
 */
async function getSinglePostForReblog(params, accessToken, appUsername) {
    const { blog_identifier, post_id } = params;
    const logPrefix = `[ReblogHandler-${appUsername}]`;

    if (!blog_identifier || !post_id) {
        throw { statusCode: 400, message: "Gönderi detayı çekmek için blog adı ve gönderi ID'si gereklidir." };
    }
    if (!accessToken) {
        throw { statusCode: 401, message: "Bu işlem için kullanıcı yetkisi gereklidir.", needsReAuth: true };
    }

    const apiPath = `/blog/${blog_identifier}/posts/${post_id}`;
    console.log(`${logPrefix} Tekil gönderi detayı çekiliyor. Path: ${apiPath}`);

    try {
        const response = await makeTumblrApiRequest('GET', apiPath, accessToken, null, false, null, appUsername);
        
        // Tumblr API'si bazen doğrudan post objesini döndürür, bazen 'posts' dizisi içinde.
        const postData = response.posts && Array.isArray(response.posts) ? response.posts[0] : response;

        if (!postData || !postData.reblog_key) {
             throw { statusCode: 404, message: "Gönderi bulunamadı veya reblog anahtarı (reblog_key) içermiyor." };
        }

        const result = {
            parent_blog_name: postData.blog_name,
            parent_tumblelog_uuid: postData.blog?.uuid || postData.tumblelog_uuid,
            parent_post_id: postData.id_string,
            reblog_key: postData.reblog_key,
            original_tags: postData.tags || []
        };
        
        console.log(`${logPrefix} Gönderi detayı başarıyla çekildi: ${result.parent_blog_name}/${result.parent_post_id}`);
        return result;

    } catch (error) {
        console.error(`${logPrefix} Gönderi detayı çekme hatası:`, error);
        throw error;
    }
}

module.exports = {
    getSinglePostForReblog
};