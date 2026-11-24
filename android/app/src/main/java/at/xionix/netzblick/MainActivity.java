package at.xionix.netzblick;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Kein EdgeToEdge.enable() (Empfehlung der Play Console): In 1.8.8 ausprobiert, danach sahen die Ränder oben
        // und unten falsch aus und beim Anmelden schob die Tastatur das Formular aus dem Bild. Ab Android 15 ist die App
        // ohnehin randlos, die Abstände setzt Capacitor (SystemBars, insetsHandling "css").
        // Eigene Plugins müssen vor super.onCreate registriert werden
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
