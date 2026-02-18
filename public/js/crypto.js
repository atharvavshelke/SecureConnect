// SecureConnect - End-to-End Encryption Module
// Uses RSA-OAEP for key exchange and AES-GCM for message encryption

class SecureEncryption {
    constructor() {
        this.keyPair = null;
        this.publicKey = null;
        this.privateKey = null;
    }

    // Generate RSA key pair for the user
    async generateKeyPair() {
        try {
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256"
                },
                true,
                ["encrypt", "decrypt"]
            );

            this.publicKey = this.keyPair.publicKey;
            this.privateKey = this.keyPair.privateKey;

            // Export public key for storage
            const exportedPublicKey = await this.exportPublicKey();
            return exportedPublicKey;
        } catch (error) {
            console.error('Key generation failed:', error);
            throw error;
        }
    }

    // Export public key to string format
    async exportPublicKey() {
        const exported = await window.crypto.subtle.exportKey(
            "spki",
            this.publicKey
        );
        return this.arrayBufferToBase64(exported);
    }

    // Import public key from string format
    async importPublicKey(publicKeyString) {
        const keyBuffer = this.base64ToArrayBuffer(publicKeyString);
        return await window.crypto.subtle.importKey(
            "spki",
            keyBuffer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["encrypt"]
        );
    }

    // Export private key for storage (encrypted)
    async exportPrivateKey() {
        const exported = await window.crypto.subtle.exportKey(
            "pkcs8",
            this.privateKey
        );
        return this.arrayBufferToBase64(exported);
    }

    // Import private key from storage
    async importPrivateKey(privateKeyString) {
        const keyBuffer = this.base64ToArrayBuffer(privateKeyString);
        this.privateKey = await window.crypto.subtle.importKey(
            "pkcs8",
            keyBuffer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["decrypt"]
        );
    }

    // Encrypt message with recipient's public key (and sender's public key for history)
    async encryptMessage(message, recipientPublicKeyString, senderPublicKeyString) {
        try {
            // Generate AES key for this message
            const aesKey = await window.crypto.subtle.generateKey(
                {
                    name: "AES-GCM",
                    length: 256
                },
                true,
                ["encrypt", "decrypt"]
            );

            // Generate IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Encrypt message with AES
            const encodedMessage = new TextEncoder().encode(message);
            const encryptedMessage = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                aesKey,
                encodedMessage
            );

            // Export AES key
            const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

            // Import recipient's public key
            const recipientPublicKey = await this.importPublicKey(recipientPublicKeyString);

            // Encrypt AES key with recipient's RSA public key
            const encryptedKey = await window.crypto.subtle.encrypt(
                {
                    name: "RSA-OAEP"
                },
                recipientPublicKey,
                exportedAesKey
            );

            // Encrypt AES key with sender's RSA public key (if provided)
            let encryptedKeySelf = null;
            if (senderPublicKeyString) {
                const senderPublicKey = await this.importPublicKey(senderPublicKeyString);
                const encryptedKeySelfBuffer = await window.crypto.subtle.encrypt(
                    {
                        name: "RSA-OAEP"
                    },
                    senderPublicKey,
                    exportedAesKey
                );
                encryptedKeySelf = this.arrayBufferToBase64(encryptedKeySelfBuffer);
            }

            // Combine everything into a single package
            const encryptedPackage = {
                encryptedKey: this.arrayBufferToBase64(encryptedKey),
                encryptedKeySelf: encryptedKeySelf,
                iv: this.arrayBufferToBase64(iv),
                ciphertext: this.arrayBufferToBase64(encryptedMessage)
            };

            return JSON.stringify(encryptedPackage);
        } catch (error) {
            console.error('Encryption failed:', error);
            throw error;
        }
    }

    // Decrypt message with own private key
    async decryptMessage(encryptedPackageString) {
        if (!this.privateKey) {
            return '[Decryption failed - No private key found. Did you log in on a new device?]';
        }

        try {
            const encryptedPackage = JSON.parse(encryptedPackageString);
            let aesKeyBuffer;

            // Try to decrypt using the primary key (recipient's)
            try {
                const encryptedAesKey = this.base64ToArrayBuffer(encryptedPackage.encryptedKey);
                aesKeyBuffer = await window.crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    this.privateKey,
                    encryptedAesKey
                );
            } catch (recipientError) {
                // If that fails, and we have a self-encrypted key, try that
                if (encryptedPackage.encryptedKeySelf) {
                    try {
                        const encryptedAesKeySelf = this.base64ToArrayBuffer(encryptedPackage.encryptedKeySelf);
                        aesKeyBuffer = await window.crypto.subtle.decrypt(
                            { name: "RSA-OAEP" },
                            this.privateKey,
                            encryptedAesKeySelf
                        );
                    } catch (selfError) {
                        throw new Error('Failed to decrypt both recipient and self keys');
                    }
                } else {
                    throw recipientError;
                }
            }

            // Import AES key
            const aesKey = await window.crypto.subtle.importKey(
                "raw",
                aesKeyBuffer,
                {
                    name: "AES-GCM",
                    length: 256
                },
                false,
                ["decrypt"]
            );

            // Decrypt message
            const iv = this.base64ToArrayBuffer(encryptedPackage.iv);
            const ciphertext = this.base64ToArrayBuffer(encryptedPackage.ciphertext);

            const decryptedMessage = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                aesKey,
                ciphertext
            );

            return new TextDecoder().decode(decryptedMessage);
        } catch (error) {
            console.error('Decryption failed:', error);
            return '[Decryption failed - message corrupted or key mismatch]';
        }
    }

    // Store keys in localStorage (in production, use more secure storage)
    storeKeys(username) {
        if (this.privateKey && username) {
            this.exportPrivateKey().then(privateKeyString => {
                localStorage.setItem(`secureconnect_private_key_${username}`, privateKeyString);
            });
            this.exportPublicKey().then(publicKeyString => {
                localStorage.setItem(`secureconnect_public_key_${username}`, publicKeyString);
            });
        }
    }

    // Load keys from localStorage
    async loadKeys(username) {
        if (!username) return;

        const privateKeyString = localStorage.getItem(`secureconnect_private_key_${username}`);
        if (privateKeyString) {
            await this.importPrivateKey(privateKeyString);

            const publicKeyString = localStorage.getItem(`secureconnect_public_key_${username}`);
            if (publicKeyString) {
                this.publicKey = await this.importPublicKey(publicKeyString);
            }
        } else {
            console.log(`No keys found for user: ${username}`);
            this.privateKey = null;
            this.publicKey = null;
        }
    }

    // Helper: Convert ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Helper: Convert Base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // Derive a key from password using PBKDF2
    async deriveKeyFromPassword(password, salt) {
        const formatedPassword = new TextEncoder().encode(password);
        const importedPassword = await window.crypto.subtle.importKey(
            'raw',
            formatedPassword,
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            importedPassword,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Encrypt private key with password
    async encryptPrivateKeyWithPassword(password) {
        if (!this.privateKey) {
            throw new Error('No private key to encrypt');
        }

        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const key = await this.deriveKeyFromPassword(password, salt);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const exportedPrivateKey = await window.crypto.subtle.exportKey(
            'pkcs8',
            this.privateKey
        );

        const ciphertext = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            exportedPrivateKey
        );

        return JSON.stringify({
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv),
            ciphertext: this.arrayBufferToBase64(ciphertext)
        });
    }

    // Decrypt private key with password
    async decryptPrivateKeyWithPassword(password, encryptedBundleString) {
        try {
            const bundle = JSON.parse(encryptedBundleString);
            const salt = this.base64ToArrayBuffer(bundle.salt);
            const iv = this.base64ToArrayBuffer(bundle.iv);
            const ciphertext = this.base64ToArrayBuffer(bundle.ciphertext);

            const key = await this.deriveKeyFromPassword(password, salt);

            const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            this.privateKey = await window.crypto.subtle.importKey(
                'pkcs8',
                decryptedKeyBuffer,
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256"
                },
                true,
                ['decrypt']
            );

            return true;
        } catch (error) {
            console.error('Failed to decrypt private key:', error);
            throw new Error('Incorrect password or corrupted key');
        }
    }
}

// Global instance
const secureEncryption = new SecureEncryption();
