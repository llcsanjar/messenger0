// Helper functions for Base64 and Uint8Array conversions
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

export async function generateKeys() {
  // Агар аллакай вуҷуд дошта бошад
  const existingPublicKey = localStorage.getItem("public_key")
  if (existingPublicKey) {
    return
  }

  // RSA-OAEP key pair
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  )

  // Export public key
  const publicKey = await window.crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  )

  // Export private key
  const privateKey = await window.crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  )

  // Convert ArrayBuffer → Base64
  const publicKeyBase64 = uint8ArrayToBase64(new Uint8Array(publicKey))
  const privateKeyBase64 = uint8ArrayToBase64(new Uint8Array(privateKey))

  // Save
  localStorage.setItem("public_key", publicKeyBase64)
  localStorage.setItem("private_key", privateKeyBase64)
}

export async function importPublicKey(pemBase64) {
  const binaryDer = base64ToUint8Array(pemBase64);
  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKey(pemBase64) {
  const binaryDer = base64ToUint8Array(pemBase64);
  return await window.crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

export async function encryptMessage(text, recipientPublicKeyBase64) {
  try {
    const senderPublicKeyBase64 = localStorage.getItem("public_key");
    if (!senderPublicKeyBase64) {
      throw new Error("Sender public key not found in localStorage");
    }

    // 1. Generate random AES-GCM 256-bit key
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );

    // 2. Encrypt text with AES key
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      encodedText
    );

    // 3. Export AES key to raw bytes
    const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);

    // 4. Import recipient and sender public keys
    const recipientPubKey = await importPublicKey(recipientPublicKeyBase64);
    const senderPubKey = await importPublicKey(senderPublicKeyBase64);

    // 5. Encrypt AES key bytes with both RSA public keys
    const encryptedKeyRecipient = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      recipientPubKey,
      aesKeyRaw
    );

    const encryptedKeySender = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      senderPubKey,
      aesKeyRaw
    );

    // 6. Convert everything to Base64
    return {
      text: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
      iv: uint8ArrayToBase64(iv),
      sender_encrypted_key: uint8ArrayToBase64(new Uint8Array(encryptedKeySender)),
      receiver_encrypted_key: uint8ArrayToBase64(new Uint8Array(encryptedKeyRecipient)),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw error;
  }
}

export async function decryptMessage(ciphertextBase64, ivBase64, encryptedKeyBase64) {
  try {
    if (!ciphertextBase64 || !ivBase64 || !encryptedKeyBase64) {
      return ciphertextBase64;
    }

    const privateKeyBase64 = localStorage.getItem("private_key");
    if (!privateKeyBase64) {
      return "[Паёми рамзгузоришуда (Калид дар ин дастгоҳ ёфт нашуд)]";
    }

    const privateKey = await importPrivateKey(privateKeyBase64);
    const encryptedKey = base64ToUint8Array(encryptedKeyBase64);

    // Decrypt the AES key
    const aesKeyRaw = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      encryptedKey
    );

    // Import the AES key
    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      aesKeyRaw,
      {
        name: "AES-GCM",
      },
      true,
      ["decrypt"]
    );

    // Decrypt the ciphertext
    const ciphertext = base64ToUint8Array(ciphertextBase64);
    const iv = base64ToUint8Array(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption error:", error);
    return "[Хатогии кушодани рамзи паём]";
  }
}

// Encrypt audio blob using AES-GCM
export async function encryptAudioBlob(audioBlob, recipientPublicKeyBase64) {
  try {
    const senderPublicKeyBase64 = localStorage.getItem("public_key");
    if (!senderPublicKeyBase64) {
      throw new Error("Sender public key not found in localStorage");
    }

    // 1. Generate random AES-GCM 256-bit key
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );

    // 2. Convert blob to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();

    // 3. Encrypt audio data with AES key
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      arrayBuffer
    );

    // 4. Export AES key to raw bytes
    const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);

    // 5. Import recipient and sender public keys
    const recipientPubKey = await importPublicKey(recipientPublicKeyBase64);
    const senderPubKey = await importPublicKey(senderPublicKeyBase64);

    // 6. Encrypt AES key bytes with both RSA public keys
    const encryptedKeyRecipient = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      recipientPubKey,
      aesKeyRaw
    );

    const encryptedKeySender = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      senderPubKey,
      aesKeyRaw
    );

    // 7. Convert everything to Base64
    return {
      encryptedData: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
      iv: uint8ArrayToBase64(iv),
      sender_encrypted_key: uint8ArrayToBase64(new Uint8Array(encryptedKeySender)),
      receiver_encrypted_key: uint8ArrayToBase64(new Uint8Array(encryptedKeyRecipient)),
    };
  } catch (error) {
    console.error("Audio encryption error:", error);
    throw error;
  }
}

// Decrypt audio blob using AES-GCM
export async function decryptAudioBlob(encryptedDataBase64, ivBase64, encryptedKeyBase64) {
  try {
    if (!encryptedDataBase64 || !ivBase64 || !encryptedKeyBase64) {
      throw new Error("Missing required parameters for audio decryption");
    }

    const privateKeyBase64 = localStorage.getItem("private_key");
    if (!privateKeyBase64) {
      throw new Error("Private key not found in localStorage");
    }

    const privateKey = await importPrivateKey(privateKeyBase64);
    const encryptedKey = base64ToUint8Array(encryptedKeyBase64);

    // Decrypt the AES key
    const aesKeyRaw = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      encryptedKey
    );

    // Import the AES key
    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      aesKeyRaw,
      {
        name: "AES-GCM",
      },
      true,
      ["decrypt"]
    );

    // Decrypt the audio data
    const encryptedData = base64ToUint8Array(encryptedDataBase64);
    const iv = base64ToUint8Array(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      encryptedData
    );

    // Convert back to Blob
    return new Blob([decryptedBuffer], { type: 'audio/webm' });
  } catch (error) {
    console.error("Audio decryption error:", error);
    throw error;
  }
}
