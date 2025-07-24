// modules/postSchedulerHandler.js
const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils');
// getUsersInternal fonksiyonunu tokenRefresher'dan alıyoruz, server.js'i değiştirmemek için.
const { getUsersInternal } = require('./tokenRefresher');

/**
 * Verilen bir Tumblr gönderi URL'sinden reblog için gerekli temel bilgileri çeker.
 * (ID, reblog_key, kaynak blog adı/uuid, orijinal etiketler)
 * API Anahtarı ile çalışır.
 */
async function fetchPostDetailsForReblog(params) {
    const { post_url } = params;
    const logPrefix = `[PostSchedulerHandler-APIKey]`;
    console.log(`${logPrefix} fetchPostDetailsForReblog çağrıldı. URL: ${post_url}`);

    if (!post_url) {
        throw { statusCode: 400, message: "Reblog detaylarını çekmek için URL gereklidir." };
    }

    let blogIdentifier, postId;
    try {
        const urlObj = new URL(post_url);
        const pathParts = urlObj.pathname.toLowerCase().split('/').filter(part => part.length > 0);

        if (urlObj.hostname.endsWith('.tumblr.com')) {
            blogIdentifier = urlObj.hostname.split('.')[0];
             if (blogIdentifier === 'www' || blogIdentifier === 'assets') {
                if (pathParts.length > 0) blogIdentifier = pathParts[0]; else { throw new Error("Blog adı www.tumblr.com URL'sinden ayrıştırılamadı.");}
             }
        } else {
            if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
                if (pathParts.length > 0) blogIdentifier = pathParts[0]; else { throw new Error("Blog adı tumblr.com URL'sinden ayrıştırılamadı.");}
            } else {
                blogIdentifier = urlObj.hostname;
            }
        }

        let potentialPostIdIndex = -1;
        const postKeywordIndex = pathParts.indexOf('post');
        if (postKeywordIndex !== -1 && pathParts.length > postKeywordIndex + 1) {
            potentialPostIdIndex = postKeywordIndex + 1;
        } else {
            const blogIdentifierInPathIndex = pathParts.indexOf(blogIdentifier.toLowerCase());
            if (blogIdentifierInPathIndex !== -1 && pathParts.length > blogIdentifierInPathIndex + 1) {
                potentialPostIdIndex = blogIdentifierInPathIndex + 1;
            } else if (blogIdentifierInPathIndex === -1 && pathParts.length > 0 && blogIdentifier === urlObj.hostname) {
                potentialPostIdIndex = 0;
            }
        }

        if (potentialPostIdIndex !== -1 && pathParts.length > potentialPostIdIndex) {
            const idCandidate = pathParts[potentialPostIdIndex];
            if (/^\d+$/.test(idCandidate)) postId = idCandidate;
        }
        
        if (!postId && pathParts.length > 0) {
             const lastPart = pathParts[pathParts.length - 1];
             const numericMatch = lastPart.match(/^(\d+)/);
             if(numericMatch) postId = numericMatch[1];
        }

        if (!blogIdentifier || !postId) {
            console.error(`${logPrefix} URL'den blog adı (${blogIdentifier}) veya gönderi ID'si (${postId}) düzgün ayrılamadı: ${post_url}`);
            throw new Error(`URL'den blog adı veya gönderi ID'si ayrıştırılamadı. Ayrıştırılan: blog='${blogIdentifier}', id='${postId}'.`);
        }
        console.log(`${logPrefix} URL (reblog için) ayrıştırıldı: Kaynak Blog='${blogIdentifier}', Kaynak PostID='${postId}'`);

    } catch (e) {
        console.error(`${logPrefix} URL ayrıştırma hatası (reblog için): ${post_url}`, e);
        throw { statusCode: 400, message: `Geçersiz gönderi URL'si (reblog için): ${e.message}` };
    }

    let apiKey;
    try {
        const config = await getTumblrAppConfig();
        apiKey = config.oauthConsumerKey;
        if (!apiKey) throw new Error("API Anahtarı yapılandırmada bulunamadı.");
    } catch (configError) {
        throw { statusCode: 500, message: "Reblog detayları çekilirken sunucu yapılandırma hatası." };
    }

    const apiPath = `/blog/${blogIdentifier}/posts?id=${postId}&reblog_info=true&npf=true`;
    console.log(`${logPrefix} Tumblr'dan gönderi detayları (reblog için) isteniyor. Path: ${apiPath}`);

    try {
        const response = await makeTumblrApiRequest('GET', apiPath, null, null, true, apiKey, null);

        if (response && response.posts && response.posts.length > 0) {
            const postData = response.posts[0];
            if (!postData.reblog_key) {
                console.warn(`${logPrefix} Gönderi (${postData.id_string}) için reblog_key bulunamadı. Reblog yapılamaz.`, postData);
                throw { statusCode: 400, message: `Gönderi (${postData.id_string}) için reblog anahtarı bulunamadı. Bu gönderi yeniden bloglanamaz olabilir.` };
            }
            console.log(`${logPrefix} Reblog için gönderi detayları çekildi: Kaynak Blog Adı: ${postData.blog_name}, Kaynak Blog UUID: ${postData.blog?.uuid}, Post ID: ${postData.id_string}, Reblog Key (ilk 5): ${postData.reblog_key.substring(0,5)}...`);
            return {
                original_url: post_url,
                parent_blog_name: postData.blog_name,
                parent_tumblelog_uuid: postData.blog.uuid,
                parent_post_id: postData.id_string,
                reblog_key: postData.reblog_key,
                original_tags: postData.tags || [],
                summary: postData.summary || `Reblog: ${postData.blog_name}/${postData.id_string}`,
            };
        } else {
            throw { statusCode: 404, message: "Belirtilen URL için reblog yapılacak gönderi bulunamadı." };
        }
    } catch (error) {
        console.error(`${logPrefix} Reblog için gönderi detayı çekme hatası: URL: ${post_url}`, error);
        throw error;
    }
}

