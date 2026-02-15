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

    // Encrypt message with recipient's public key
    async encryptMessage(message, recipientPublicKeyString) {
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
            const encryptedAesKey = await window.crypto.subtle.encrypt(
                {
                    name: "RSA-OAEP"
                },
                recipientPublicKey,
                exportedAesKey
            );

            // Combine everything into a single package
            const encryptedPackage = {
                encryptedKey: this.arrayBufferToBase64(encryptedAesKey),
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
        try {
            const encryptedPackage = JSON.parse(encryptedPackageString);

            // Decrypt AES key with RSA private key
            const encryptedAesKey = this.base64ToArrayBuffer(encryptedPackage.encryptedKey);
            const aesKeyBuffer = await window.crypto.subtle.decrypt(
                {
                    name: "RSA-OAEP"
                },
                this.privateKey,
                encryptedAesKey
            );

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
    storeKeys() {
        if (this.privateKey) {
            this.exportPrivateKey().then(privateKeyString => {
                localStorage.setItem('secureconnect_private_key', privateKeyString);
            });
        }
    }

    // Load keys from localStorage
    async loadKeys() {
        const privateKeyString = localStorage.getItem('secureconnect_private_key');
        if (privateKeyString) {
            await this.importPrivateKey(privateKeyString);
            
            // Derive public key from private key by re-generating
            // In production, store both separately
            const publicKeyString = localStorage.getItem('secureconnect_public_key');
            if (publicKeyString) {
                this.publicKey = await this.importPublicKey(publicKeyString);
            }
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
}

// Global instance
const secureEncryption = new SecureEncryption();
