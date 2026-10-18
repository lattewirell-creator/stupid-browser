package com.emil.stupidbrowser;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Saved passwords and API keys: encrypted with a key in the Android Keystore (the phone's secure hardware),
 *  like the Mac app's Keychain key and the Electron app's safeStorage. */
final class Vault {
    private static final String ALIAS = "stupid-browser-vault";
    private Vault() {}

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return g.generateKey();
    }
    static String enc(String text) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = c.doFinal(text.getBytes(StandardCharsets.UTF_8));
        Base64.Encoder b = Base64.getEncoder();
        return "ak1:" + b.encodeToString(c.getIV()) + ":" + b.encodeToString(sealed);
    }
    static String dec(String text) {
        try {
            if (!text.startsWith("ak1:")) return null;
            String[] p = text.split(":", 3); Base64.Decoder b = Base64.getDecoder();
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, b.decode(p[1])));
            return new String(c.doFinal(b.decode(p[2])), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }
}
