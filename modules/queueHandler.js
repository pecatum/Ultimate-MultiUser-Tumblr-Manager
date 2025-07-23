// modules/queueHandler.js
// DÜZELTME: Gerekli modüllerin her ikisi de aynı 'modules' klasöründe olduğu için,
// dosya yolları './' ile başlamalıdır.
const { makeTumblrApiRequest } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

/**
 * Belirtilen bir kullanıcının gönderi kuyruğunu karıştırır.
 * @param {object} params - Gelen parametreler (bu işlem için boş).
 * @param {string} accessToken - Kullanıcının erişim token'ı.
 * @param {string} appUsername - İşlemi yapan kullanıcının uygulama içi adı.
 */
async function shuffleQueue(params, accessToken, appUsername) {
    const logPrefix = `[QueueHandler-${appUsername}]`;
    console.log(`${logPrefix} shuffleQueue çağrıldı.`);

    if (!appUsername || !accessToken) {
        throw { statusCode: 401, message: "Kuyruk karıştırma işlemi için kullanıcı girişi gereklidir.", needsReAuth: true };
    }

    const users = await getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);
    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Kullanıcı veya hedef blog bilgisi bulunamadı." };
    }
    const blogIdentifier = targetUser.tumblrBlogId;
    const apiPath = `/blog/${blogIdentifier}/posts/queue/shuffle`;

    console.log(`${logPrefix} '${blogIdentifier}' blogunun kuyruğu karıştırılıyor...`);
    
    try {
        // Tumblr API'sine yapılan POST isteğinin gövdesine boş bir obje '{}' gönderiyoruz.
        const response = await makeTumblrApiRequest('POST', apiPath, accessToken, {}, false, null, appUsername);
        
        console.log(`${logPrefix} Kuyruk başarıyla karıştırıldı.`, response);
        return { success: true, blog: blogIdentifier };
    } catch (error) {
        console.error(`${logPrefix} Kuyruk karıştırma sırasında hata:`, error);
        throw error;
    }
}

module.exports = {
    shuffleQueue
};