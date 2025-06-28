// modules/customPostNotesHandler.js
const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils'); // serverUtils.js'nin doğru yolda olduğundan emin olun

async function getNotesForSpecificPost(params, callingUserAccessToken) { // callingUserAccessToken bu API key'li çağrı için kullanılmayacak
    // params: { blog_identifier, post_id, mode }
    if (!params.blog_identifier || !params.post_id) {
        throw { statusCode: 400, message: "Blog identifier and Post ID are required for fetching notes." };
    }

    const appConfig = await getTumblrAppConfig();
    if (!appConfig || !appConfig.oauthConsumerKey) { // oauthConsumerKey'nin API Key olarak kullanıldığını varsayıyoruz
        console.error("[CustomPostNotesHandler] Tumblr API Key (oauthConsumerKey) not found in config.xml.");
        throw { statusCode: 500, message: "Tumblr API Key not found in application configuration." };
    }
    const apiKey = appConfig.oauthConsumerKey;

    const apiPath = `/blog/${params.blog_identifier}/notes`;
    const queryData = {
        id: params.post_id,
        mode: params.mode || 'all'
        // before_timestamp: params.before_timestamp // Eğer istemci tarafı sayfalama için gönderirse
    };

    try {
        console.log(`[CustomPostNotesHandler] Fetching notes for blog '${params.blog_identifier}', post '${params.post_id}' using API Key. Mode: ${queryData.mode}`);
        // makeTumblrApiRequest'in 5. parametresi isApiKeyCall, 6. parametresi apiKey
        const notesResponse = await makeTumblrApiRequest('GET', apiPath, null, queryData, true, apiKey);
        
        // API bazen { response: { notes: [...] } } yapısında, bazen doğrudan { notes: [...] } dönebilir.
        // serverUtils.js'deki makeTumblrApiRequest zaten parsedBody.response döndürüyor.
        // Bu yüzden notesResponse'un doğrudan { notes: [], blog: {}, post: {} ... } gibi olması beklenir.
        if (notesResponse && notesResponse.notes) {
            console.log(`[CustomPostNotesHandler] Successfully fetched ${notesResponse.notes.length} notes for post ${params.post_id}.`);
            // İstemci en fazla 200 not istiyorsa ve API daha fazla döndürdüyse burada kesilebilir.
            // Ya da istemci tarafı bu kesmeyi yapar. Şimdilik tümünü döndürelim.
            // return { notes: notesResponse.notes.slice(0, 200) }; 
            return notesResponse; // notes, blog, post, total_notes gibi alanlar içerebilir
        } else {
            console.warn(`[CustomPostNotesHandler] No notes found or unexpected response structure for post ${params.post_id}. Response:`, notesResponse);
            return { notes: [] }; // Boş not dizisi döndür
        }
    } catch (error) {
        console.error(`[CustomPostNotesHandler] Error fetching notes for blog '${params.blog_identifier}', post '${params.post_id}':`, error.message, error.details || error);
        // Hata objesinin istemciye uygun şekilde iletilmesi önemli
        throw { 
            statusCode: error.statusCode || 500, 
            message: `Failed to fetch notes for post ${params.post_id}: ${error.message || 'Unknown error.'}`,
            details: error.details || error.toString()
        };
    }
}

module.exports = {
    getNotesForSpecificPost
};
