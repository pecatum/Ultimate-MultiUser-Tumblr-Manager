// modules/postRepublisherHandler.js
// Bu dosya, postSchedulerHandler.js'den uyarlanmıştır.
// Reblog mantığı, yeni ve orijinal bir gönderi oluşturma mantığı ile değiştirilmiştir.

const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

/**
 * DEĞİŞTİRİLDİ: fetchPostDetailsForReblog -> fetchPostContentForRepublish
 * Bir Tumblr gönderi URL'sinden yeniden yayınlamak için gerekli tam içeriği çeker.
 * (content_blocks, etiketler, özet vb.)
 * Bu işlem için API Anahtarı kullanılır.
 */
async function fetchPostContentForRepublish(params) {
    const { post_url } = params;
    const logPrefix = `[PostRepublisherHandler-APIKey]`;
    console.log(`${logPrefix} fetchPostContentForRepublish çağrıldı. URL: ${post_url}`);

    if (!post_url) {
        throw { statusCode: 400, message: "İçeriği çekmek için URL gereklidir." };
    }

    let blogIdentifier, postId;
    try {
        // URL ayrıştırma mantığı, kaynak gönderinin blog adını ve ID'sini bulmak için kullanılır.
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

        let potentialPostIdIndex = pathParts.indexOf('post');
        if (potentialPostIdIndex !== -1 && pathParts.length > potentialPostIdIndex + 1) {
            postId = pathParts[potentialPostIdIndex + 1].match(/^\d+/)?.[0];
        } else {
             const lastPart = pathParts[pathParts.length - 1];
             const numericMatch = lastPart.match(/^(\d+)/);
             if(numericMatch) postId = numericMatch[1];
        }

        if (!blogIdentifier || !postId) {
            console.error(`${logPrefix} URL'den blog adı (${blogIdentifier}) veya gönderi ID'si (${postId}) düzgün ayrılamadı: ${post_url}`);
            throw new Error(`URL'den blog adı veya gönderi ID'si ayrıştırılamadı.`);
        }
        console.log(`${logPrefix} URL (içerik çekme için) ayrıştırıldı: Kaynak Blog='${blogIdentifier}', Kaynak PostID='${postId}'`);

    } catch (e) {
        console.error(`${logPrefix} URL ayrıştırma hatası (içerik çekme için): ${post_url}`, e);
        throw { statusCode: 400, message: `Geçersiz gönderi URL'si (içerik çekme için): ${e.message}` };
    }

    const config = await getTumblrAppConfig();
    const apiKey = config.oauthConsumerKey;
    if (!apiKey) throw { statusCode: 500, message: "İçerik çekilirken sunucu yapılandırma hatası." };
    
    // NPF formatında tam gönderi verisini almak için API isteği yapılır.
    const apiPath = `/blog/${blogIdentifier}/posts?id=${postId}&npf=true`;
    console.log(`${logPrefix} Tumblr'dan gönderi içeriği isteniyor. Path: ${apiPath}`);

    try {
        const response = await makeTumblrApiRequest('GET', apiPath, null, null, true, apiKey, null);

        if (response && response.posts && response.posts.length > 0) {
            const postData = response.posts[0];
            
            // Reblog anahtarı yerine, gönderinin içeriği ve etiketleri alınır.
            if (!postData.content || !Array.isArray(postData.content) || postData.content.length === 0) {
                 console.warn(`${logPrefix} Gönderi (${postData.id_string}) için içerik blokları (content_blocks) bulunamadı. Klonlanamaz.`, postData);
                 throw { statusCode: 400, message: `Gönderi (${postData.id_string}) için içerik bulunamadı. Bu gönderi klonlanamaz olabilir.` };
            }

            console.log(`${logPrefix} İçerik başarıyla çekildi: Kaynak Blog Adı: ${postData.blog_name}, Post ID: ${postData.id_string}`);
            return {
                original_url: post_url,
                content_blocks: postData.content, // En önemli kısım: İçerik blokları
                tags: postData.tags || [],         // Orijinal etiketler
                summary: postData.summary || `Klonlanan Gönderi: ${postData.blog_name}/${postData.id_string}`,
            };
        } else {
            throw { statusCode: 404, message: "Belirtilen URL için klonlanacak gönderi bulunamadı." };
        }
    } catch (error) {
        console.error(`${logPrefix} Klonlama için gönderi içeriği çekme hatası: URL: ${post_url}`, error);
        throw error;
    }
}

/**
 * DEĞİŞTİRİLDİ: processReblogSubmission -> processNewPostSubmission
 * Verilen içeriklerle yeni bir Tumblr gönderisi oluşturur.
 * Bu işlem için Kullanıcı Token'ı gerekir.
 */
async function processNewPostSubmission(params, accessToken, appUsername) {
    const logPrefix = `[PostRepublisherHandler-${appUsername}] (Yeni Gönderi)`;
    console.log(`${logPrefix} processNewPostSubmission çağrıldı.`);

    if (!appUsername) {
        throw { statusCode: 401, message: "Bu işlem için kullanıcı kimliği (appUsername) gereklidir.", needsReAuth: true };
    }
    const { content_blocks, tags_array, post_state, publish_on_iso } = params;

    if (!content_blocks || !Array.isArray(content_blocks) || content_blocks.length === 0) {
        throw { statusCode: 400, message: "Yeni gönderi oluşturmak için içerik blokları (content_blocks) gereklidir." };
    }
    // API dokümanlarına göre, gönderi durumu sağlanmazsa varsayılan 'published' olur.
    // Client'tan gelen 'published', 'queue', 'draft', 'private' değerleri doğrudan kullanılır.
    const effective_post_state = post_state || 'published';

    const users = await getUsersInternal();
    const currentUser = users.find(u => u.appUsername === appUsername);

    if (!currentUser || !currentUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef blog bilgisi kullanıcı kaydında bulunamadı.", needsReAuth: true };
    }
    const targetBlogIdentifier = currentUser.tumblrBlogId;
    console.log(`${logPrefix} Hedef blog: ${targetBlogIdentifier}`);

    const apiPath = `/blog/${targetBlogIdentifier}/posts`;
    
    // İstek gövdesi, reblog yerine yeni gönderi parametreleriyle oluşturulur.
    const requestBody = {
        content: content_blocks, // API dokümanlarına göre 'content' anahtarı kullanılır.
        state: effective_post_state,
    };

    if (tags_array && Array.isArray(tags_array) && tags_array.length > 0) {
        requestBody.tags = tags_array.join(',');
    }
    
    // 'schedule' durumu API'de 'queue' state'i ve 'publish_on' parametresi ile yönetilir.
    if (effective_post_state === 'queue' && publish_on_iso) {
        requestBody.publish_on = publish_on_iso;
    }

    console.log(`${logPrefix} Tumblr'a yeni gönderi isteği gönderiliyor. Path: ${apiPath}`);
    
    try {
        const response = await makeTumblrApiRequest('POST', apiPath, accessToken, requestBody, false, null, appUsername);
        console.log(`${logPrefix} Yeni gönderi başarıyla '${requestBody.state}' durumunda oluşturuldu. Yanıt ID: ${response.id_string || response.id || 'Bilinmiyor'}`);
        return response;
    } catch (error) {
        console.error(`${logPrefix} Yeni gönderi oluşturma hatası:`, error);
        throw error; // Hata, istemciye iletilmek üzere yeniden fırlatılır.
    }
}

module.exports = {
    fetchPostContentForRepublish,
    processNewPostSubmission,
};