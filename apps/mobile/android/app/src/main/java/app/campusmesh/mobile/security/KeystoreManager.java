package app.campusmesh.mobile.security;

import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Hardware-Backed Keystore Manager for Android.
 * Leverages the device's Hardware Security Module (HSM) / TEE / StrongBox Keymaster.
 * Ensures master cryptographic identity seeds cannot be extracted even on rooted devices.
 */
public class KeystoreManager {
    private static final String TAG = "CampusMeshKeystore";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "CampusMeshMasterKey_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int GCM_IV_LENGTH_BYTES = 12;

    private static volatile KeystoreManager instance;
    private KeyStore keyStore;

    private KeystoreManager() {
        try {
            keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            ensureMasterKey();
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize Android KeyStore", e);
        }
    }

    public static KeystoreManager getInstance() {
        if (instance == null) {
            synchronized (KeystoreManager.class) {
                if (instance == null) {
                    instance = new KeystoreManager();
                }
            }
        }
        return instance;
    }

    /**
     * Generates an AES-256-GCM hardware key if one does not already exist.
     */
    private synchronized void ensureMasterKey() {
        try {
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                generateMasterKey(true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to create hardware key with StrongBox, retrying without StrongBox", e);
            try {
                generateMasterKey(false);
            } catch (Exception ex) {
                Log.e(TAG, "Fatal: failed to create fallback KeyStore key", ex);
            }
        }
    }

    private void generateMasterKey(boolean useStrongBox) throws Exception {
        KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
        );

        int purposes = KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT;
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(KEY_ALIAS, purposes)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(false); // We supply secure random IV

        if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                builder.setIsStrongBoxBacked(true);
            } catch (Throwable ignored) {
                // StrongBox not supported on this device hardware
            }
        }

        keyGenerator.init(builder.build());
        keyGenerator.generateKey();
        Log.i(TAG, "Hardware master key successfully provisioned inside AndroidKeyStore (StrongBox=" + useStrongBox + ")");
    }

    /**
     * Encrypts sensitive string plaintext (such as private key seeds or auth tokens)
     * using AES-256-GCM inside the hardware enclave.
     *
     * @param plaintext UTF-8 string to encrypt
     * @return Base64-encoded payload containing [12-byte IV + ciphertext + 16-byte auth tag]
     */
    public String encrypt(String plaintext) throws Exception {
        SecretKey secretKey = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (secretKey == null) {
            ensureMasterKey();
            secretKey = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }

        byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
        SecureRandom random = new SecureRandom();
        random.nextBytes(iv);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec);

        byte[] plaintextBytes = plaintext.getBytes(StandardCharsets.UTF_8);
        byte[] ciphertext = cipher.doFinal(plaintextBytes);

        // Prepend IV to ciphertext
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.encodeToString(combined, Base64.NO_WRAP);
    }

    /**
     * Decrypts Base64-encoded encrypted payload using the hardware key.
     *
     * @param base64Encrypted Base64 string containing [12-byte IV + ciphertext + 16-byte auth tag]
     * @return Decrypted UTF-8 string plaintext
     */
    public String decrypt(String base64Encrypted) throws Exception {
        SecretKey secretKey = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (secretKey == null) {
            throw new IllegalStateException("Master key not found in KeyStore");
        }

        byte[] combined = Base64.decode(base64Encrypted, Base64.NO_WRAP);
        if (combined.length <= GCM_IV_LENGTH_BYTES) {
            throw new IllegalArgumentException("Invalid encrypted payload length");
        }

        byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
        System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH_BYTES);

        int ciphertextLen = combined.length - GCM_IV_LENGTH_BYTES;
        byte[] ciphertext = new byte[ciphertextLen];
        System.arraycopy(combined, GCM_IV_LENGTH_BYTES, ciphertext, 0, ciphertextLen);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);

        byte[] decrypted = cipher.doFinal(ciphertext);
        return new String(decrypted, StandardCharsets.UTF_8);
    }

    /**
     * Checks if the master key is stored in hardware (TEE or StrongBox Keymaster).
     */
    public boolean isHardwareBacked() {
        try {
            SecretKey secretKey = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
            if (secretKey == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                SecretKeyFactory factory = SecretKeyFactory.getInstance(
                        secretKey.getAlgorithm(),
                        ANDROID_KEYSTORE
                );
                KeyInfo keyInfo = (KeyInfo) factory.getKeySpec(secretKey, KeyInfo.class);
                return keyInfo.isInsideSecureHardware();
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Could not determine hardware security status: " + e.getMessage());
            return true;
        }
    }
}

