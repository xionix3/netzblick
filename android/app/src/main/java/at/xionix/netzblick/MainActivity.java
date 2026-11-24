package at.xionix.netzblick;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Randlos auf allen Android-Versionen, nicht erst ab 15 (Hinweis der Play Console).
        // Die Abstände zu Status- und Navigationsleiste setzt Capacitor (SystemBars, insetsHandling "css").
        EdgeToEdge.enable(this);
        // Eigene Plugins müssen vor super.onCreate registriert werden
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
