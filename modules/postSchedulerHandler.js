// modules/postSchedulerHandler.js

// Gerekli yardımcı modülleri içe aktarıyoruz.
const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

/**
 * Verilen bir Tumblr gönderi URL'sinden reblog işlemi için gerekli bilgileri (ID, reblog_key, kaynak blog UUID vb.) çeker.
 * Bu fonksiyon, kullanıcı girişi gerektirmeyen, yalnızca uygulama API anahtarı ile çalışır.
 * @param {object} params - İçerisinde 'post_url' bulunan nesne.
 * @returns {object} - Reblog için gereken gönderi detayları.
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
        // Gelen URL'yi ayrıştırarak blog adını ve gönderi ID'sini bulmaya çalışıyoruz.
        const urlObj = new URL(post_url);
        const pathParts = urlObj.pathname.toLowerCase().split('/').filter(part => part.length > 0);

        if (urlObj.hostname.endsWith('.tumblr.com')) {
            blogIdentifier = urlObj.hostname.split('.')[0];
            if (blogIdentifier === 'www' || blogIdentifier === 'assets') {
                if (pathParts.length > 0) blogIdentifier = pathParts[0];
                else { throw new Error("Blog adı www.tumblr.com URL'sinden ayrıştırılamadı."); }
            }
        } else {
            if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
                if (pathParts.length > 0) blogIdentifier = pathParts[0];
                else { throw new Error("Blog adı tumblr.com URL'sinden ayrıştırılamadı."); }
            } else {
                blogIdentifier = urlObj.hostname;
            }
        }

        const postKeywordIndex = pathParts.indexOf('post');
        if (postKeywordIndex !== -1 && pathParts.length > postKeywordIndex + 1) {
            postId = pathParts[postKeywordIndex + 1].match(/^\d+/)?.[0];
        }

        if (!postId) {
            const lastPart = pathParts[pathParts.length - 1];
            const numericMatch = lastPart.match(/^(\d+)/);
            if (numericMatch) postId = numericMatch[1];
        }

        if (!blogIdentifier || !postId) {
            console.error(`${logPrefix} URL'den blog adı (${blogIdentifier}) veya gönderi ID'si (${postId}) düzgün ayrılamadı: ${post_url}`);
            throw new Error(`URL'den blog adı veya gönderi ID'si ayrıştırılamadı.`);
        }
        console.log(`${logPrefix} URL ayrıştırıldı: Kaynak Blog='${blogIdentifier}', Kaynak PostID='${postId}'`);

    } catch (e) {
        console.error(`${logPrefix} URL ayrıştırma hatası: ${post_url}`, e);
        throw { statusCode: 400, message: `Geçersiz gönderi URL'si: ${e.message}` };
    }

    // Tumblr uygulama konfigürasyonundan API anahtarını alıyoruz.
    const config = await getTumblrAppConfig();
    const apiKey = config.oauthConsumerKey;
    if (!apiKey) {
        throw { statusCode: 500, message: "Sunucu yapılandırma hatası: API Anahtarı bulunamadı." };
    }

    const apiPath = `/blog/${blogIdentifier}/posts?id=${postId}&reblog_info=true&npf=true`;
    console.log(`${logPrefix} Tumblr'dan gönderi detayları isteniyor. Path: ${apiPath}`);

    try {
        const response = await makeTumblrApiRequest('GET', apiPath, null, null, true, apiKey, null);

        if (response && response.posts && response.posts.length > 0) {
            const postData = response.posts[0];
            if (!postData.reblog_key) {
                console.warn(`${logPrefix} Gönderi (${postData.id_string}) için reblog_key bulunamadı. Reblog yapılamaz.`);
                throw { statusCode: 400, message: `Bu gönderi yeniden bloglanamaz olabilir (reblog anahtarı eksik).` };
            }
            console.log(`${logPrefix} Reblog için gönderi detayları başarıyla çekildi: Kaynak Blog: ${postData.blog_name}`);
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
            throw { statusCode: 404, message: "Belirtilen URL için gönderi bulunamadı." };
        }
    } catch (error) {
        console.error(`${logPrefix} Gönderi detayı çekme hatası: URL: ${post_url}`, error);
        throw error;
    }
}

/**
 * Bir Tumblr gönderisini belirtilen kullanıcı adına yeniden bloglar (reblog).
 * Anında yayınlama, sıraya ekleme ve planlama işlemlerini destekler.
 * Bu fonksiyon, kullanıcıya özel Access Token ile çalışır.
 * @param {object} params - İstemciden gelen reblog parametreleri.
 * @param {object} accessToken - İşlemi yapacak kullanıcının access token'ı.
 * @param {string} appUsername - İşlemi yapacak kullanıcının uygulama içi adı.
 * @returns {object} - Tumblr API'sinden dönen yanıt.
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

    const users = await getUsersInternal();
    const currentUser = users.find(u => u.appUsername === appUsername);

    if (!currentUser || !currentUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef blog bilgisi kullanıcı kaydında bulunamadı.", needsReAuth: true };
    }
    const targetBlogIdentifier = currentUser.tumblrBlogId;
    console.log(`${logPrefix} Hedef blog: ${targetBlogIdentifier}`);

    const apiPath = `/blog/${targetBlogIdentifier}/posts`;
    // API'ye gönderilecek temel reblog bilgilerini hazırlıyoruz.
    const requestBody = {
        parent_tumblelog_uuid: parent_tumblelog_uuid,
        parent_post_id: parent_post_id,
        reblog_key: reblog_key,
    };

    // İstemciden yorum gelmişse, NPF formatında content olarak ekliyoruz.
    if (comment_npf && Array.isArray(comment_npf) && comment_npf.length > 0) {
        requestBody.content = comment_npf;
    }

    // İstemciden etiket gelmişse, virgülle ayrılmış bir string olarak ekliyoruz.
    if (tags_array && Array.isArray(tags_array) && tags_array.length > 0) {
        requestBody.tags = tags_array.join(',');
    }

    // --- GÖNDERİ DURUMU VE PLANLAMA MANTIĞI (DÜZELTİLMİŞ) ---
    // Eğer belirli bir yayınlanma zamanı (publish_on_iso) gönderilmişse, bu planlı bir gönderidir.
    // Bu durumda 'state' 'queue' olmalı ve 'publish_on' zamanı eklenmelidir.
    if (post_state === 'queue' && publish_on_iso) {
        requestBody.state = 'queue';
        requestBody.publish_on = publish_on_iso;
    } else {
        // Eğer bir yayın zamanı belirtilmemişse, bu ya "anında yayınla" ya da "sıraya ekle" işlemidir.
        // İstemciden gelen 'post_state' kullanılır. Eğer o da gelmemişse, varsayılan olarak 'published' kabul edilir.
        requestBody.state = post_state || 'published';
    }
    // --- DÜZELTME SONU ---

    console.log(`${logPrefix} Tumblr'a reblog isteği gönderiliyor. Path: ${apiPath}, Body:`, requestBody);

    try {
        const response = await makeTumblrApiRequest('POST', apiPath, accessToken, requestBody, false, null, appUsername);
        console.log(`${logPrefix} Gönderi başarıyla '${requestBody.state}' durumunda yeniden bloglandı. Yanıt ID: ${response.id_string || response.id || 'Bilinmiyor'}`);
        return response;
    } catch (error) {
        console.error(`${logPrefix} Yeniden bloglama hatası:`, error);
        throw error;
    }
}

// Fonksiyonları dışa aktarıyoruz ki uygulamanın başka yerlerinde kullanılabilsin.
module.exports = {
    fetchPostDetailsForReblog,
    processReblogSubmission,
};