// modules/submissionsHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function getBlogSubmissions(params, accessToken, appUsername) {
    const logPrefix = `[SubmissionsHandler-${appUsername}]`;
    
    const users = await require('./tokenRefresher').getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);
    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Kullanıcı veya blog ID bulunamadı." };
    }
    const blogIdentifier = targetUser.tumblrBlogId;

    const apiPath = `/blog/${blogIdentifier}/posts/submission`;
    console.log(`${logPrefix} Gelen sorular çekiliyor. Path: ${apiPath}`);
    try {
        // API'den gelen ham veriyi görmek için filter=raw parametresini ekleyelim.
        const response = await makeTumblrApiRequest('GET', apiPath, accessToken, { filter: 'raw' }, false, null, appUsername);
        
        // --- YENİ: Ham veriyi sunucu konsoluna loglama ---
        // Bu log, soruyu soranın adını hangi alanda bulacağımızı anlamamıza yardımcı olacak.
        console.log(`[${logPrefix}] RAW SUBMISSION DATA for ${blogIdentifier}:`, JSON.stringify(response, null, 2));

        return response.posts || response || [];
    } catch (error) {
        if (error.statusCode === 404) {
            console.log(`${logPrefix} Gelen soru bulunamadı (404), boş dizi dönülüyor.`);
            return [];
        }
        console.error(`${logPrefix} Gelen soruları çekerken hata:`, error);
        throw error;
    }
}

module.exports = { getBlogSubmissions };