/**
 * Bir Tumblr gönderisini belirtilen kullanıcı adına yeniden bloglar.
 * Kullanıcı Token'ı ile çalışır.
 */
async function processReblogSubmission(params, accessToken, appUsername) {
    const logPrefix = `[PostSchedulerHandler-${appUsername}] (Reblog)`;
    console.log(`${logPrefix} processReblogSubmission çağrıldı. Params:`, params);

    if (!appUsername) {
        throw { statusCode: 401, message: "Bu işlem için kullanıcı kimliği (appUsername) gereklidir.", needsReAuth: true };
    }
    const { parent_tumblelog_uuid, parent_post_id, reblog_key, comment_npf, tags_array, post_state, publish_on_iso } = params;

    if (!parent_tumblelog_uuid || !parent_post_id || !reblog_key) {
        throw { statusCode: 400, message: "Reblog yapmak için kaynak blog UUID, kaynak gönderi ID ve reblog anahtarı gereklidir." };
    }
    const effective_post_state = post_state || 'published';

    const users = await getUsersInternal();
    const currentUser = users.find(u => u.appUsername === appUsername);

    if (!currentUser || !currentUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef blog bilgisi kullanıcı kaydında bulunamadı.", needsReAuth: true };
    }
    const targetBlogIdentifier = currentUser.tumblrBlogId;
    console.log(`${logPrefix} Hedef blog: ${targetBlogIdentifier}`);

    const apiPath = `/blog/${targetBlogIdentifier}/posts`;
    const requestBody = {
        parent_tumblelog_uuid: parent_tumblelog_uuid,
        parent_post_id: parent_post_id,
        reblog_key: reblog_key,
        state: effective_post_state,
    };

    if (comment_npf && Array.isArray(comment_npf) && comment_npf.length > 0) {
        requestBody.content = comment_npf;
    }

    if (tags_array && Array.isArray(tags_array) && tags_array.length > 0) {
        requestBody.tags = tags_array.join(',');
    }
    if (effective_post_state === 'queue' && publish_on_iso) {
        requestBody.publish_on = publish_on_iso;
    }

    console.log(`${logPrefix} Tumblr'a reblog isteği gönderiliyor. Path: ${apiPath}, Body:`, requestBody);

    try {
        const response = await makeTumblrApiRequest('POST', apiPath, accessToken, requestBody, false, null, appUsername);
        console.log(`${logPrefix} Gönderi başarıyla ${requestBody.state} durumunda yeniden bloglandı. Yanıt ID: ${response.id_string || response.id || 'Bilinmiyor'}`);
        return response;
    } catch (error) {
        console.error(`${logPrefix} Yeniden bloglama hatası:`, error);
        throw error;
    }
}

module.exports = {
    fetchPostDetailsForReblog,
    processReblogSubmission,
};