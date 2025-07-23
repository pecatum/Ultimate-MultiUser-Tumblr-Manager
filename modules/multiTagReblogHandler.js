// modules/multiTagReblogHandler.js
// Bu dosya, sadece "Etiketten Gelişmiş Reblog Planlayıcı" modülü için özel olarak oluşturulmuştur.
// postSchedulerHandler.js'deki düzeltilmiş mantığı içerir ve diğer modülleri etkilemez.

const { makeTumblrApiRequest } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

/**
 * Bir Tumblr gönderisini belirtilen kullanıcı adına yeniden bloglar veya sıraya ekler.
 * Bu fonksiyon, etiket modülü tarafından kullanılır.
 * @param {object} params - İstemciden gelen reblog parametreleri.
 * @param {string} accessToken - Kullanıcının erişim token'ı.
 * @param {string} appUsername - İşlemi yapan kullanıcının uygulama içi adı.
 */
async function processTagReblog(params, accessToken, appUsername) {
    const logPrefix = `[MultiTagReblogHandler-${appUsername}]`;
    console.log(`${logPrefix} processTagReblog çağrıldı. Gelen Parametreler:`, params);

    if (!appUsername) {
        throw { statusCode: 401, message: "Bu işlem için kullanıcı kimliği (appUsername) gereklidir.", needsReAuth: true };
    }

    // İstemciden gelen doğru parametre adı olan 'state' kullanılıyor.
    const { parent_tumblelog_uuid, parent_post_id, reblog_key, comment_npf, tags_array, state } = params;

    if (!parent_tumblelog_uuid || !parent_post_id || !reblog_key) {
        throw { statusCode: 400, message: "Reblog yapmak için kaynak blog UUID, kaynak gönderi ID ve reblog anahtarı gereklidir." };
    }
    
    // Gelen 'state' parametresi yoksa, varsayılan olarak 'published' kullanılır.
    const effective_post_state = state || 'published';

    const users = await getUsersInternal();
    const currentUser = users.find(u => u.appUsername === appUsername);

    if (!currentUser || !currentUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef blog bilgisi kullanıcı kaydında bulunamadı.", needsReAuth: true };
    }
    const targetBlogIdentifier = currentUser.tumblrBlogId;

    const apiPath = `/blog/${targetBlogIdentifier}/posts`;
    const requestBody = {
        parent_tumblelog_uuid: parent_tumblelog_uuid,
        parent_post_id: parent_post_id,
        reblog_key: reblog_key,
        state: effective_post_state, // Düzeltilmiş state değeri burada kullanılıyor.
    };

    if (comment_npf && Array.isArray(comment_npf) && comment_npf.length > 0) {
        requestBody.content = comment_npf;
    }

    if (tags_array && Array.isArray(tags_array) && tags_array.length > 0) {
        requestBody.tags = tags_array.join(',');
    }

    console.log(`${logPrefix} Tumblr'a reblog isteği gönderiliyor. Path: ${apiPath}, Body:`, JSON.stringify(requestBody, null, 2));

    try {
        const response = await makeTumblrApiRequest('POST', apiPath, accessToken, requestBody, false, null, appUsername);
        console.log(`${logPrefix} Gönderi başarıyla '${requestBody.state}' durumunda yeniden bloglandı. Yanıt ID: ${response.id_string || response.id || 'Bilinmiyor'}`);
        return response;
    } catch (error) {
        console.error(`${logPrefix} Yeniden bloglama hatası:`, error);
        throw error;
    }
}

module.exports = {
    processTagReblog,
};