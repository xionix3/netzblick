package at.xionix.netzblick;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins müssen vor super.onCreate registriert werden
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
