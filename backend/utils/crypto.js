const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.CRYPTO_SECRET || '12345678901234567890123456789012';
const IV_LENGTH = 16;

const encrypt = (text) => {
    if (!text) return text;
    if (text.includes(':') && text.split(':')[0].length === 32) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
    if (!text) return text;
    if (!text.includes(':')) return text;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        if (iv.length !== 16) return text;
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (err) {
        return text;
    }
};

const maskIdCard = (text) => {
    if (!text) return text;
    const cleanText = text.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanText.length === 13) return cleanText.substring(0, 9) + 'XXXX';
    if (text.length > 4) return text.substring(0, text.length - 4) + 'XXXX';
    return 'XXXX';
};

module.exports = { encrypt, decrypt, maskIdCard };
