// modules/taggedPostHandler.js

const serverUtils = require('./serverUtils');

/**
 * Belirtilen bir etikete sahip gönderileri Tumblr API'sinden çeker.
 * Bu fonksiyon, ana sunucu tarafından çağrılır.
 * @param {object} params - İstemciden gelen parametreler. { tag, before, limit } içermelidir.
 * @returns {Promise<object>} Tumblr API'sinden gelen gönderi verisi.
 */
async function fetchTaggedPosts(params) {
    console.log(`[TaggedPostHandler] fetchTaggedPosts fonksiyonu çalıştırılıyor... Parametreler:`, params);

    try {
        // Gerekli yapılandırmayı (API Key) al
        const appConfig = await serverUtils.getTumblrAppConfig();

        // Parametre kontrolü
        if (!params || !params.tag) {
            // Hata fırlatmak, ana sunucunun hatayı yakalamasını sağlar
            throw new Error("Etiket (tag) parametresi eksik.");
        }

        // serverUtils'i kullanarak Tumblr API'sine isteği yap
        const result = await serverUtils.makeTumblrApiRequest(
            'GET',                          // Metot
            '/tagged',                      // API Yolu
            null,                           // AccessToken (gerekmiyor)
            {                               // GET parametreleri
                tag: params.tag,
                before: params.before,
                limit: params.limit || 20
            },
            true,                           // Bu bir API Key çağrısıdır (isApiKeyCall)
            appConfig.oauthConsumerKey,     // API Anahtarı
            null                            // appUsername (gerekmiyor)
        );

        // Başarılı sonucu döndür
        return result;

    } catch (error) {
        console.error(`[TaggedPostHandler] Etiketlenmiş gönderiler çekilirken hata oluştu:`, error.message);
        // Hatayı yukarıya, ana sunucuya fırlat ki istemciye doğru bir yanıt gönderilebilsin.
        throw error;
    }
}

// Bu fonksiyonu dışa aktararak ana sunucunun kullanmasını sağla
module.exports = {
    fetchTaggedPosts
};