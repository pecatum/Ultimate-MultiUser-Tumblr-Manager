// modules/openAiHandler.js
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

// Read and parse XML config file directly (simple regex approach)
async function getOpenAiConfig() {
    try {
        const configPath = path.join(__dirname, '../config.xml');
        const xmlData = await fs.readFile(configPath, 'utf8');
        
        // Simple regex to extract the API key
        const apiKeyMatch = xmlData.match(/<apiKey>(.*?)<\/apiKey>/);
        if (!apiKeyMatch || !apiKeyMatch[1] || !apiKeyMatch[1].startsWith('sk-')) {
            throw new Error("OpenAI API anahtarı config.xml dosyasında bulunamadı veya geçersiz.");
        }
        
        return {
            apiKey: apiKeyMatch[1].trim()
        };
    } catch (error) {
        console.error("[OpenAiHandler] config.xml okuma hatası:", error.message);
        // Hata objesini yukarıya fırlatarak istemciye bilgi ver
        throw { statusCode: 500, message: "Sunucu yapılandırma hatası: OpenAI ayarları okunamadı." };
    }
}

function constructSystemPrompt(settings) {
    const { language, length, mood, tone, complexity } = settings;
    let prompts = [
        "You are a helpful and witty Tumblr user.",
        `Your final answer must be exclusively in ${language}. Do not use any other language.`
    ];

    // Length
    if (length <= -4) prompts.push("The answer must be extremely short, just a few words.");
    else if (length <= -2) prompts.push("Keep the answer short and to the point.");
    else if (length >= 4) prompts.push("Provide a very long, detailed, and elaborate answer.");
    else if (length >= 2) prompts.push("Provide a fairly detailed answer.");

    // Mood
    if (mood <= -4) prompts.push("Write with an angry, irritated, and annoyed tone.");
    else if (mood <= -2) prompts.push("Write with a slightly grumpy or sarcastic tone.");
    else if (mood >= 4) prompts.push("Write with a very happy, cheerful, and enthusiastic tone. Use exclamation marks!");
    else if (mood >= 2) prompts.push("Write with a friendly and happy tone.");
    
    // Tone
    if (tone <= -4) prompts.push("The overall message should be extremely negative and pessimistic.");
    else if (tone <= -2) prompts.push("The message should have a negative or critical undertone.");
    else if (tone >= 4) prompts.push("The message should be overwhelmingly positive, optimistic, and encouraging.");
    else if (tone >= 2) prompts.push("The message should have a positive and supportive undertone.");

    // Complexity
    if (complexity <= -4) prompts.push("Explain it in extremely simple terms, like you're talking to a 5-year-old. Use very basic vocabulary.");
    else if (complexity <= -2) prompts.push("Use simple, everyday language that is easy to understand.");
    else if (complexity >= 4) prompts.push("Use sophisticated, academic, and complex language. Employ jargon if appropriate and construct complex sentences.");
    else if (complexity >= 2) prompts.push("Use well-articulated, educated language.");

    if (prompts.length === 2) {
        prompts.push("Your answers should be friendly, engaging, and not too long.");
    }
    
    return prompts.join(' ');
}

async function generateAnswer(params) {
    const { question_text, language = 'Turkish', length = 0, mood = 0, tone = 0, complexity = 0 } = params;
    const logPrefix = `[OpenAiHandler]`;

    if (!question_text) {
        throw { statusCode: 400, message: "Question text is required to generate an answer." };
    }

    try {
        const config = await getOpenAiConfig();
        const apiKey = config.apiKey;

        const systemPrompt = constructSystemPrompt({ language, length, mood, tone, complexity });
        console.log(`${logPrefix} Generated System Prompt: ${systemPrompt}`);

        const postData = JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `A user on Tumblr asked me this, prepare a suitable answer: "${question_text}"`
                }
            ],
            max_tokens: 250
        });

        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };

        console.log(`${logPrefix} Sending request to OpenAI...`);
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    console.log(`${logPrefix} Received response from OpenAI. Status: ${res.statusCode}`);
                    
                    if (!data) {
                        return reject({ statusCode: 500, message: 'OpenAI returned an empty response.' });
                    }
                    
                    try {
                        const responseBody = JSON.parse(data);

                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const answer = responseBody.choices[0]?.message?.content.trim();
                            if (answer) {
                                resolve({ success: true, answer: answer });
                            } else {
                                reject({ statusCode: 500, message: 'OpenAI did not return a valid answer.' });
                            }
                        } else {
                            console.error(`${logPrefix} OpenAI API Error:`, responseBody);
                            reject({ statusCode: res.statusCode, message: 'OpenAI API Error', details: responseBody.error?.message });
                        }
                    } catch (parseError) {
                         console.error(`${logPrefix} Could not parse OpenAI response:`, data);
                         reject({ statusCode: 500, message: 'Could not process the response from OpenAI.' });
                    }
                });
            });

            req.on('error', (e) => {
                console.error(`${logPrefix} Network error during OpenAI request:`, e);
                reject({ statusCode: 500, message: 'Could not reach the OpenAI server.' });
            });

            req.write(postData);
            req.end();
        });

    } catch (error) {
        console.error(`${logPrefix} General error in generateAnswer:`, error);
        throw error;
    }
}

module.exports = { generateAnswer };