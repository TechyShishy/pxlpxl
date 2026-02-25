package com.techyshishy.pxlpxl;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileSavePlugin.class);
        super.onCreate(savedInstanceState);

        // Apply system bar insets as padding so content is never drawn behind
        // the status bar or navigation bar. This is required on Android 15+
        // (targetSdk 35+) where edge-to-edge is enforced, and continues to
        // work on Android 16+ where windowOptOutEdgeToEdgeEnforcement is gone.
        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
