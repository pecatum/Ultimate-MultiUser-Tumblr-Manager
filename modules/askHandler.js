// modules/askHandler.js

const { makeTumblrApiRequest } = require('./serverUtils');
const { getUsersInternal } = require('./tokenRefresher');

/**
 * Bir "ask" (soru) gönderisini yanıtlar.
 * Önce legacy format dener, başarısız olursa NPF format'ı dener.
 */
async function answerAskWithEditNPF(params, accessToken, appUsername) {
    const logPrefix = `[AskHandler-${appUsername}]`;

    // 1. Gerekli parametreleri al
    const {
        post_id,
        answer_text,
        question_text,
        asker_name,
        state,
        tags,
        parent_tumblelog_uuid
    } = params;

    // 2. Kritik parametreleri doğrula
    if (!post_id || !answer_text) {
        throw {
            statusCode: 400,
            message: "Bir soruyu yanıtlamak için 'post_id' ve 'answer_text' alanları zorunludur."
        };
    }

    // 3. Önce legacy format dene (en güvenilir yöntem)
    console.log(`${logPrefix} Legacy format ile soru yanıtlanıyor...`);
    try {
        return await answerAskLegacy(params, accessToken, appUsername);
    } catch (legacyError) {
        console.log(`${logPrefix} Legacy format başarısız, NPF format deneniyor...`);
        console.error(`${logPrefix} Legacy error:`, legacyError);
        
        // 4. Legacy başarısız olursa NPF dene
        try {
            return await answerAskNPF(params, accessToken, appUsername);
        } catch (npfError) {
            console.error(`${logPrefix} Her iki format da başarısız oldu.`);
            throw npfError;
        }
    }
}

/**
 * Legacy format ile ask yanıtlama (öncelikli yöntem)
 */
async function answerAskLegacy(params, accessToken, appUsername) {
    const logPrefix = `[AskHandler-${appUsername}-Legacy]`;
    
    const {
        post_id,
        answer_text,
        state,
        tags
    } = params;

    const users = await getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);
    
    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef kullanıcı veya blog adı bulunamadı." };
    }
    
    const blogIdentifier = targetUser.tumblrBlogId;

    // Legacy format - sadece answer field'ı kullan
    const postData = {
        answer: answer_text.trim(),
        state: state || 'published'
    };

    // Tags varsa ekle (boş string kontrolü)
    if (tags && tags.trim() && tags.trim() !== '') {
        postData.tags = tags.trim();
    }
    
    console.log(`${logPrefix} Gönderilecek Payload:`, JSON.stringify(postData, null, 2));
    
    const response = await makeTumblrApiRequest(
        'PUT',
        `/blog/${blogIdentifier}/posts/${post_id}`,
        accessToken,
        postData,
        false,
        null,
        appUsername
    );
    
    console.log(`${logPrefix} Başarılı yanıt alındı:`, response);
    return { success: true, message: 'Soru başarıyla (legacy format ile) yanıtlandı.', response };
}

/**
 * NPF format ile ask yanıtlama (fallback)
 */
async function answerAskNPF(params, accessToken, appUsername) {
    const logPrefix = `[AskHandler-${appUsername}-NPF]`;
    
    const {
        post_id,
        answer_text,
        question_text,
        asker_name,
        state,
        tags
    } = params;

    const users = await getUsersInternal();
    const targetUser = users.find(u => u.appUsername === appUsername);
    
    if (!targetUser || !targetUser.tumblrBlogId) {
        throw { statusCode: 404, message: "Hedef kullanıcı veya blog adı bulunamadı." };
    }
    
    const blogIdentifier = targetUser.tumblrBlogId;

    // NPF format - basit yaklaşım
    const postData = {
        content: [
            {
                type: "text",
                text: answer_text.trim()
            }
        ],
        state: state || 'published'
    };

    // Tags varsa ekle (boş string kontrolü)
    if (tags && tags.trim() && tags.trim() !== '') {
        postData.tags = tags.trim();
    }

    // Eğer soru metni ve soran kişi bilgisi varsa layout ekle
    if (question_text && asker_name) {
        // Soru içeriğini de ekle
        postData.content.unshift({
            type: "text",
            text: question_text.trim()
        });

        // Layout ekle
        postData.layout = [
            {
                type: "ask",
                blocks: [0] // Soru bloğuna referans
            }
        ];

        // Attribution ekle (anonim değilse)
        if (asker_name.toLowerCase() !== 'anonymous') {
            postData.layout[0].attribution = {
                type: "blog",
                blog: {
                    name: asker_name
                }
            };
        }
    }
    
    console.log(`${logPrefix} Gönderilecek Payload:`, JSON.stringify(postData, null, 2));
    
    const response = await makeTumblrApiRequest(
        'PUT',
        `/blog/${blogIdentifier}/posts/${post_id}`,
        accessToken,
        postData,
        false,
        null,
        appUsername
    );
    
    console.log(`${logPrefix} Başarılı yanıt alındı:`, response);
    return { success: true, message: 'Soru başarıyla (NPF format ile) yanıtlandı.', response };
}

module.exports = {
    answerAsk: answerAskWithEditNPF
};